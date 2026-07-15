from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional

from .errors import ConversionError


@dataclass(frozen=True)
class SessionStoreLimits:
    ttl_seconds: int = 24 * 60 * 60
    max_records: int = 10_000
    max_total_bytes: int = 256 * 1024 * 1024
    max_record_bytes: int = 4 * 1024 * 1024
    max_chain_depth: int = 64


class ResponsesSessionStore:
    """Bounded SQLite storage for Responses ``previous_response_id`` chains."""

    def __init__(self, path: str, *, limits: Optional[SessionStoreLimits] = None, clock=time.time) -> None:
        self.path = os.path.abspath(path)
        self.limits = limits or SessionStoreLimits()
        self._clock = clock
        self._lock = threading.RLock()
        self._ready = False

    def initialize(self) -> None:
        with self._lock:
            if self._ready:
                return
            parent = os.path.dirname(self.path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with self._connection() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS response_sessions (
                        response_id TEXT PRIMARY KEY,
                        parent_response_id TEXT,
                        request_json TEXT NOT NULL,
                        response_json TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        expires_at INTEGER NOT NULL,
                        payload_bytes INTEGER NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_response_sessions_parent
                        ON response_sessions(parent_response_id);
                    CREATE INDEX IF NOT EXISTS idx_response_sessions_expiry
                        ON response_sessions(expires_at, created_at);
                    """
                )
                self._prune_locked(conn)
            self._ready = True

    def save(self, request: Dict[str, Any], response: Dict[str, Any]) -> bool:
        if request.get("store") is False:
            return False
        response_id = str(response.get("id") or "")
        if not response_id:
            raise ConversionError(
                "cannot persist a Responses session without a response id",
                code="session_invalid",
                field="response.id",
            )
        safe_request = self._sanitized_request(request)
        safe_response = self._sanitized_response(response)
        request_json = json.dumps(safe_request, ensure_ascii=False, separators=(",", ":"))
        response_json = json.dumps(safe_response, ensure_ascii=False, separators=(",", ":"))
        payload_bytes = len(request_json.encode("utf-8")) + len(response_json.encode("utf-8"))
        if payload_bytes > self.limits.max_record_bytes:
            raise ConversionError(
                f"Responses session payload exceeds {self.limits.max_record_bytes} bytes",
                code="session_too_large",
                field="response",
                details={"payload_bytes": payload_bytes, "limit_bytes": self.limits.max_record_bytes},
            )
        now = int(self._clock())
        expires_at = now + max(1, int(self.limits.ttl_seconds))
        parent_response_id = str(request.get("previous_response_id") or "") or None
        self.initialize()
        with self._lock, self._connection() as conn:
            conn.execute(
                """
                INSERT INTO response_sessions(
                    response_id, parent_response_id, request_json, response_json,
                    created_at, expires_at, payload_bytes
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(response_id) DO UPDATE SET
                    parent_response_id=excluded.parent_response_id,
                    request_json=excluded.request_json,
                    response_json=excluded.response_json,
                    created_at=excluded.created_at,
                    expires_at=excluded.expires_at,
                    payload_bytes=excluded.payload_bytes
                """,
                (
                    response_id,
                    parent_response_id,
                    request_json,
                    response_json,
                    now,
                    expires_at,
                    payload_bytes,
                ),
            )
            self._prune_locked(conn)
        return True

    def expand_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        previous_response_id = str(request.get("previous_response_id") or "")
        if not previous_response_id:
            return dict(request)
        chain = self.load_chain(previous_response_id)
        expanded_input: list[Any] = []
        for stored_request, stored_response in chain:
            expanded_input.extend(self._input_items(stored_request.get("input")))
            expanded_input.extend(self._output_items(stored_response.get("output")))
        expanded_input.extend(self._input_items(request.get("input")))
        out = dict(request)
        out["input"] = expanded_input
        out.pop("previous_response_id", None)
        return out

    def load_chain(self, response_id: str) -> list[tuple[Dict[str, Any], Dict[str, Any]]]:
        self.initialize()
        seen: set[str] = set()
        chain: list[tuple[Dict[str, Any], Dict[str, Any]]] = []
        current = str(response_id or "")
        now = int(self._clock())
        with self._lock, self._connection() as conn:
            while current:
                if current in seen:
                    raise ConversionError(
                        f"Responses session chain contains a cycle at {current}",
                        code="session_cycle",
                        field="previous_response_id",
                    )
                if len(chain) >= self.limits.max_chain_depth:
                    raise ConversionError(
                        f"Responses session chain exceeds {self.limits.max_chain_depth} records",
                        code="session_too_deep",
                        field="previous_response_id",
                    )
                seen.add(current)
                row = conn.execute(
                    """
                    SELECT parent_response_id, request_json, response_json, expires_at
                    FROM response_sessions WHERE response_id = ?
                    """,
                    (current,),
                ).fetchone()
                if row is None:
                    raise ConversionError(
                        f"Responses session not found: {current}",
                        code="session_missing",
                        field="previous_response_id",
                        details={"response_id": current},
                    )
                if int(row["expires_at"] or 0) <= now:
                    conn.execute("DELETE FROM response_sessions WHERE response_id = ?", (current,))
                    raise ConversionError(
                        f"Responses session expired: {current}",
                        code="session_expired",
                        field="previous_response_id",
                        details={"response_id": current},
                    )
                try:
                    stored_request = json.loads(row["request_json"])
                    stored_response = json.loads(row["response_json"])
                except (TypeError, json.JSONDecodeError) as exc:
                    raise ConversionError(
                        f"Responses session is corrupted: {current}",
                        code="session_corrupt",
                        field="previous_response_id",
                        details={"response_id": current},
                    ) from exc
                chain.append((stored_request, stored_response))
                current = str(row["parent_response_id"] or "")
        chain.reverse()
        return chain

    def delete(self, response_ids: Iterable[str]) -> int:
        ids = [str(value) for value in response_ids if str(value)]
        if not ids:
            return 0
        self.initialize()
        placeholders = ",".join("?" for _ in ids)
        with self._lock, self._connection() as conn:
            cursor = conn.execute(
                f"DELETE FROM response_sessions WHERE response_id IN ({placeholders})",
                ids,
            )
            return max(0, int(cursor.rowcount or 0))

    def clear(self) -> int:
        self.initialize()
        with self._lock, self._connection() as conn:
            cursor = conn.execute("DELETE FROM response_sessions")
            return max(0, int(cursor.rowcount or 0))

    def stats(self) -> Dict[str, int]:
        self.initialize()
        with self._lock, self._connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count, COALESCE(SUM(payload_bytes), 0) AS bytes FROM response_sessions"
            ).fetchone()
            return {"records": int(row["count"]), "bytes": int(row["bytes"])}

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextmanager
    def _connection(self):
        conn = self._connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _prune_locked(self, conn: sqlite3.Connection) -> None:
        now = int(self._clock())
        conn.execute("DELETE FROM response_sessions WHERE expires_at <= ?", (now,))
        count = int(conn.execute("SELECT COUNT(*) FROM response_sessions").fetchone()[0])
        if count > self.limits.max_records:
            conn.execute(
                """
                DELETE FROM response_sessions WHERE response_id IN (
                    SELECT response_id FROM response_sessions
                    ORDER BY created_at ASC, response_id ASC LIMIT ?
                )
                """,
                (count - self.limits.max_records,),
            )
        total_bytes = int(conn.execute("SELECT COALESCE(SUM(payload_bytes), 0) FROM response_sessions").fetchone()[0])
        while total_bytes > self.limits.max_total_bytes:
            row = conn.execute(
                "SELECT response_id, payload_bytes FROM response_sessions ORDER BY created_at ASC, response_id ASC LIMIT 1"
            ).fetchone()
            if row is None:
                break
            conn.execute("DELETE FROM response_sessions WHERE response_id = ?", (row["response_id"],))
            total_bytes -= int(row["payload_bytes"] or 0)

    @staticmethod
    def _input_items(value: Any) -> list[Any]:
        if value in (None, ""):
            return []
        if isinstance(value, list):
            return list(value)
        return [value]

    @staticmethod
    def _output_items(value: Any) -> list[Any]:
        return list(value) if isinstance(value, list) else []

    @staticmethod
    def _sanitized_request(request: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {
            "model",
            "input",
            "instructions",
            "previous_response_id",
            "tools",
            "tool_choice",
            "parallel_tool_calls",
            "reasoning",
            "text",
            "metadata",
            "store",
        }
        return {key: value for key, value in request.items() if key in allowed}

    @staticmethod
    def _sanitized_response(response: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {"id", "model", "status", "output", "output_text", "error", "incomplete_details"}
        return {key: value for key, value in response.items() if key in allowed}
