#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, Iterable, Optional

from routing_explain import enrich_request
from usage_accounting import add_usage_totals, empty_usage, has_usage, normalize_usage, safe_float


def empty_usage_with_cost() -> Dict[str, Any]:
    out: Dict[str, Any] = empty_usage()
    out["cost_usd"] = 0.0
    return out


class RequestHistoryStore:
    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg or {}
        self.enabled = self._enabled()
        self.path = self._db_path()
        self.retention_days = self._retention_days()
        self._lock = threading.Lock()
        self._ready = False

    def _history_cfg(self) -> Dict[str, Any]:
        obs = self.cfg.get("observability") or {}
        hist = obs.get("history") or {}
        return hist if isinstance(hist, dict) else {}

    def _enabled(self) -> bool:
        hist = self._history_cfg()
        return bool(hist.get("enabled", False))

    def _db_path(self) -> str:
        hist = self._history_cfg()
        raw = str(hist.get("path") or os.path.join("tmp", "proxy_history.sqlite3"))
        if os.path.isabs(raw):
            return raw
        return os.path.join(os.path.dirname(__file__), raw)

    def _retention_days(self) -> int:
        hist = self._history_cfg()
        try:
            return max(1, int(hist.get("retention_days", 30)))
        except Exception:
            return 30

    def _connect(self) -> sqlite3.Connection:
        if not self.path:
            raise RuntimeError("history db path is empty")
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def initialize(self) -> None:
        if not self.enabled:
            return
        with self._lock:
            if self._ready:
                return
            with self._connect() as conn:
                self._create_schema(conn)
                self._migrate_schema(conn)
            self._ready = True

    def _ensure_ready(self) -> None:
        if not self.enabled:
            return
        if self._ready:
            return
        self.initialize()

    @staticmethod
    def _create_schema(conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS requests (
              request_id TEXT PRIMARY KEY,
              client_format TEXT NOT NULL DEFAULT '',
              endpoint TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL DEFAULT '',
              stream INTEGER NOT NULL DEFAULT 0,
              path TEXT NOT NULL DEFAULT '',
              status_code INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT '',
              duration_ms INTEGER NOT NULL DEFAULT 0,
              first_byte_ms INTEGER NOT NULL DEFAULT 0,
              input_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              total_tokens INTEGER NOT NULL DEFAULT 0,
              cost_usd REAL NOT NULL DEFAULT 0,
              started_at INTEGER NOT NULL DEFAULT 0,
              finished_at INTEGER NOT NULL DEFAULT 0,
              error TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS attempts (
              request_id TEXT NOT NULL,
              attempt_no INTEGER NOT NULL DEFAULT 0,
              provider TEXT NOT NULL DEFAULT '',
              key_index INTEGER NOT NULL DEFAULT 0,
              key_masked TEXT NOT NULL DEFAULT '',
              key_id TEXT NOT NULL DEFAULT '',
              provider_model TEXT NOT NULL DEFAULT '',
              upstream_format TEXT NOT NULL DEFAULT '',
              outcome TEXT NOT NULL DEFAULT '',
              error_type TEXT NOT NULL DEFAULT '',
              reason TEXT NOT NULL DEFAULT '',
              http_status INTEGER,
              diagnostic_stage TEXT NOT NULL DEFAULT '',
              upstream_error_summary TEXT NOT NULL DEFAULT '',
              upstream_error_type TEXT NOT NULL DEFAULT '',
              upstream_error_code TEXT NOT NULL DEFAULT '',
              upstream_error_param TEXT NOT NULL DEFAULT '',
              input_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              total_tokens INTEGER NOT NULL DEFAULT 0,
              cost_usd REAL NOT NULL DEFAULT 0,
              PRIMARY KEY (request_id, attempt_no, provider, key_index, upstream_format),
              FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_requests_finished_at ON requests(finished_at DESC);
            CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
            CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);
            CREATE INDEX IF NOT EXISTS idx_attempts_provider ON attempts(provider);
            CREATE INDEX IF NOT EXISTS idx_attempts_upstream_format ON attempts(upstream_format);
            CREATE INDEX IF NOT EXISTS idx_attempts_error_type ON attempts(error_type);
            CREATE INDEX IF NOT EXISTS idx_attempts_reason ON attempts(reason);
            CREATE INDEX IF NOT EXISTS idx_attempts_http_status ON attempts(http_status);
            """
        )

    @staticmethod
    def _migrate_schema(conn: sqlite3.Connection) -> None:
        RequestHistoryStore._ensure_columns(
            conn,
            "requests",
            {
                "input_tokens": "INTEGER NOT NULL DEFAULT 0",
                "output_tokens": "INTEGER NOT NULL DEFAULT 0",
                "total_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cost_usd": "REAL NOT NULL DEFAULT 0",
                "first_byte_ms": "INTEGER NOT NULL DEFAULT 0",
            },
        )
        RequestHistoryStore._ensure_columns(
            conn,
            "attempts",
            {
                "input_tokens": "INTEGER NOT NULL DEFAULT 0",
                "output_tokens": "INTEGER NOT NULL DEFAULT 0",
                "total_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cost_usd": "REAL NOT NULL DEFAULT 0",
                "diagnostic_stage": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_summary": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_type": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_code": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_param": "TEXT NOT NULL DEFAULT ''",
            },
        )

    @staticmethod
    def _ensure_columns(conn: sqlite3.Connection, table: str, columns: Dict[str, str]) -> None:
        existing = {str(row["name"]) for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for name, ddl in columns.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")

    def record_request(self, item: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        try:
            self._ensure_ready()
            with self._lock:
                with self._connect() as conn:
                    self._insert_request(conn, item)
                    self._prune_locked(conn)
        except Exception:
            return

    def _insert_request(self, conn: sqlite3.Connection, item: Dict[str, Any]) -> None:
        request_id = str(item.get("request_id") or "")
        if not request_id:
            return
        status_code = int(item.get("status_code") or 0)
        status = "success" if status_code < 400 else "failed"
        finished_at = int(item.get("finished_at") or time.time())
        duration_ms = int(item.get("duration_ms") or 0)
        first_byte_ms = int(item.get("first_byte_ms") or 0)
        started_at = int(item.get("started_at") or max(0, finished_at - max(0, duration_ms // 1000)))
        usage_totals = normalize_usage(item.get("usage") or item)
        cost_usd = safe_float(item.get("cost_usd"))
        conn.execute(
            """
            INSERT OR REPLACE INTO requests (
              request_id, client_format, endpoint, model, stream, path,
              status_code, status, duration_ms, first_byte_ms, input_tokens, output_tokens,
              total_tokens, cost_usd, started_at, finished_at, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                str(item.get("client_format") or "unknown"),
                str(item.get("endpoint") or "unknown"),
                str(item.get("model") or ""),
                1 if item.get("stream") else 0,
                str(item.get("path") or ""),
                status_code,
                status,
                max(0, duration_ms),
                max(0, first_byte_ms),
                usage_totals["input_tokens"],
                usage_totals["output_tokens"],
                usage_totals["total_tokens"],
                cost_usd,
                started_at,
                finished_at,
                str(item.get("error") or "")[:500],
            ),
        )
        conn.execute("DELETE FROM attempts WHERE request_id = ?", (request_id,))
        for attempt in item.get("attempts") or []:
            self._insert_attempt(conn, request_id, attempt)

    @staticmethod
    def _insert_attempt(conn: sqlite3.Connection, request_id: str, attempt: Dict[str, Any]) -> None:
        http_status = attempt.get("http_status")
        usage_totals = normalize_usage(attempt.get("usage") or attempt)
        cost_usd = safe_float(attempt.get("cost_usd"))
        conn.execute(
            """
            INSERT OR REPLACE INTO attempts (
              request_id, attempt_no, provider, key_index, key_masked, key_id,
              provider_model, upstream_format, outcome, error_type, reason, http_status,
              diagnostic_stage, upstream_error_summary, upstream_error_type, upstream_error_code,
              upstream_error_param, input_tokens, output_tokens, total_tokens, cost_usd
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                int(attempt.get("attempt_no") or 0),
                str(attempt.get("provider") or ""),
                int(attempt.get("key_index") or 0),
                str(attempt.get("key_masked") or ""),
                str(attempt.get("key_id") or ""),
                str(attempt.get("provider_model") or ""),
                str(attempt.get("upstream_format") or ""),
                str(attempt.get("outcome") or ""),
                str(attempt.get("error_type") or ""),
                str(attempt.get("reason") or ""),
                int(http_status) if http_status is not None else None,
                str(attempt.get("diagnostic_stage") or "")[:500],
                str(attempt.get("upstream_error_summary") or "")[:500],
                str(attempt.get("upstream_error_type") or "")[:500],
                str(attempt.get("upstream_error_code") or "")[:500],
                str(attempt.get("upstream_error_param") or "")[:500],
                usage_totals["input_tokens"],
                usage_totals["output_tokens"],
                usage_totals["total_tokens"],
                cost_usd,
            ),
        )

    def _prune_locked(self, conn: sqlite3.Connection) -> None:
        cutoff = int(time.time()) - self.retention_days * 86400
        conn.execute("DELETE FROM requests WHERE finished_at < ?", (cutoff,))

    def list_requests(
        self,
        *,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        try:
            self._ensure_ready()
            limit = max(1, min(500, int(limit)))
            offset = max(0, int(offset))
        except Exception:
            limit, offset = 50, 0
        filters = filters or {}
        try:
            where, params = self._request_where(filters)
            with self._connect() as conn:
                total = int(conn.execute(f"SELECT COUNT(*) FROM requests r {where}", params).fetchone()[0])
                rows = conn.execute(
                    f"""
                    SELECT r.*
                    FROM requests r
                    {where}
                    ORDER BY r.finished_at DESC, r.request_id DESC
                    LIMIT ? OFFSET ?
                    """,
                    [*params, limit, offset],
                ).fetchall()
                items = [self._summarize_row(conn, row) for row in rows]
            return {
                "source": "sqlite",
                "total": total,
                "limit": limit,
                "offset": offset,
                "filters": self._copy_value(filters),
                "items": items,
            }
        except Exception:
            return None

    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        rid = str(request_id or "")
        if not rid:
            return None
        try:
            self._ensure_ready()
            with self._connect() as conn:
                row = conn.execute("SELECT * FROM requests WHERE request_id = ?", (rid,)).fetchone()
                if row is None:
                    return None
                detail = self._request_from_row(row)
                detail["state"] = "finished"
                detail["attempts"] = self._attempts_for_request(conn, rid)
                return enrich_request(detail)
        except Exception:
            return None

    def timeseries(self, *, bucket_s: int = 60, buckets: int = 30) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        try:
            self._ensure_ready()
            bucket_s = max(1, int(bucket_s))
            buckets = max(1, min(240, int(buckets)))
            now = int(time.time())
            end = ((now // bucket_s) + 1) * bucket_s
            start = end - bucket_s * buckets
            series = [self._new_bucket(start + i * bucket_s, bucket_s) for i in range(buckets)]
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM requests WHERE finished_at >= ? AND finished_at < ? ORDER BY finished_at ASC",
                    (start, end),
                ).fetchall()
                for row in rows:
                    item = self._request_from_row(row)
                    item["attempts"] = self._attempts_for_request(conn, item["request_id"])
                    self._add_to_bucket(series, start, bucket_s, item)
            for bucket in series:
                count = int(bucket.get("duration_ms_count") or 0)
                total = int(bucket.get("duration_ms_total") or 0)
                bucket["duration_ms_avg"] = int(round(total / count)) if count else 0
                if bucket["duration_ms_min"] is None:
                    bucket["duration_ms_min"] = 0
                fb_count = int(bucket.get("first_byte_ms_count") or 0)
                fb_total = int(bucket.get("first_byte_ms_total") or 0)
                bucket["first_byte_ms_avg"] = int(round(fb_total / fb_count)) if fb_count else 0
                if bucket["first_byte_ms_min"] is None:
                    bucket["first_byte_ms_min"] = 0
            return {"source": "sqlite", "bucket_s": bucket_s, "buckets": series}
        except Exception:
            return None

    def clear(self) -> Dict[str, Any]:
        result = {
            "enabled": bool(self.enabled),
            "path": self.path,
            "requests_deleted": 0,
            "attempts_deleted": 0,
        }
        if not self.enabled:
            return result
        conn = None
        try:
            self._ensure_ready()
            with self._lock:
                conn = self._connect()
                attempts = conn.execute("SELECT COUNT(*) FROM attempts").fetchone()[0]
                requests = conn.execute("SELECT COUNT(*) FROM requests").fetchone()[0]
                conn.execute("DELETE FROM attempts")
                conn.execute("DELETE FROM requests")
                conn.commit()
                try:
                    conn.execute("VACUUM")
                except Exception:
                    pass
                result["attempts_deleted"] = int(attempts or 0)
                result["requests_deleted"] = int(requests or 0)
        except Exception as e:
            result["error"] = str(e)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
        return result

    def delete_requests(self, request_ids: Iterable[str]) -> Dict[str, Any]:
        ids = []
        seen = set()
        for value in request_ids or []:
            rid = str(value or "").strip()
            if not rid or rid in seen:
                continue
            seen.add(rid)
            ids.append(rid)
            if len(ids) >= 500:
                break

        result = {
            "enabled": bool(self.enabled),
            "path": self.path,
            "requested": len(ids),
            "requests_deleted": 0,
            "attempts_deleted": 0,
        }
        if not ids or not self.enabled:
            return result

        conn = None
        placeholders = ",".join("?" for _ in ids)
        try:
            self._ensure_ready()
            with self._lock:
                conn = self._connect()
                attempts = conn.execute(
                    f"SELECT COUNT(*) FROM attempts WHERE request_id IN ({placeholders})",
                    ids,
                ).fetchone()[0]
                requests = conn.execute(
                    f"SELECT COUNT(*) FROM requests WHERE request_id IN ({placeholders})",
                    ids,
                ).fetchone()[0]
                conn.execute(f"DELETE FROM requests WHERE request_id IN ({placeholders})", ids)
                conn.commit()
                result["attempts_deleted"] = int(attempts or 0)
                result["requests_deleted"] = int(requests or 0)
        except Exception as e:
            result["error"] = str(e)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
        return result

    @classmethod
    def _add_to_bucket(cls, series: list, start: int, bucket_s: int, item: Dict[str, Any]) -> None:
        finished_at = int(item.get("finished_at") or 0)
        idx = min(len(series) - 1, max(0, (finished_at - start) // bucket_s))
        bucket = series[idx]
        status_code = int(item.get("status_code") or 0)
        bucket["requests"] += 1
        if status_code < 400:
            bucket["success"] += 1
        else:
            bucket["failed"] += 1
        cls._inc_dict(bucket["by_client_format"], item.get("client_format") or "unknown")
        cls._inc_dict(bucket["by_status"], str(status_code))
        cls._inc_dict(bucket["by_model"], item.get("model") or "")
        duration_ms = max(0, int(item.get("duration_ms") or 0))
        bucket["duration_ms_count"] += 1
        bucket["duration_ms_total"] += duration_ms
        bucket["duration_ms_max"] = max(int(bucket.get("duration_ms_max") or 0), duration_ms)
        if bucket["duration_ms_min"] is None:
            bucket["duration_ms_min"] = duration_ms
        else:
            bucket["duration_ms_min"] = min(int(bucket["duration_ms_min"]), duration_ms)
        first_byte_ms = max(0, int(item.get("first_byte_ms") or 0))
        if first_byte_ms > 0:
            bucket["first_byte_ms_count"] += 1
            bucket["first_byte_ms_total"] += first_byte_ms
            bucket["first_byte_ms_max"] = max(int(bucket.get("first_byte_ms_max") or 0), first_byte_ms)
            if bucket["first_byte_ms_min"] is None:
                bucket["first_byte_ms_min"] = first_byte_ms
            else:
                bucket["first_byte_ms_min"] = min(int(bucket["first_byte_ms_min"]), first_byte_ms)
        usage_totals = normalize_usage(item.get("usage") or item)
        if has_usage(usage_totals):
            cost_usd = safe_float(item.get("cost_usd"))
            add_usage_totals(bucket["usage"], usage_totals, cost_usd=cost_usd)
            model_usage = bucket["by_model_usage"].setdefault(item.get("model") or "", empty_usage_with_cost())
            add_usage_totals(model_usage, usage_totals, cost_usd=cost_usd)
        for attempt in item.get("attempts") or []:
            cls._inc_dict(bucket["by_provider_attempts"], attempt.get("provider") or "unknown")
            cls._inc_dict(bucket["by_upstream_format_attempts"], attempt.get("upstream_format") or "unknown")
            cls._inc_nested_attempt(bucket["by_provider"], attempt.get("provider") or "unknown", attempt)
            cls._inc_nested_attempt(bucket["by_upstream_format"], attempt.get("upstream_format") or "unknown", attempt)
            if attempt.get("error_type"):
                cls._inc_dict(bucket["by_error_type"], attempt.get("error_type"))
            if attempt.get("reason"):
                cls._inc_dict(bucket["by_failure_reason"], attempt.get("reason"))
            if attempt.get("http_status") is not None:
                cls._inc_dict(bucket["by_attempt_http_status"], str(int(attempt.get("http_status") or 0)))

    def _request_where(self, filters: Dict[str, Any]) -> tuple[str, list]:
        clauses = []
        params = []
        self._add_eq_filter(clauses, params, "r.status", filters.get("status"))
        self._add_eq_filter(clauses, params, "r.client_format", filters.get("client_format"))
        self._add_eq_filter(clauses, params, "r.endpoint", filters.get("endpoint"))
        self._add_eq_filter(clauses, params, "r.model", filters.get("model"))
        self._add_eq_filter(clauses, params, "r.status_code", filters.get("status_code"))

        attempt_filters = {
            "provider": ("a.provider", filters.get("provider")),
            "upstream_format": ("a.upstream_format", filters.get("upstream_format")),
            "error_type": ("a.error_type", filters.get("error_type")),
            "reason": ("a.reason", filters.get("failure_reason") or filters.get("reason")),
            "http_status": ("a.http_status", filters.get("http_status")),
        }
        for _name, (column, value) in attempt_filters.items():
            value = str(value or "").strip()
            if not value:
                continue
            clauses.append(
                f"EXISTS (SELECT 1 FROM attempts a WHERE a.request_id = r.request_id AND {column} = ?)"
            )
            params.append(value)

        if not clauses:
            return "", []
        return "WHERE " + " AND ".join(clauses), params

    @staticmethod
    def _add_eq_filter(clauses: list, params: list, column: str, value: Any) -> None:
        value = str(value or "").strip()
        if not value:
            return
        clauses.append(f"{column} = ?")
        params.append(value)

    def _summarize_row(self, conn: sqlite3.Connection, row: sqlite3.Row) -> Dict[str, Any]:
        item = self._request_from_row(row)
        item["attempts"] = self._attempts_for_request(conn, item["request_id"])
        return self._summarize_request(item)

    @staticmethod
    def _request_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        out = {
            "request_id": row["request_id"],
            "client_format": row["client_format"],
            "endpoint": row["endpoint"],
            "model": row["model"],
            "stream": bool(row["stream"]),
            "path": row["path"],
            "status_code": int(row["status_code"] or 0),
            "status": row["status"],
            "duration_ms": int(row["duration_ms"] or 0),
            "first_byte_ms": int(row["first_byte_ms"] or 0),
            "usage": {
                "input_tokens": int(row["input_tokens"] or 0),
                "output_tokens": int(row["output_tokens"] or 0),
                "total_tokens": int(row["total_tokens"] or 0),
            },
            "input_tokens": int(row["input_tokens"] or 0),
            "output_tokens": int(row["output_tokens"] or 0),
            "total_tokens": int(row["total_tokens"] or 0),
            "cost_usd": round(float(row["cost_usd"] or 0), 10),
            "started_at": int(row["started_at"] or 0),
            "finished_at": int(row["finished_at"] or 0),
            "attempts": [],
        }
        if row["error"]:
            out["error"] = str(row["error"])[:500]
        return out

    @staticmethod
    def _attempts_for_request(conn: sqlite3.Connection, request_id: str) -> list:
        rows = conn.execute(
            """
            SELECT *
            FROM attempts
            WHERE request_id = ?
            ORDER BY attempt_no ASC, provider ASC, key_index ASC
            """,
            (request_id,),
        ).fetchall()
        attempts = []
        for row in rows:
            item = {
                "attempt_no": int(row["attempt_no"] or 0),
                "provider": row["provider"],
                "key_index": int(row["key_index"] or 0),
                "provider_model": row["provider_model"],
                "upstream_format": row["upstream_format"],
                "outcome": row["outcome"],
            }
            for key in (
                "key_masked",
                "key_id",
                "error_type",
                "reason",
                "diagnostic_stage",
                "upstream_error_summary",
                "upstream_error_type",
                "upstream_error_code",
                "upstream_error_param",
            ):
                if row[key]:
                    item[key] = row[key]
            if row["http_status"] is not None:
                item["http_status"] = int(row["http_status"])
            usage_totals = {
                "input_tokens": int(row["input_tokens"] or 0),
                "output_tokens": int(row["output_tokens"] or 0),
                "total_tokens": int(row["total_tokens"] or 0),
            }
            if has_usage(usage_totals):
                item["usage"] = usage_totals
                item["input_tokens"] = usage_totals["input_tokens"]
                item["output_tokens"] = usage_totals["output_tokens"]
                item["total_tokens"] = usage_totals["total_tokens"]
                item["cost_usd"] = round(float(row["cost_usd"] or 0), 10)
            attempts.append(item)
        return attempts

    @classmethod
    def _summarize_request(cls, item: Dict[str, Any]) -> Dict[str, Any]:
        attempts = list(item.get("attempts") or [])
        status_code = int(item.get("status_code") or 0)
        out = {
            "request_id": item.get("request_id"),
            "client_format": item.get("client_format", "unknown"),
            "endpoint": item.get("endpoint", "unknown"),
            "model": item.get("model", ""),
            "stream": bool(item.get("stream", False)),
            "path": item.get("path", ""),
            "status_code": status_code,
            "status": "success" if status_code < 400 else "failed",
            "duration_ms": int(item.get("duration_ms") or 0),
            "first_byte_ms": int(item.get("first_byte_ms") or 0),
            "finished_at": int(item.get("finished_at") or 0),
            "attempts_count": len(attempts),
            "providers": cls._unique_sorted(a.get("provider") for a in attempts),
            "upstream_formats": cls._unique_sorted(a.get("upstream_format") for a in attempts),
            "error_types": cls._unique_sorted(a.get("error_type") for a in attempts if a.get("error_type")),
            "failure_reasons": cls._unique_sorted(a.get("reason") for a in attempts if a.get("reason")),
            "attempt_http_statuses": cls._unique_sorted(
                str(a.get("http_status")) for a in attempts if a.get("http_status") is not None
            ),
            "attempt_outcomes": cls._unique_sorted(a.get("outcome") for a in attempts if a.get("outcome")),
        }
        usage_totals = normalize_usage(item.get("usage") or item)
        if has_usage(usage_totals):
            out["usage"] = usage_totals
            out["input_tokens"] = usage_totals["input_tokens"]
            out["output_tokens"] = usage_totals["output_tokens"]
            out["total_tokens"] = usage_totals["total_tokens"]
            out["cost_usd"] = round(safe_float(item.get("cost_usd")), 10)
        if item.get("error"):
            out["error"] = str(item.get("error"))[:500]
        out["routing_summary"] = enrich_request(item)["routing_summary"]
        return out

    @staticmethod
    def _new_bucket(start: int, bucket_s: int) -> Dict[str, Any]:
        return {
            "start": int(start),
            "end": int(start + bucket_s),
            "requests": 0,
            "success": 0,
            "failed": 0,
            "duration_ms_count": 0,
            "duration_ms_total": 0,
            "duration_ms_avg": 0,
            "duration_ms_max": 0,
            "duration_ms_min": None,
            "first_byte_ms_count": 0,
            "first_byte_ms_total": 0,
            "first_byte_ms_avg": 0,
            "first_byte_ms_max": 0,
            "first_byte_ms_min": None,
            "by_client_format": {},
            "by_status": {},
            "by_model": {},
            "by_provider_attempts": {},
            "by_upstream_format_attempts": {},
            "by_provider": {},
            "by_upstream_format": {},
            "by_error_type": {},
            "by_failure_reason": {},
            "by_attempt_http_status": {},
            "usage": empty_usage_with_cost(),
            "by_model_usage": {},
        }

    @classmethod
    def _inc_nested_attempt(cls, root: Dict[str, Any], key: str, attempt: Dict[str, Any]) -> None:
        entry = root.setdefault(
            str(key),
            {
                "attempts": 0,
                "success": 0,
                "failed": 0,
                "by_error_type": {},
                "by_failure_reason": {},
                "by_http_status": {},
                "usage": empty_usage_with_cost(),
            },
        )
        outcome = str(attempt.get("outcome") or "")
        entry["attempts"] += 1
        if outcome == "success":
            entry["success"] += 1
        else:
            entry["failed"] += 1
        if attempt.get("error_type"):
            cls._inc_dict(entry["by_error_type"], attempt.get("error_type"))
        if attempt.get("reason"):
            cls._inc_dict(entry["by_failure_reason"], attempt.get("reason"))
        if attempt.get("http_status") is not None:
            cls._inc_dict(entry["by_http_status"], str(int(attempt.get("http_status") or 0)))
        usage_totals = normalize_usage(attempt.get("usage") or attempt)
        if has_usage(usage_totals):
            add_usage_totals(entry["usage"], usage_totals, cost_usd=attempt.get("cost_usd"))

    @staticmethod
    def _inc_dict(d: Dict[str, int], key: str) -> None:
        d[str(key)] = int(d.get(str(key), 0)) + 1

    @staticmethod
    def _unique_sorted(values: Iterable[Any]) -> list:
        seen = set()
        out = []
        for value in values:
            if not value:
                continue
            text = str(value)
            if text in seen:
                continue
            seen.add(text)
            out.append(text)
        return sorted(out)

    @classmethod
    def _copy_value(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return {k: cls._copy_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [cls._copy_value(v) for v in value]
        return value
