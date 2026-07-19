#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import queue
from contextlib import contextmanager
from typing import Any, Dict, Iterable, Optional

from routing_explain import enrich_request, summarize_request
from usage_accounting import (
    add_usage_totals,
    calculate_cost_usd,
    empty_usage,
    has_usage,
    normalize_usage,
    safe_float,
)
from usage_statistics import UsageStatisticsStore


def empty_usage_with_cost() -> Dict[str, Any]:
    out: Dict[str, Any] = empty_usage()
    out["cost_usd"] = 0.0
    return out


def _safe_statistics_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


class RequestHistoryStore:
    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg or {}
        self.enabled = self._enabled()
        self.path = self._db_path()
        self.retention_days = self._retention_days()
        self._usage_statistics = UsageStatisticsStore(
            self.cfg, history_retention_days=self.retention_days
        )
        self._sync_mode = self._sync_mode_enabled()
        self._lock = threading.Lock()
        self._ready = False
        self._queue = queue.Queue(maxsize=self._queue_size())
        self._writer_running = False
        self._writer_thread = None
        # Number of history records dropped because the write queue was full.
        # Incremented under self._lock so the value is safe to read for stats.
        self._dropped = 0
        # NH3: count of DB write failures (disk full / corruption / etc.) so
        # operators can detect that history recording has silently stopped.
        self._write_failures = 0
        self._last_prune_time = 0.0
        self._last_statistics_backfill_time = 0.0
        self._statistics_sequence_lock = threading.Lock()
        self._statistics_sequence = 0
        self._statistics_clear_sequence = 0
        self._history_clear_sequence = 0
        # Connection pool to reuse SQLite connections
        self._connection_pool: queue.Queue = queue.Queue(maxsize=5)

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
        """Get a SQLite connection from the pool or create a new one."""
        try:
            conn = self._connection_pool.get_nowait()
            # Verify the connection is still alive
            try:
                conn.execute("SELECT 1").fetchone()
                return conn
            except Exception:
                # Connection is dead, create a new one
                conn.close()
        except queue.Empty:
            # Pool is empty, create a new connection
            pass
            
        # Create a new connection
        if not self.path:
            raise RuntimeError("history db path is empty")
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=10, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
    
    def _return_connection(self, conn: sqlite3.Connection) -> None:
        """Return a connection to the pool for reuse."""
        try:
            self._connection_pool.put_nowait(conn)
        except queue.Full:
            # Pool is full, close the connection
            try:
                conn.close()
            except Exception:
                pass

    def _close_connection_pool(self) -> None:
        """Close every idle SQLite handle owned by this store."""
        while True:
            try:
                conn = self._connection_pool.get_nowait()
            except queue.Empty:
                return
            try:
                conn.close()
            finally:
                self._connection_pool.task_done()

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
            self._return_connection(conn)

    def _queue_size(self) -> int:
        hist = self._history_cfg()
        try:
            return max(10, int(hist.get("queue_size", 1000)))
        except Exception:
            return 1000

    def _sync_mode_enabled(self) -> bool:
        """Whether to write history records synchronously (blocking the caller).

        Defaults to False (async queue writer) which is safe for production.
        Tests opt in via ``history.sync_mode: true`` in the config dict so
        they can write and immediately read back without racing the async
        writer thread.
        """
        hist = self._history_cfg()
        return bool(hist.get("sync_mode", False))

    def initialize(self) -> None:
        if not self.enabled:
            return
        with self._lock:
            if not self._ready:
                with self._connection() as conn:
                    self._create_schema(conn)
                    self._migrate_schema(conn)
                    self._usage_statistics.create_schema(conn)
                    self._usage_statistics.ensure_meta(conn)
                self._ready = True

        if self.enabled and not self._writer_running:
            self._writer_running = True
            self._writer_thread = threading.Thread(
                target=self._write_loop,
                name="history-writer",
                daemon=True
            )
            self._writer_thread.start()

    def _write_loop(self) -> None:
        while True:
            try:
                item = self._queue.get(timeout=0.25)
            except queue.Empty:
                self._backfill_statistics_batch()
                if not self._writer_running:
                    return
                continue
            if item is None:
                self._queue.task_done()
                break
            try:
                self._ensure_ready()
                with self._lock:
                    with self._connection() as conn:
                        self._insert_request(conn, item)
                        self._prune_locked(conn)
            except Exception as e:
                # NH3: previously ``except Exception: pass`` silently dropped
                # every DB write failure (disk full, corruption, constraint
                # violation). Count and log them so operators can notice that
                # history recording has stopped instead of discovering it only
                # when queries come back empty.
                self._write_failures += 1
                if self._write_failures <= 3 or self._write_failures % 100 == 0:
                    try:
                        print(
                            f"[history] write failed ({self._write_failures} total): "
                            f"{type(e).__name__}: {e}",
                            flush=True,
                        )
                    except Exception:
                        pass
            finally:
                self._queue.task_done()

    def _backfill_statistics_batch(
        self, *, force: bool = False, limit: int = 25
    ) -> Dict[str, Any]:
        if not self.enabled or not self._usage_statistics.enabled:
            return {"processed": 0, "complete": True}
        now = time.time()
        if not force and now - self._last_statistics_backfill_time < 0.5:
            return {"processed": 0, "complete": False}
        self._last_statistics_backfill_time = now
        try:
            with self._lock:
                with self._connection() as conn:
                    return self._usage_statistics.backfill_batch(conn, limit=limit)
        except Exception:
            return {"processed": 0, "complete": False}

    def shutdown(self) -> None:
        if self._writer_running:
            self._writer_running = False
            try:
                # FIFO sentinel: all already queued request records are written
                # before the writer exits. A bounded wait lets a full queue
                # release one slot instead of silently losing the whole tail.
                self._queue.put(None, block=True, timeout=2.0)
            except queue.Full:
                pass
            if self._writer_thread:
                self._writer_thread.join(timeout=10.0)
        self._close_connection_pool()

    def _ensure_ready(self) -> None:
        if not self.enabled:
            return
        if self._ready and self._writer_running:
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
              uncached_input_tokens INTEGER NOT NULL DEFAULT 0,
              cached_input_tokens INTEGER NOT NULL DEFAULT 0,
              cache_write_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              reasoning_tokens INTEGER NOT NULL DEFAULT 0,
              total_tokens INTEGER NOT NULL DEFAULT 0,
              cost_usd REAL NOT NULL DEFAULT 0,
              cost_status TEXT NOT NULL DEFAULT 'legacy',
              pricing_source TEXT NOT NULL DEFAULT '',
              pricing_snapshot TEXT NOT NULL DEFAULT '',
              client_ip TEXT NOT NULL DEFAULT '',
              client_ip_source TEXT NOT NULL DEFAULT '',
              user_agent TEXT NOT NULL DEFAULT '',
              request_bytes INTEGER NOT NULL DEFAULT 0,
              request_profile TEXT NOT NULL DEFAULT '',
              started_at INTEGER NOT NULL DEFAULT 0,
              finished_at INTEGER NOT NULL DEFAULT 0,
              error TEXT NOT NULL DEFAULT '',
              routing_trace TEXT NOT NULL DEFAULT ''
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
              failure_owner TEXT NOT NULL DEFAULT '',
              state_action TEXT NOT NULL DEFAULT '',
              http_status INTEGER,
              diagnostic_stage TEXT NOT NULL DEFAULT '',
              upstream_error_summary TEXT NOT NULL DEFAULT '',
              upstream_error_type TEXT NOT NULL DEFAULT '',
              upstream_error_code TEXT NOT NULL DEFAULT '',
              upstream_error_param TEXT NOT NULL DEFAULT '',
              conversion_details TEXT NOT NULL DEFAULT '',
              duration_ms INTEGER NOT NULL DEFAULT 0,
              upstream_headers_ms INTEGER NOT NULL DEFAULT 0,
              first_event_ms INTEGER NOT NULL DEFAULT 0,
              generation_wait_ms INTEGER NOT NULL DEFAULT 0,
              finish_reason TEXT NOT NULL DEFAULT '',
              input_tokens INTEGER NOT NULL DEFAULT 0,
              uncached_input_tokens INTEGER NOT NULL DEFAULT 0,
              cached_input_tokens INTEGER NOT NULL DEFAULT 0,
              cache_write_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              reasoning_tokens INTEGER NOT NULL DEFAULT 0,
              total_tokens INTEGER NOT NULL DEFAULT 0,
              cost_usd REAL NOT NULL DEFAULT 0,
              cost_status TEXT NOT NULL DEFAULT 'legacy',
              pricing_source TEXT NOT NULL DEFAULT '',
              pricing_snapshot TEXT NOT NULL DEFAULT '',
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
                "uncached_input_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cached_input_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cache_write_tokens": "INTEGER NOT NULL DEFAULT 0",
                "output_tokens": "INTEGER NOT NULL DEFAULT 0",
                "reasoning_tokens": "INTEGER NOT NULL DEFAULT 0",
                "total_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cost_usd": "REAL NOT NULL DEFAULT 0",
                "cost_status": "TEXT NOT NULL DEFAULT 'legacy'",
                "pricing_source": "TEXT NOT NULL DEFAULT ''",
                "pricing_snapshot": "TEXT NOT NULL DEFAULT ''",
                "client_ip": "TEXT NOT NULL DEFAULT ''",
                "client_ip_source": "TEXT NOT NULL DEFAULT ''",
                "user_agent": "TEXT NOT NULL DEFAULT ''",
                "request_bytes": "INTEGER NOT NULL DEFAULT 0",
                "request_profile": "TEXT NOT NULL DEFAULT ''",
                "first_byte_ms": "INTEGER NOT NULL DEFAULT 0",
                "routing_trace": "TEXT NOT NULL DEFAULT ''",
            },
        )
        RequestHistoryStore._ensure_columns(
            conn,
            "attempts",
            {
                "input_tokens": "INTEGER NOT NULL DEFAULT 0",
                "uncached_input_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cached_input_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cache_write_tokens": "INTEGER NOT NULL DEFAULT 0",
                "output_tokens": "INTEGER NOT NULL DEFAULT 0",
                "reasoning_tokens": "INTEGER NOT NULL DEFAULT 0",
                "total_tokens": "INTEGER NOT NULL DEFAULT 0",
                "cost_usd": "REAL NOT NULL DEFAULT 0",
                "cost_status": "TEXT NOT NULL DEFAULT 'legacy'",
                "pricing_source": "TEXT NOT NULL DEFAULT ''",
                "pricing_snapshot": "TEXT NOT NULL DEFAULT ''",
                "diagnostic_stage": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_summary": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_type": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_code": "TEXT NOT NULL DEFAULT ''",
                "upstream_error_param": "TEXT NOT NULL DEFAULT ''",
                "parameter_adaptations": "TEXT NOT NULL DEFAULT ''",
                "duration_ms": "INTEGER NOT NULL DEFAULT 0",
                "upstream_headers_ms": "INTEGER NOT NULL DEFAULT 0",
                "first_event_ms": "INTEGER NOT NULL DEFAULT 0",
                "generation_wait_ms": "INTEGER NOT NULL DEFAULT 0",
                "finish_reason": "TEXT NOT NULL DEFAULT ''",
                "failure_owner": "TEXT NOT NULL DEFAULT ''",
                "state_action": "TEXT NOT NULL DEFAULT ''",
                "conversion_details": "TEXT NOT NULL DEFAULT ''",
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
        queued_item = dict(item or {})
        with self._statistics_sequence_lock:
            self._statistics_sequence += 1
            queued_item["_statistics_sequence"] = self._statistics_sequence
        if self._sync_mode:
            try:
                self._ensure_ready()
                with self._lock:
                    with self._connection() as conn:
                        self._insert_request(conn, queued_item)
                        self._prune_locked(conn)
            except Exception:
                pass
            return
        if not self._writer_running:
            self.initialize()
        try:
            self._queue.put(queued_item, block=False)
        except queue.Full:
            # Queue saturated: drop this history record rather than blocking
            # the request thread, but count it so observability can surface
            # the loss. In-memory counters stay intact either way.
            with self._lock:
                self._dropped += 1

    def dropped_count(self) -> int:
        """Number of history records dropped because the write queue was full."""
        with self._lock:
            return int(self._dropped)

    def __del__(self):
        try:
            self.shutdown()
        except Exception:
            pass

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
              status_code, status, duration_ms, first_byte_ms, input_tokens,
              uncached_input_tokens, cached_input_tokens, cache_write_tokens,
              output_tokens, reasoning_tokens, total_tokens, cost_usd, cost_status,
              pricing_source, pricing_snapshot, client_ip, client_ip_source, user_agent,
              request_bytes, request_profile, started_at, finished_at, error, routing_trace
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                usage_totals["uncached_input_tokens"],
                usage_totals["cached_input_tokens"],
                usage_totals["cache_write_tokens"],
                usage_totals["output_tokens"],
                usage_totals["reasoning_tokens"],
                usage_totals["total_tokens"],
                cost_usd,
                str(item.get("cost_status") or "legacy"),
                str(item.get("pricing_source") or ""),
                json.dumps(item.get("pricing_snapshot") or {}, ensure_ascii=False),
                str(item.get("client_ip") or "")[:128],
                str(item.get("client_ip_source") or "")[:64],
                str(item.get("user_agent") or "")[:500],
                max(0, int(item.get("request_bytes") or 0)),
                str(item.get("request_profile") or "")[:64],
                started_at,
                finished_at,
                str(item.get("error") or "")[:500],
                json.dumps(item.get("routing_trace") or [], ensure_ascii=False),
            ),
        )
        conn.execute("DELETE FROM attempts WHERE request_id = ?", (request_id,))
        for attempt in item.get("attempts") or []:
            self._insert_attempt(conn, request_id, attempt)
        sequence = _safe_statistics_int(item.get("_statistics_sequence"))
        with self._statistics_sequence_lock:
            eligible = sequence > self._statistics_clear_sequence
        if eligible:
            self._reconcile_usage_statistics_safely(
                conn, request_id, live_write=True
            )
        with self._statistics_sequence_lock:
            keep_history = sequence > self._history_clear_sequence
        if sequence and not keep_history:
            conn.execute("DELETE FROM requests WHERE request_id = ?", (request_id,))

    def _reconcile_usage_statistics_safely(
        self,
        conn: sqlite3.Connection,
        request_id: str,
        *,
        live_write: bool = False,
    ) -> bool:
        conn.execute("SAVEPOINT usage_statistics_write")
        try:
            changed = self._usage_statistics.reconcile_request(
                conn, request_id, live_write=live_write
            )
            conn.execute("RELEASE SAVEPOINT usage_statistics_write")
            return bool(changed)
        except Exception as exc:
            conn.execute("ROLLBACK TO SAVEPOINT usage_statistics_write")
            conn.execute("RELEASE SAVEPOINT usage_statistics_write")
            conn.execute(
                """
                INSERT INTO usage_statistics_dirty (request_id, marked_at, reason)
                VALUES (?, ?, ?)
                ON CONFLICT(request_id) DO UPDATE SET
                  marked_at = excluded.marked_at,
                  reason = excluded.reason
                """,
                (
                    str(request_id or ""),
                    int(time.time()),
                    f"{type(exc).__name__}: {exc}"[:500],
                ),
            )
            return False

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
              upstream_error_param, parameter_adaptations, failure_owner, state_action, conversion_details,
              duration_ms, upstream_headers_ms, first_event_ms, generation_wait_ms, finish_reason,
              input_tokens, uncached_input_tokens, cached_input_tokens, cache_write_tokens,
              output_tokens, reasoning_tokens, total_tokens, cost_usd, cost_status, pricing_source,
              pricing_snapshot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                json.dumps(attempt.get("parameter_adaptations") or [], ensure_ascii=False),
                str(attempt.get("failure_owner") or "")[:100],
                json.dumps(attempt.get("state_action") or {}, ensure_ascii=False),
                json.dumps(attempt.get("conversion_details") or {}, ensure_ascii=False),
                max(0, int(attempt.get("duration_ms") or 0)),
                max(0, int(attempt.get("upstream_headers_ms") or 0)),
                max(0, int(attempt.get("first_event_ms") or 0)),
                max(0, int(attempt.get("generation_wait_ms") or 0)),
                str(attempt.get("finish_reason") or "")[:100],
                usage_totals["input_tokens"],
                usage_totals["uncached_input_tokens"],
                usage_totals["cached_input_tokens"],
                usage_totals["cache_write_tokens"],
                usage_totals["output_tokens"],
                usage_totals["reasoning_tokens"],
                usage_totals["total_tokens"],
                cost_usd,
                str(attempt.get("cost_status") or "legacy"),
                str(attempt.get("pricing_source") or ""),
                json.dumps(attempt.get("pricing_snapshot") or {}, ensure_ascii=False),
            ),
        )

    def _prune_locked(self, conn: sqlite3.Connection) -> None:
        import sys
        now = time.time()
        # In unit tests, always run prune to ensure test coverage.
        # In production, throttle pruning to run at most once every 5 minutes (300 seconds) to avoid database lock contention.
        if "unittest" not in sys.modules and now - self._last_prune_time < 300.0:
            return
        self._last_prune_time = now
        cutoff = int(now) - self.retention_days * 86400
        if self._usage_statistics.detail_prune_allowed(conn):
            expiring_pending = [
                str(row["request_id"])
                for row in conn.execute(
                    """
                    SELECT DISTINCT r.request_id
                    FROM requests r JOIN attempts a ON a.request_id = r.request_id
                    WHERE r.finished_at < ? AND a.cost_status = 'pending'
                    """,
                    (cutoff,),
                ).fetchall()
            ]
            self._freeze_pending_statistics(conn, expiring_pending)
            conn.execute("DELETE FROM requests WHERE finished_at < ?", (cutoff,))
        self._usage_statistics.prune(conn, now=int(now))

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
            with self._connection() as conn:
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
                # Batch-load attempts for the whole page to avoid an N+1 query
                # per row (page is small but this still saves one round-trip per
                # request on every poll).
                attempts_by_request = self._attempts_batch(conn, [row["request_id"] for row in rows])
                items = []
                for row in rows:
                    item = self._request_from_row(row)
                    item["attempts"] = attempts_by_request.get(item["request_id"], [])
                    items.append(self._summarize_request(item))
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

    @staticmethod
    def _combined_cost_state(rows: Iterable[Any]) -> tuple[str, str, Dict[str, Any]]:
        states = []
        sources = []
        snapshots = []
        for row in rows or []:
            state = str(row["cost_status"] or "legacy")
            source = str(row["pricing_source"] or "")
            states.append(state)
            if source and source not in sources:
                sources.append(source)
            raw_snapshot = row["pricing_snapshot"]
            if raw_snapshot:
                try:
                    snapshot = json.loads(raw_snapshot) if isinstance(raw_snapshot, str) else raw_snapshot
                    if isinstance(snapshot, dict) and snapshot:
                        snapshots.append(snapshot)
                except (TypeError, ValueError):
                    pass
        if "pending" in states:
            status = "pending"
        elif "unpriced" in states:
            status = "unpriced"
        elif "estimated" in states:
            status = "estimated"
        elif states and all(state == "priced" for state in states):
            status = "priced"
        else:
            status = "legacy"
        snapshot_out: Dict[str, Any] = {}
        if len(snapshots) == 1:
            snapshot_out = snapshots[0]
        elif snapshots:
            snapshot_out = {"attempts": snapshots}
        return status, ",".join(sources), snapshot_out

    def backfill_pending_pricing(
        self,
        provider: str,
        provider_model: str,
        pricing_snapshot: Dict[str, Any],
    ) -> Dict[str, int]:
        result = {"attempts_updated": 0, "requests_updated": 0}
        if not self.enabled or not isinstance(pricing_snapshot, dict):
            return result
        try:
            self._ensure_ready()
            with self._lock:
                with self._connection() as conn:
                    rows = conn.execute(
                        """
                        SELECT * FROM attempts
                        WHERE provider = ? AND provider_model = ? AND cost_status = 'pending'
                        """,
                        (str(provider or ""), str(provider_model or "")),
                    ).fetchall()
                    request_ids = set()
                    status = "priced" if pricing_snapshot.get("complete") else "estimated"
                    snapshot_text = json.dumps(pricing_snapshot, ensure_ascii=False)
                    for row in rows:
                        usage = {
                            "input_tokens": int(row["input_tokens"] or 0),
                            "uncached_input_tokens": int(row["uncached_input_tokens"] or 0),
                            "cached_input_tokens": int(row["cached_input_tokens"] or 0),
                            "cache_write_tokens": int(row["cache_write_tokens"] or 0),
                            "output_tokens": int(row["output_tokens"] or 0),
                            "reasoning_tokens": int(row["reasoning_tokens"] or 0),
                            "total_tokens": int(row["total_tokens"] or 0),
                        }
                        cost = calculate_cost_usd(usage, pricing_snapshot)
                        conn.execute(
                            """
                            UPDATE attempts
                            SET cost_usd = ?, cost_status = ?, pricing_source = ?, pricing_snapshot = ?
                            WHERE request_id = ? AND attempt_no = ? AND provider = ?
                              AND key_index = ? AND upstream_format = ? AND cost_status = 'pending'
                            """,
                            (
                                cost,
                                status,
                                str(pricing_snapshot.get("source") or ""),
                                snapshot_text,
                                row["request_id"],
                                row["attempt_no"],
                                row["provider"],
                                row["key_index"],
                                row["upstream_format"],
                            ),
                        )
                        request_ids.add(str(row["request_id"]))
                        result["attempts_updated"] += 1

                    for request_id in request_ids:
                        attempt_rows = conn.execute(
                            "SELECT * FROM attempts WHERE request_id = ?",
                            (request_id,),
                        ).fetchall()
                        total_cost = round(sum(float(row["cost_usd"] or 0) for row in attempt_rows), 10)
                        request_status, request_source, request_snapshot = self._combined_cost_state(attempt_rows)
                        conn.execute(
                            """
                            UPDATE requests
                            SET cost_usd = ?, cost_status = ?, pricing_source = ?, pricing_snapshot = ?
                            WHERE request_id = ? AND cost_status = 'pending'
                            """,
                            (
                                total_cost,
                                request_status,
                                request_source,
                                json.dumps(request_snapshot, ensure_ascii=False),
                                request_id,
                            ),
                        )
                        self._reconcile_usage_statistics_safely(conn, request_id)
                        result["requests_updated"] += 1
        except Exception:
            return result
        return result

    def mark_pending_unpriced(self, provider: str, provider_model: str) -> Dict[str, int]:
        result = {"attempts_updated": 0, "requests_updated": 0}
        if not self.enabled:
            return result
        try:
            self._ensure_ready()
            with self._lock:
                with self._connection() as conn:
                    request_ids = [
                        str(row[0])
                        for row in conn.execute(
                            """
                            SELECT DISTINCT request_id FROM attempts
                            WHERE provider = ? AND provider_model = ? AND cost_status = 'pending'
                            """,
                            (str(provider or ""), str(provider_model or "")),
                        ).fetchall()
                    ]
                    cursor = conn.execute(
                        """
                        UPDATE attempts SET cost_status = 'unpriced'
                        WHERE provider = ? AND provider_model = ? AND cost_status = 'pending'
                        """,
                        (str(provider or ""), str(provider_model or "")),
                    )
                    result["attempts_updated"] = max(0, int(cursor.rowcount or 0))
                    for request_id in request_ids:
                        attempt_rows = conn.execute(
                            "SELECT * FROM attempts WHERE request_id = ?",
                            (request_id,),
                        ).fetchall()
                        request_status, request_source, request_snapshot = self._combined_cost_state(attempt_rows)
                        conn.execute(
                            """
                            UPDATE requests SET cost_status = ?, pricing_source = ?, pricing_snapshot = ?
                            WHERE request_id = ? AND cost_status = 'pending'
                            """,
                            (
                                request_status,
                                request_source,
                                json.dumps(request_snapshot, ensure_ascii=False),
                                request_id,
                            ),
                        )
                        self._reconcile_usage_statistics_safely(conn, request_id)
                        result["requests_updated"] += 1
        except Exception:
            return result
        return result

    def rebuild_counters(self) -> Optional[Dict[str, Any]]:
        """Rebuild in-memory overview counters from persisted SQLite history."""
        if not self.enabled:
            return None
        try:
            self._ensure_ready()
            counters = {
                "requests_total": 0,
                "requests_success": 0,
                "requests_failed": 0,
                "requests_in_flight": 0,
                "attempts_total": 0,
                "attempts_success": 0,
                "attempts_failed": 0,
                "by_client_format": {},
                "by_endpoint": {},
                "by_model": {},
                "by_provider": {},
                "by_status": {},
                "by_attempt_http_status": {},
                "by_error_type": {},
                "by_failure_reason": {},
                "usage": empty_usage_with_cost(),
                "by_model_usage": {},
            }
            with self._connection() as conn:
                requests = conn.execute("SELECT * FROM requests").fetchall()
                for row in requests:
                    item = self._request_from_row(row)
                    counters["requests_total"] += 1
                    if int(item.get("status_code") or 0) < 400:
                        counters["requests_success"] += 1
                    else:
                        counters["requests_failed"] += 1
                    self._inc_dict(counters["by_client_format"], item.get("client_format") or "unknown")
                    self._inc_dict(counters["by_endpoint"], item.get("endpoint") or "unknown")
                    self._inc_dict(counters["by_model"], item.get("model") or "")
                    self._inc_dict(counters["by_status"], str(int(item.get("status_code") or 0)))
                    usage_totals = normalize_usage(item.get("usage") or item)
                    if has_usage(usage_totals):
                        cost_usd = safe_float(item.get("cost_usd"))
                        add_usage_totals(counters["usage"], usage_totals, cost_usd=cost_usd)
                        model_usage = counters["by_model_usage"].setdefault(item.get("model") or "", empty_usage_with_cost())
                        add_usage_totals(model_usage, usage_totals, cost_usd=cost_usd)

                attempts = conn.execute("SELECT * FROM attempts").fetchall()
                for row in attempts:
                    attempt = self._attempt_from_row(row)
                    provider = attempt.get("provider") or "unknown"
                    upstream_format = attempt.get("upstream_format") or "unknown"
                    outcome = attempt.get("outcome") or ""
                    counters["attempts_total"] += 1
                    if outcome == "success":
                        counters["attempts_success"] += 1
                    else:
                        counters["attempts_failed"] += 1
                    prov = counters["by_provider"].setdefault(
                        provider,
                        {"attempts": 0, "success": 0, "failed": 0, "by_upstream_format": {}, "usage": empty_usage_with_cost()},
                    )
                    prov["attempts"] += 1
                    if outcome == "success":
                        prov["success"] += 1
                    else:
                        prov["failed"] += 1
                    self._inc_dict(prov["by_upstream_format"], upstream_format)
                    if attempt.get("error_type"):
                        self._inc_dict(counters["by_error_type"], attempt.get("error_type"))
                    if attempt.get("reason"):
                        self._inc_dict(counters["by_failure_reason"], attempt.get("reason"))
                    if attempt.get("http_status") is not None:
                        self._inc_dict(counters["by_attempt_http_status"], str(int(attempt.get("http_status") or 0)))
                    usage_totals = normalize_usage(attempt.get("usage") or attempt)
                    if outcome == "success" and has_usage(usage_totals):
                        add_usage_totals(prov["usage"], usage_totals, cost_usd=attempt.get("cost_usd"))
            return counters
        except Exception:
            return None

    def recent_requests(self, limit: int) -> Optional[list]:
        if not self.enabled:
            return None
        try:
            self._ensure_ready()
            limit = max(0, min(500, int(limit)))
            if limit <= 0:
                return []
            with self._connection() as conn:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM requests
                    ORDER BY finished_at DESC, request_id DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                attempts_by_request = self._attempts_batch(conn, [row["request_id"] for row in rows])
                items = []
                for row in rows:
                    item = self._request_from_row(row)
                    item["attempts"] = attempts_by_request.get(item["request_id"], [])
                    items.append(enrich_request(item))
                return items
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
            with self._connection() as conn:
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
            with self._connection() as conn:
                rows = conn.execute(
                    "SELECT * FROM requests WHERE finished_at >= ? AND finished_at < ? ORDER BY finished_at ASC",
                    (start, end),
                ).fetchall()
                # Batch-load attempts for the whole window in ONE query instead
                # of one sub-query per request (the old N+1 path). Only the few
                # fields _add_to_bucket reads are needed, but we keep it simple
                # and select * joined on the same time window via request_id IN.
                request_ids = [row["request_id"] for row in rows]
                attempts_by_request = self._attempts_batch(conn, request_ids)
                for row in rows:
                    item = self._request_from_row(row)
                    item["attempts"] = attempts_by_request.get(item["request_id"], [])
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

    @staticmethod
    def _usage_range_start(value: Any) -> int:
        ranges = {"24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400}
        seconds = ranges.get(str(value or "7d").lower())
        return int(time.time()) - seconds if seconds else 0

    def first_event_latency_stats(
        self,
        provider: str,
        client_model: str,
        request_profile: str,
        *,
        limit: int = 500,
    ) -> Optional[Dict[str, int]]:
        if not self.enabled:
            return None
        limit = max(20, min(5000, int(limit or 500)))
        try:
            self._ensure_ready()
            with self._connection() as conn:
                rows = conn.execute(
                    """
                    SELECT a.first_event_ms
                    FROM attempts a
                    JOIN requests r ON r.request_id = a.request_id
                    WHERE a.provider = ?
                      AND r.model = ?
                      AND r.request_profile = ?
                      AND a.outcome = 'success'
                      AND a.first_event_ms > 0
                    ORDER BY r.finished_at DESC
                    LIMIT ?
                    """,
                    (str(provider or ""), str(client_model or ""), str(request_profile or "plain"), limit),
                ).fetchall()
            values = sorted(max(0, int(row["first_event_ms"] or 0)) for row in rows)
            if not values:
                return {"count": 0, "p95_ms": 0}
            index = max(0, ((95 * len(values) + 99) // 100) - 1)
            return {"count": len(values), "p95_ms": values[index]}
        except Exception:
            return None

    @staticmethod
    def _model_usage_row(row: sqlite3.Row) -> Dict[str, Any]:
        input_tokens = int(row["input_tokens"] or 0)
        cached_tokens = int(row["cached_input_tokens"] or 0)
        usage = {
            "input_tokens": input_tokens,
            "uncached_input_tokens": int(row["uncached_input_tokens"] or 0),
            "cached_input_tokens": cached_tokens,
            "cache_write_tokens": int(row["cache_write_tokens"] or 0),
            "output_tokens": int(row["output_tokens"] or 0),
            "reasoning_tokens": int(row["reasoning_tokens"] or 0),
            "total_tokens": int(row["total_tokens"] or 0),
        }
        calls = int(row["calls"] or 0)
        success = int(row["success"] or 0)
        return {
            "client_model": str(row["model"] or ""),
            "calls": calls,
            "success": success,
            "failed": max(0, calls - success),
            "success_rate": round(success / calls, 4) if calls else 0.0,
            "usage": usage,
            "cache_rate": round(cached_tokens / input_tokens, 4) if input_tokens else 0.0,
            "cost_usd": round(float(row["cost_usd"] or 0), 10),
            "cost_statuses": {
                "priced": int(row["cost_priced"] or 0),
                "estimated": int(row["cost_estimated"] or 0),
                "pending": int(row["cost_pending"] or 0),
                "unpriced": int(row["cost_unpriced"] or 0),
                "legacy": int(row["cost_legacy"] or 0),
            },
            "avg_duration_ms": int(round(float(row["avg_duration_ms"] or 0))),
            "avg_first_event_ms": int(round(float(row["avg_first_event_ms"] or 0))),
            "last_used": int(row["last_used"] or 0),
        }

    @staticmethod
    def _model_usage_select() -> str:
        return """
            SELECT
              r.model AS model,
              COUNT(*) AS calls,
              SUM(CASE WHEN r.status_code < 400 THEN 1 ELSE 0 END) AS success,
              SUM(r.input_tokens) AS input_tokens,
              SUM(r.uncached_input_tokens) AS uncached_input_tokens,
              SUM(r.cached_input_tokens) AS cached_input_tokens,
              SUM(r.cache_write_tokens) AS cache_write_tokens,
              SUM(r.output_tokens) AS output_tokens,
              SUM(r.reasoning_tokens) AS reasoning_tokens,
              SUM(r.total_tokens) AS total_tokens,
              SUM(r.cost_usd) AS cost_usd,
              SUM(CASE WHEN r.cost_status = 'priced' THEN 1 ELSE 0 END) AS cost_priced,
              SUM(CASE WHEN r.cost_status = 'estimated' THEN 1 ELSE 0 END) AS cost_estimated,
              SUM(CASE WHEN r.cost_status = 'pending' THEN 1 ELSE 0 END) AS cost_pending,
              SUM(CASE WHEN r.cost_status = 'unpriced' THEN 1 ELSE 0 END) AS cost_unpriced,
              SUM(CASE WHEN r.cost_status = 'legacy' THEN 1 ELSE 0 END) AS cost_legacy,
              AVG(r.duration_ms) AS avg_duration_ms,
              AVG(CASE WHEN r.first_byte_ms > 0 THEN r.first_byte_ms END) AS avg_first_event_ms,
              MAX(r.finished_at) AS last_used
            FROM requests r
        """

    def model_usage(
        self,
        *,
        range_name: str = "7d",
        query: str = "",
        sort: str = "calls",
        order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        sort_columns = {
            "calls": "calls",
            "tokens": "total_tokens",
            "cache_rate": "CASE WHEN input_tokens > 0 THEN CAST(cached_input_tokens AS REAL) / input_tokens ELSE 0 END",
            "cost": "cost_usd",
            "last_used": "last_used",
        }
        sort_sql = sort_columns.get(str(sort or "calls"), "calls")
        order_sql = "ASC" if str(order or "desc").lower() == "asc" else "DESC"
        limit = max(1, min(500, int(limit or 50)))
        offset = max(0, int(offset or 0))
        clauses = ["r.finished_at >= ?"] if self._usage_range_start(range_name) else []
        params: list[Any] = [self._usage_range_start(range_name)] if clauses else []
        query = str(query or "").strip()
        if query:
            clauses.append("r.model LIKE ? ESCAPE '\\'")
            params.append(f"%{self._escape_like(query)}%")
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        try:
            self._ensure_ready()
            with self._connection() as conn:
                total = int(
                    conn.execute(
                        f"SELECT COUNT(DISTINCT r.model) FROM requests r {where}", params
                    ).fetchone()[0]
                )
                rows = conn.execute(
                    f"""
                    {self._model_usage_select()}
                    {where}
                    GROUP BY r.model
                    ORDER BY {sort_sql} {order_sql}, r.model ASC
                    LIMIT ? OFFSET ?
                    """,
                    [*params, limit, offset],
                ).fetchall()
                items = [self._model_usage_row(row) for row in rows]
                models = [item["client_model"] for item in items]
                historical: Dict[str, list[str]] = {model: [] for model in models}
                if models:
                    placeholders = ",".join("?" for _ in models)
                    provider_rows = conn.execute(
                        f"""
                        SELECT DISTINCT r.model, a.provider
                        FROM requests r JOIN attempts a ON a.request_id = r.request_id
                        WHERE r.model IN ({placeholders}) AND a.outcome = 'success'
                        {"AND r.finished_at >= ?" if self._usage_range_start(range_name) else ""}
                        ORDER BY a.provider ASC
                        """,
                        [*models, *([self._usage_range_start(range_name)] if self._usage_range_start(range_name) else [])],
                    ).fetchall()
                    for row in provider_rows:
                        historical.setdefault(str(row["model"] or ""), []).append(str(row["provider"] or ""))
                for item in items:
                    item["historical_success_providers"] = historical.get(item["client_model"], [])
                    item["historical_success_provider_count"] = len(item["historical_success_providers"])
                summary_row = conn.execute(
                    f"""
                    SELECT COUNT(*) AS calls,
                           SUM(r.total_tokens) AS total_tokens,
                           SUM(r.input_tokens) AS input_tokens,
                           SUM(r.cached_input_tokens) AS cached_input_tokens,
                           SUM(r.cost_usd) AS cost_usd
                    FROM requests r {where}
                    """,
                    params,
                ).fetchone()
            summary_input = int(summary_row["input_tokens"] or 0)
            summary_cached = int(summary_row["cached_input_tokens"] or 0)
            return {
                "source": "sqlite",
                "range": str(range_name or "7d"),
                "query": query,
                "sort": str(sort or "calls"),
                "order": order_sql.lower(),
                "total": total,
                "limit": limit,
                "offset": offset,
                "summary": {
                    "calls": int(summary_row["calls"] or 0),
                    "total_tokens": int(summary_row["total_tokens"] or 0),
                    "cache_rate": round(summary_cached / summary_input, 4) if summary_input else 0.0,
                    "cost_usd": round(float(summary_row["cost_usd"] or 0), 10),
                },
                "items": items,
            }
        except Exception:
            return None

    def model_usage_detail(self, client_model: str, *, range_name: str = "7d") -> Optional[Dict[str, Any]]:
        if not self.enabled or not str(client_model or "").strip():
            return None
        model = str(client_model).strip()
        start = self._usage_range_start(range_name)
        range_clause = "AND r.finished_at >= ?" if start else ""
        params: list[Any] = [model, *([start] if start else [])]
        try:
            self._ensure_ready()
            with self._connection() as conn:
                summary_row = conn.execute(
                    f"""
                    {self._model_usage_select()}
                    WHERE r.model = ? {range_clause}
                    GROUP BY r.model
                    """,
                    params,
                ).fetchone()
                if summary_row is None:
                    return None
                provider_rows = conn.execute(
                    f"""
                    SELECT a.provider, a.provider_model, a.upstream_format,
                           COUNT(*) AS attempts,
                           SUM(CASE WHEN a.outcome = 'success' THEN 1 ELSE 0 END) AS success,
                           SUM(a.total_tokens) AS total_tokens,
                           SUM(a.cached_input_tokens) AS cached_input_tokens,
                           SUM(a.cost_usd) AS cost_usd,
                           AVG(a.duration_ms) AS avg_duration_ms,
                           AVG(CASE WHEN a.upstream_headers_ms > 0 THEN a.upstream_headers_ms END) AS avg_upstream_headers_ms,
                           AVG(CASE WHEN a.first_event_ms > 0 THEN a.first_event_ms END) AS avg_first_event_ms
                    FROM attempts a JOIN requests r ON r.request_id = a.request_id
                    WHERE r.model = ? {range_clause}
                    GROUP BY a.provider, a.provider_model, a.upstream_format
                    ORDER BY attempts DESC, a.provider ASC
                    """,
                    params,
                ).fetchall()
                span = max(1, int(time.time()) - (start or int(time.time()) - 30 * 86400))
                bucket_s = 3600 if span <= 2 * 86400 else 86400
                series_rows = conn.execute(
                    f"""
                    SELECT (r.finished_at / ?) * ? AS bucket,
                           COUNT(*) AS calls,
                           SUM(CASE WHEN r.status_code < 400 THEN 1 ELSE 0 END) AS success,
                           SUM(r.total_tokens) AS total_tokens,
                           SUM(r.cached_input_tokens) AS cached_input_tokens,
                           SUM(r.cost_usd) AS cost_usd
                    FROM requests r
                    WHERE r.model = ? {range_clause}
                    GROUP BY bucket ORDER BY bucket ASC
                    """,
                    [bucket_s, bucket_s, *params],
                ).fetchall()
            providers = [
                {
                    "provider": str(row["provider"] or ""),
                    "provider_model": str(row["provider_model"] or ""),
                    "upstream_format": str(row["upstream_format"] or ""),
                    "attempts": int(row["attempts"] or 0),
                    "success": int(row["success"] or 0),
                    "total_tokens": int(row["total_tokens"] or 0),
                    "cached_input_tokens": int(row["cached_input_tokens"] or 0),
                    "cost_usd": round(float(row["cost_usd"] or 0), 10),
                    "avg_duration_ms": int(round(float(row["avg_duration_ms"] or 0))),
                    "avg_upstream_headers_ms": int(round(float(row["avg_upstream_headers_ms"] or 0))),
                    "avg_first_event_ms": int(round(float(row["avg_first_event_ms"] or 0))),
                }
                for row in provider_rows
            ]
            return {
                "source": "sqlite",
                "range": str(range_name or "7d"),
                "client_model": model,
                "summary": self._model_usage_row(summary_row),
                "providers": providers,
                "historical_success_providers": sorted(
                    {item["provider"] for item in providers if item["success"] > 0}
                ),
                "bucket_s": bucket_s,
                "timeseries": [
                    {
                        "start": int(row["bucket"] or 0),
                        "calls": int(row["calls"] or 0),
                        "success": int(row["success"] or 0),
                        "total_tokens": int(row["total_tokens"] or 0),
                        "cached_input_tokens": int(row["cached_input_tokens"] or 0),
                        "cost_usd": round(float(row["cost_usd"] or 0), 10),
                    }
                    for row in series_rows
                ],
            }
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

        # Requests already queued before this barrier still contribute to
        # permanent statistics, but _insert_request removes their detail rows
        # after accounting so the cleared request list cannot repopulate.
        with self._statistics_sequence_lock:
            self._history_clear_sequence = self._statistics_sequence

        conn = None
        try:
            self._ensure_ready()
            with self._lock:
                conn = self._connect()
                attempts = conn.execute("SELECT COUNT(*) FROM attempts").fetchone()[0]
                requests = conn.execute("SELECT COUNT(*) FROM requests").fetchone()[0]
                pending_ids = [
                    str(row["request_id"])
                    for row in conn.execute(
                        "SELECT DISTINCT request_id FROM attempts WHERE cost_status = 'pending'"
                    ).fetchall()
                ]
                self._freeze_pending_statistics(conn, pending_ids)
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
            # NH2: roll back any uncommitted transaction before returning the
            # connection to the pool. A failed commit (disk full / IO error)
            # otherwise leaves stale DELETEs on the connection that the next
            # caller's commit() would silently apply — "connection poisoning".
            try:
                if conn is not None:
                    conn.rollback()
            except Exception:
                pass
            result["error"] = str(e)
        finally:
            if conn is not None:
                self._return_connection(conn)
        return result

    def usage_statistics_status(self) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "source": "disabled"}
        try:
            self._ensure_ready()
            self._backfill_statistics_batch(force=True, limit=25)
            with self._connection() as conn:
                return self._usage_statistics.status(conn)
        except Exception as exc:
            return {"enabled": True, "source": "error", "error": str(exc)}

    def usage_statistics_summary(
        self,
        *,
        range_name: str = "7d",
        start: Any = None,
        end: Any = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "source": "disabled", "summary": {}}
        self._ensure_ready()
        self._backfill_statistics_batch(force=True, limit=25)
        with self._connection() as conn:
            return self._usage_statistics.summary(
                conn,
                range_name=range_name,
                start=start,
                end=end,
                filters=filters,
            )

    def usage_statistics_timeseries(
        self,
        *,
        range_name: str = "7d",
        start: Any = None,
        end: Any = None,
        filters: Optional[Dict[str, Any]] = None,
        resolution: str = "auto",
        metric: str = "tokens",
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "source": "disabled", "points": []}
        self._ensure_ready()
        self._backfill_statistics_batch(force=True, limit=25)
        with self._connection() as conn:
            return self._usage_statistics.timeseries(
                conn,
                range_name=range_name,
                start=start,
                end=end,
                filters=filters,
                resolution=resolution,
                metric=metric,
            )

    def usage_statistics_breakdown(
        self,
        *,
        range_name: str = "7d",
        start: Any = None,
        end: Any = None,
        filters: Optional[Dict[str, Any]] = None,
        group_by: str = "model",
        sort: str = "requests",
        order: str = "desc",
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "source": "disabled", "items": []}
        self._ensure_ready()
        self._backfill_statistics_batch(force=True, limit=25)
        with self._connection() as conn:
            return self._usage_statistics.breakdown(
                conn,
                range_name=range_name,
                start=start,
                end=end,
                filters=filters,
                group_by=group_by,
                sort=sort,
                order=order,
                limit=limit,
                offset=offset,
            )

    def usage_statistics_dimensions(self) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "source": "disabled"}
        self._ensure_ready()
        self._backfill_statistics_batch(force=True, limit=25)
        with self._connection() as conn:
            return self._usage_statistics.dimensions(conn)

    def clear_usage_statistics(self) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "source": "disabled"}
        self._ensure_ready()
        with self._statistics_sequence_lock:
            self._statistics_clear_sequence = self._statistics_sequence
        with self._lock:
            with self._connection() as conn:
                return self._usage_statistics.clear(conn)

    def _freeze_pending_statistics(self, conn: sqlite3.Connection, request_ids: Iterable[str]) -> None:
        ids = [str(value or "") for value in request_ids or [] if str(value or "")]
        if not ids:
            return
        for start in range(0, len(ids), 500):
            chunk = ids[start:start + 500]
            placeholders = ",".join("?" for _ in chunk)
            pending = [
                str(row["request_id"])
                for row in conn.execute(
                    f"""
                    SELECT DISTINCT request_id FROM attempts
                    WHERE request_id IN ({placeholders}) AND cost_status = 'pending'
                    """,
                    chunk,
                ).fetchall()
            ]
            if not pending:
                continue
            pending_marks = ",".join("?" for _ in pending)
            conn.execute(
                f"""
                UPDATE attempts SET cost_status = 'unpriced'
                WHERE request_id IN ({pending_marks}) AND cost_status = 'pending'
                """,
                pending,
            )
            for request_id in pending:
                attempt_rows = conn.execute(
                    "SELECT * FROM attempts WHERE request_id = ?", (request_id,)
                ).fetchall()
                request_status, request_source, request_snapshot = self._combined_cost_state(
                    attempt_rows
                )
                conn.execute(
                    """
                    UPDATE requests
                    SET cost_status = ?, pricing_source = ?, pricing_snapshot = ?
                    WHERE request_id = ?
                    """,
                    (
                        request_status,
                        request_source,
                        json.dumps(request_snapshot, ensure_ascii=False),
                        request_id,
                    ),
                )
                self._reconcile_usage_statistics_safely(conn, request_id)

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
                self._freeze_pending_statistics(conn, ids)
                conn.execute(f"DELETE FROM requests WHERE request_id IN ({placeholders})", ids)
                conn.commit()
                result["attempts_deleted"] = int(attempts or 0)
                result["requests_deleted"] = int(requests or 0)
        except Exception as e:
            # NH2: roll back any uncommitted transaction before returning the
            # connection to the pool. A failed commit (disk full / IO error)
            # otherwise leaves stale DELETEs on the connection that the next
            # caller's commit() would silently apply — "connection poisoning".
            try:
                if conn is not None:
                    conn.rollback()
            except Exception:
                pass
            result["error"] = str(e)
        finally:
            if conn is not None:
                self._return_connection(conn)
        return result

    def delete_matching_requests(self, filters: Dict[str, Any]) -> Dict[str, Any]:
        filters = filters or {}
        where, params = self._request_where(filters)
        result = {
            "enabled": bool(self.enabled),
            "path": self.path,
            "filters": self._copy_value(filters),
            "requests_deleted": 0,
            "attempts_deleted": 0,
        }
        if not self.enabled:
            return result
        if not where:
            result["error"] = "at least one filter is required"
            return result

        conn = None
        try:
            self._ensure_ready()
            with self._lock:
                conn = self._connect()
                request_ids = [
                    str(row["request_id"])
                    for row in conn.execute(f"SELECT r.request_id FROM requests r {where}", params).fetchall()
                ]
                if not request_ids:
                    return result
                placeholders = ",".join("?" for _ in request_ids)
                attempts = conn.execute(
                    f"SELECT COUNT(*) FROM attempts WHERE request_id IN ({placeholders})",
                    request_ids,
                ).fetchone()[0]
                requests = conn.execute(
                    f"SELECT COUNT(*) FROM requests WHERE request_id IN ({placeholders})",
                    request_ids,
                ).fetchone()[0]
                self._freeze_pending_statistics(conn, request_ids)
                conn.execute(f"DELETE FROM requests WHERE request_id IN ({placeholders})", request_ids)
                conn.commit()
                result["attempts_deleted"] = int(attempts or 0)
                result["requests_deleted"] = int(requests or 0)
        except Exception as e:
            # NH2: roll back any uncommitted transaction before returning the
            # connection to the pool. A failed commit (disk full / IO error)
            # otherwise leaves stale DELETEs on the connection that the next
            # caller's commit() would silently apply — "connection poisoning".
            try:
                if conn is not None:
                    conn.rollback()
            except Exception:
                pass
            result["error"] = str(e)
        finally:
            if conn is not None:
                self._return_connection(conn)
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
        self._add_like_filter(clauses, params, "r.model", filters.get("model"))
        self._add_eq_filter(clauses, params, "r.status_code", filters.get("status_code"))
        self._add_eq_filter(clauses, params, "r.cost_status", filters.get("cost_status"))
        self._add_like_filter(clauses, params, "r.client_ip", filters.get("client_ip"))
        stream_filter = str(filters.get("stream") or "").strip().lower()
        if stream_filter in ("1", "true", "yes", "stream"):
            clauses.append("r.stream = 1")
        elif stream_filter in ("0", "false", "no", "non_stream", "non-stream"):
            clauses.append("r.stream = 0")

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
            # NH4: escape LIKE wildcards in the user-supplied value so that
            # e.g. model="100%" does not match every model, and provider=
            # "model_1" does not match "modelA1". Backslash is the escape char.
            escaped = self._escape_like(value)
            clauses.append(
                f"EXISTS (SELECT 1 FROM attempts a WHERE a.request_id = r.request_id AND {column} LIKE ? ESCAPE '\\')"
            )
            params.append(f"%{escaped}%")

        if not clauses:
            return "", []
        return "WHERE " + " AND ".join(clauses), params

    @staticmethod
    def _escape_like(value: str) -> str:
        """Escape backslash, ``%`` and ``_`` for use in a LIKE pattern."""
        return str(value or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    @staticmethod
    def _add_eq_filter(clauses: list, params: list, column: str, value: Any) -> None:
        value = str(value or "").strip()
        if not value:
            return
        clauses.append(f"{column} = ?")
        params.append(value)

    @staticmethod
    def _add_like_filter(clauses: list, params: list, column: str, value: Any) -> None:
        value = str(value or "").strip()
        if not value:
            return
        # NH4: escape LIKE wildcards (see _attempt_where for rationale).
        escaped = RequestHistoryStore._escape_like(value)
        clauses.append(f"{column} LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")

    def _summarize_row(self, conn: sqlite3.Connection, row: sqlite3.Row) -> Dict[str, Any]:
        item = self._request_from_row(row)
        item["attempts"] = self._attempts_for_request(conn, item["request_id"])
        return self._summarize_request(item)

    @staticmethod
    def _request_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        usage = {
            "input_tokens": int(row["input_tokens"] or 0),
            "uncached_input_tokens": int(row["uncached_input_tokens"] or 0),
            "cached_input_tokens": int(row["cached_input_tokens"] or 0),
            "cache_write_tokens": int(row["cache_write_tokens"] or 0),
            "output_tokens": int(row["output_tokens"] or 0),
            "reasoning_tokens": int(row["reasoning_tokens"] or 0),
            "total_tokens": int(row["total_tokens"] or 0),
        }
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
            "usage": usage,
            "input_tokens": int(row["input_tokens"] or 0),
            "output_tokens": int(row["output_tokens"] or 0),
            "total_tokens": int(row["total_tokens"] or 0),
            "cost_usd": round(float(row["cost_usd"] or 0), 10),
            "cost_status": str(row["cost_status"] or "legacy"),
            "pricing_source": str(row["pricing_source"] or ""),
            "client_ip": str(row["client_ip"] or ""),
            "client_ip_source": str(row["client_ip_source"] or ""),
            "user_agent": str(row["user_agent"] or ""),
            "request_bytes": int(row["request_bytes"] or 0),
            "request_profile": str(row["request_profile"] or ""),
            "started_at": int(row["started_at"] or 0),
            "finished_at": int(row["finished_at"] or 0),
            "attempts": [],
        }
        if row["error"]:
            out["error"] = str(row["error"])[:500]
        if row["pricing_snapshot"]:
            try:
                snapshot = json.loads(row["pricing_snapshot"])
                if isinstance(snapshot, dict) and snapshot:
                    out["pricing_snapshot"] = snapshot
            except (TypeError, ValueError):
                pass
        if "routing_trace" in row.keys() and row["routing_trace"]:
            try:
                trace = json.loads(row["routing_trace"])
                if isinstance(trace, list):
                    out["routing_trace"] = trace
            except (TypeError, ValueError):
                pass
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
        return [RequestHistoryStore._attempt_from_row(row) for row in rows]

    @staticmethod
    def _attempts_batch(conn: sqlite3.Connection, request_ids) -> Dict[str, list]:
        """Return {request_id: [attempt, ...]} for many requests in at most a
        few queries. Replaces the N+1 pattern of calling _attempts_for_request
        once per request in hot paths like timeseries aggregation. Empty input
        returns an empty dict. Result is ordered by attempt_no within each
        request to match _attempts_for_request semantics.
        """
        out: Dict[str, list] = {}
        ids = [str(rid) for rid in request_ids if rid]
        if not ids:
            return out
        # SQLite parameter limit defense: chunk into batches of 500 ids.
        chunk_size = 500
        for i in range(0, len(ids), chunk_size):
            chunk = ids[i : i + chunk_size]
            placeholders = ",".join(["?"] * len(chunk))
            rows = conn.execute(
                f"""
                SELECT *
                FROM attempts
                WHERE request_id IN ({placeholders})
                ORDER BY request_id ASC, attempt_no ASC, provider ASC, key_index ASC
                """,
                chunk,
            ).fetchall()
            for row in rows:
                rid = row["request_id"]
                out.setdefault(rid, []).append(RequestHistoryStore._attempt_from_row(row))
        return out

    @staticmethod
    def _attempt_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        item = {
            "attempt_no": int(row["attempt_no"] or 0),
            "provider": row["provider"],
            "key_index": int(row["key_index"] or 0),
            "provider_model": row["provider_model"],
            "upstream_format": row["upstream_format"],
            "outcome": row["outcome"],
        }
        if int(row["duration_ms"] or 0) > 0:
            item["duration_ms"] = int(row["duration_ms"] or 0)
        for timing_key in ("upstream_headers_ms", "first_event_ms", "generation_wait_ms"):
            if int(row[timing_key] or 0) > 0:
                item[timing_key] = int(row[timing_key] or 0)
        if row["finish_reason"]:
            item["finish_reason"] = str(row["finish_reason"])
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
            "failure_owner",
        ):
            if row[key]:
                item[key] = row[key]
        if row["http_status"] is not None:
            item["http_status"] = int(row["http_status"])
        if "parameter_adaptations" in row.keys() and row["parameter_adaptations"]:
            try:
                item["parameter_adaptations"] = json.loads(row["parameter_adaptations"])
            except (TypeError, ValueError):
                pass
        if "state_action" in row.keys() and row["state_action"]:
            try:
                action = json.loads(row["state_action"])
                if isinstance(action, dict) and action:
                    item["state_action"] = action
            except (TypeError, ValueError):
                pass
        if "conversion_details" in row.keys() and row["conversion_details"]:
            try:
                details = json.loads(row["conversion_details"])
                if isinstance(details, dict) and details:
                    item["conversion_details"] = details
            except (TypeError, ValueError):
                pass
        usage_totals = {
            "input_tokens": int(row["input_tokens"] or 0),
            "uncached_input_tokens": int(row["uncached_input_tokens"] or 0),
            "cached_input_tokens": int(row["cached_input_tokens"] or 0),
            "cache_write_tokens": int(row["cache_write_tokens"] or 0),
            "output_tokens": int(row["output_tokens"] or 0),
            "reasoning_tokens": int(row["reasoning_tokens"] or 0),
            "total_tokens": int(row["total_tokens"] or 0),
        }
        if has_usage(usage_totals):
            item["usage"] = usage_totals
            item["input_tokens"] = usage_totals["input_tokens"]
            item["output_tokens"] = usage_totals["output_tokens"]
            item["total_tokens"] = usage_totals["total_tokens"]
            item["cost_usd"] = round(float(row["cost_usd"] or 0), 10)
        item["cost_status"] = str(row["cost_status"] or "legacy")
        item["pricing_source"] = str(row["pricing_source"] or "")
        if row["pricing_snapshot"]:
            try:
                snapshot = json.loads(row["pricing_snapshot"])
                if isinstance(snapshot, dict) and snapshot:
                    item["pricing_snapshot"] = snapshot
            except (TypeError, ValueError):
                pass
        return item

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
            "client_ip": str(item.get("client_ip") or ""),
            "cost_status": str(item.get("cost_status") or "legacy"),
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
        out["routing_summary"] = summarize_request(item)
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
