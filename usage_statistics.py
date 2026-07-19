#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import math
import time
import zlib
from typing import Any, Dict, Iterable, Optional

from usage_accounting import normalize_usage, safe_float


DIMENSION_COLUMNS = (
    "client_model",
    "provider",
    "upstream_model",
    "client_format",
    "upstream_format",
    "route_outcome",
)

ADDITIVE_COLUMNS = (
    "requests",
    "request_success",
    "request_failed",
    "recovered",
    "attempts",
    "attempt_success",
    "attempt_failed",
    "input_tokens",
    "uncached_input_tokens",
    "cached_input_tokens",
    "cache_write_tokens",
    "output_tokens",
    "reasoning_tokens",
    "total_tokens",
    "cost_priced_usd",
    "cost_estimated_usd",
    "cost_legacy_usd",
    "cost_priced_count",
    "cost_estimated_count",
    "cost_pending_count",
    "cost_unpriced_count",
    "cost_legacy_count",
    "request_first_event_ms_sum",
    "request_first_event_samples",
    "request_duration_ms_sum",
    "request_duration_samples",
    "attempt_first_event_ms_sum",
    "attempt_first_event_samples",
    "attempt_duration_ms_sum",
    "attempt_duration_samples",
)

MAX_COLUMNS = (
    "request_first_event_ms_max",
    "request_duration_ms_max",
    "attempt_first_event_ms_max",
    "attempt_duration_ms_max",
    "last_used_at",
)

INTEGER_COLUMNS = tuple(
    name
    for name in ADDITIVE_COLUMNS
    if not name.startswith("cost_")
)

SCHEMA_VERSION = 2
FACT_REQUEST = "request"
FACT_ATTEMPT = "attempt"


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _empty_metrics() -> Dict[str, Any]:
    out: Dict[str, Any] = {name: 0 for name in ADDITIVE_COLUMNS}
    out.update({name: 0 for name in MAX_COLUMNS})
    return out


def _normalize_dimension(value: Any, *, limit: int = 300) -> str:
    return str(value or "").strip()[:limit]


def _local_timezone_name() -> str:
    tz = _dt.datetime.now().astimezone().tzinfo
    key = str(getattr(tz, "key", "") or "").strip()
    if key:
        return key
    offset = _dt.datetime.now().astimezone().utcoffset() or _dt.timedelta()
    seconds = int(offset.total_seconds())
    sign = "+" if seconds >= 0 else "-"
    seconds = abs(seconds)
    hours, remainder = divmod(seconds, 3600)
    minutes = remainder // 60
    return f"{sign}{hours:02d}:{minutes:02d}"


def _timezone(value: str):
    name = str(value or "").strip()
    if name:
        try:
            from zoneinfo import ZoneInfo

            return ZoneInfo(name)
        except Exception:
            pass
    if len(name) == 6 and name[0] in "+-" and name[3] == ":":
        try:
            sign = 1 if name[0] == "+" else -1
            minutes = int(name[1:3]) * 60 + int(name[4:6])
            return _dt.timezone(sign * _dt.timedelta(minutes=minutes), name)
        except Exception:
            pass
    return _dt.timezone.utc


class UsageStatisticsStore:
    """Permanent, low-volume aggregates stored beside request history.

    This class never owns a SQLite connection or lock. RequestHistoryStore
    calls its mutation methods with the history transaction already open so
    request detail and aggregate accounting remain atomic.
    """

    def __init__(self, cfg: Dict[str, Any], *, history_retention_days: int = 30):
        self.cfg = cfg or {}
        obs = self.cfg.get("observability") or {}
        stats = obs.get("usage_statistics") or {}
        self.enabled = bool(stats.get("enabled", True))
        self.hourly_retention_days = self._bounded_int(
            stats.get("hourly_retention_days", 90), 7, 366, 90
        )
        self.history_retention_days = max(1, int(history_retention_days or 30))
        self.configured_timezone = str(stats.get("reporting_timezone") or "").strip()

    @staticmethod
    def _bounded_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
        try:
            return max(minimum, min(maximum, int(value)))
        except (TypeError, ValueError):
            return fallback

    @staticmethod
    def create_schema(conn) -> None:
        metric_ddl = """
              requests INTEGER NOT NULL DEFAULT 0,
              request_success INTEGER NOT NULL DEFAULT 0,
              request_failed INTEGER NOT NULL DEFAULT 0,
              recovered INTEGER NOT NULL DEFAULT 0,
              attempts INTEGER NOT NULL DEFAULT 0,
              attempt_success INTEGER NOT NULL DEFAULT 0,
              attempt_failed INTEGER NOT NULL DEFAULT 0,
              input_tokens INTEGER NOT NULL DEFAULT 0,
              uncached_input_tokens INTEGER NOT NULL DEFAULT 0,
              cached_input_tokens INTEGER NOT NULL DEFAULT 0,
              cache_write_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              reasoning_tokens INTEGER NOT NULL DEFAULT 0,
              total_tokens INTEGER NOT NULL DEFAULT 0,
              cost_priced_usd REAL NOT NULL DEFAULT 0,
              cost_estimated_usd REAL NOT NULL DEFAULT 0,
              cost_legacy_usd REAL NOT NULL DEFAULT 0,
              cost_priced_count INTEGER NOT NULL DEFAULT 0,
              cost_estimated_count INTEGER NOT NULL DEFAULT 0,
              cost_pending_count INTEGER NOT NULL DEFAULT 0,
              cost_unpriced_count INTEGER NOT NULL DEFAULT 0,
              cost_legacy_count INTEGER NOT NULL DEFAULT 0,
              request_first_event_ms_sum INTEGER NOT NULL DEFAULT 0,
              request_first_event_samples INTEGER NOT NULL DEFAULT 0,
              request_first_event_ms_max INTEGER NOT NULL DEFAULT 0,
              request_duration_ms_sum INTEGER NOT NULL DEFAULT 0,
              request_duration_samples INTEGER NOT NULL DEFAULT 0,
              request_duration_ms_max INTEGER NOT NULL DEFAULT 0,
              attempt_first_event_ms_sum INTEGER NOT NULL DEFAULT 0,
              attempt_first_event_samples INTEGER NOT NULL DEFAULT 0,
              attempt_first_event_ms_max INTEGER NOT NULL DEFAULT 0,
              attempt_duration_ms_sum INTEGER NOT NULL DEFAULT 0,
              attempt_duration_samples INTEGER NOT NULL DEFAULT 0,
              attempt_duration_ms_max INTEGER NOT NULL DEFAULT 0,
              last_used_at INTEGER NOT NULL DEFAULT 0
        """
        dimensions_ddl = """
              fact_kind TEXT NOT NULL,
              client_model TEXT NOT NULL DEFAULT '',
              provider TEXT NOT NULL DEFAULT '',
              upstream_model TEXT NOT NULL DEFAULT '',
              client_format TEXT NOT NULL DEFAULT '',
              upstream_format TEXT NOT NULL DEFAULT '',
              route_outcome TEXT NOT NULL DEFAULT ''
        """
        conn.executescript(
            f"""
            CREATE TABLE IF NOT EXISTS usage_statistics_meta (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              schema_version INTEGER NOT NULL DEFAULT {SCHEMA_VERSION},
              generation INTEGER NOT NULL DEFAULT 1,
              reporting_timezone TEXT NOT NULL DEFAULT '+00:00',
              statistics_started_at INTEGER NOT NULL DEFAULT 0,
              backfill_cutoff_at INTEGER NOT NULL DEFAULT 0,
              backfill_started_at INTEGER NOT NULL DEFAULT 0,
              backfill_completed_at INTEGER NOT NULL DEFAULT 0,
              last_compacted_at INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL DEFAULT 0,
              updated_at INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS usage_statistics_ledger (
              generation INTEGER NOT NULL,
              request_id TEXT NOT NULL,
              finished_at INTEGER NOT NULL DEFAULT 0,
              fingerprint TEXT NOT NULL DEFAULT '',
              contribution_snapshot BLOB NOT NULL DEFAULT X'',
              accounted_at INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (generation, request_id)
            );

            CREATE TABLE IF NOT EXISTS usage_statistics_dirty (
              request_id TEXT PRIMARY KEY,
              marked_at INTEGER NOT NULL DEFAULT 0,
              reason TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS usage_statistics_hourly (
              generation INTEGER NOT NULL,
              bucket_start INTEGER NOT NULL,
              {dimensions_ddl},
              {metric_ddl},
              PRIMARY KEY (
                generation, bucket_start, fact_kind, client_model, provider,
                upstream_model, client_format, upstream_format, route_outcome
              )
            );

            CREATE TABLE IF NOT EXISTS usage_statistics_daily (
              generation INTEGER NOT NULL,
              bucket_start INTEGER NOT NULL,
              {dimensions_ddl},
              {metric_ddl},
              PRIMARY KEY (
                generation, bucket_start, fact_kind, client_model, provider,
                upstream_model, client_format, upstream_format, route_outcome
              )
            );

            CREATE TABLE IF NOT EXISTS usage_statistics_totals (
              generation INTEGER NOT NULL,
              {dimensions_ddl},
              {metric_ddl},
              PRIMARY KEY (
                generation, fact_kind, client_model, provider, upstream_model,
                client_format, upstream_format, route_outcome
              )
            );

            CREATE INDEX IF NOT EXISTS idx_usage_stats_hourly_time
              ON usage_statistics_hourly(generation, bucket_start);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_daily_time
              ON usage_statistics_daily(generation, bucket_start);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_hourly_model
              ON usage_statistics_hourly(generation, client_model, bucket_start);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_daily_model
              ON usage_statistics_daily(generation, client_model, bucket_start);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_totals_model
              ON usage_statistics_totals(generation, client_model);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_totals_provider
              ON usage_statistics_totals(generation, provider);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_ledger_time
              ON usage_statistics_ledger(generation, finished_at);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_dirty_time
              ON usage_statistics_dirty(marked_at);
            """
        )

    def ensure_meta(self, conn, *, now: Optional[int] = None) -> Dict[str, Any]:
        now_i = _safe_int(now or time.time())
        row = conn.execute("SELECT * FROM usage_statistics_meta WHERE id = 1").fetchone()
        if row is None:
            timezone_name = self.configured_timezone or _local_timezone_name()
            existing = conn.execute(
                "SELECT COUNT(*) AS count, MIN(finished_at) AS oldest FROM requests"
            ).fetchone()
            count = _safe_int(existing["count"] if existing else 0)
            oldest = _safe_int(existing["oldest"] if existing else 0)
            started = oldest or now_i
            completed = 0 if count else now_i
            conn.execute(
                """
                INSERT INTO usage_statistics_meta (
                  id, schema_version, generation, reporting_timezone,
                  statistics_started_at, backfill_cutoff_at, backfill_started_at,
                  backfill_completed_at, last_compacted_at, created_at, updated_at
                ) VALUES (1, ?, 1, ?, ?, 0, 0, ?, 0, ?, ?)
                """,
                (SCHEMA_VERSION, timezone_name, started, completed, now_i, now_i),
            )
            row = conn.execute("SELECT * FROM usage_statistics_meta WHERE id = 1").fetchone()
        elif _safe_int(row["schema_version"]) < SCHEMA_VERSION:
            # v1 was an unreleased development schema. Rebuild its aggregates
            # from retained request history so probe exclusion and fact
            # attribution use the finalized v2 semantics.
            oldest = _safe_int(
                conn.execute("SELECT MIN(finished_at) FROM requests").fetchone()[0]
            )
            generation = (_safe_int(row["generation"]) or 1) + 1
            for table in (
                "usage_statistics_hourly",
                "usage_statistics_daily",
                "usage_statistics_totals",
                "usage_statistics_ledger",
                "usage_statistics_dirty",
            ):
                conn.execute(f"DELETE FROM {table}")
            conn.execute(
                """
                UPDATE usage_statistics_meta
                SET schema_version = ?, generation = ?, statistics_started_at = ?,
                    backfill_cutoff_at = 0, backfill_started_at = 0,
                    backfill_completed_at = 0, last_compacted_at = 0,
                    updated_at = ?
                WHERE id = 1
                """,
                (SCHEMA_VERSION, generation, oldest or now_i, now_i),
            )
            row = conn.execute("SELECT * FROM usage_statistics_meta WHERE id = 1").fetchone()
        return dict(row)

    @staticmethod
    def _request_outcome(request_row: Dict[str, Any], attempts: Iterable[Dict[str, Any]]) -> str:
        attempts_list = list(attempts or [])
        status_code = _safe_int(request_row.get("status_code"))
        success = status_code < 400
        if success:
            failures = sum(1 for item in attempts_list if str(item.get("outcome") or "") != "success")
            return "recovered_success" if failures else "direct_success"
        error = str(request_row.get("error") or "").lower()
        if status_code == 499 or "cancel" in error or "disconnect" in error:
            return "cancelled"
        if not attempts_list:
            return "no_candidate"
        if 400 <= status_code < 500:
            return "client_error"
        return "failed_after_attempts"

    @staticmethod
    def _final_attempt(attempts: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        rows = list(attempts or [])
        if not rows:
            return {}
        successful = [row for row in rows if str(row.get("outcome") or "") == "success"]
        source = successful or rows
        return max(source, key=lambda row: _safe_int(row.get("attempt_no")))

    @staticmethod
    def _cost_metrics(status: str, cost_usd: float, has_usage: bool) -> Dict[str, Any]:
        out = _empty_metrics()
        if not has_usage and cost_usd <= 0:
            return out
        state = str(status or "legacy").lower()
        if state == "priced":
            out["cost_priced_usd"] = cost_usd
            out["cost_priced_count"] = 1
        elif state == "estimated":
            out["cost_estimated_usd"] = cost_usd
            out["cost_estimated_count"] = 1
        elif state == "pending":
            out["cost_pending_count"] = 1
        elif state == "unpriced":
            out["cost_unpriced_count"] = 1
        else:
            out["cost_legacy_usd"] = cost_usd
            out["cost_legacy_count"] = 1
        return out

    def _facts(
        self,
        request_row: Dict[str, Any],
        attempt_rows: Iterable[Dict[str, Any]],
        *,
        timezone_name: str,
    ) -> list[Dict[str, Any]]:
        attempts = [dict(row) for row in attempt_rows or []]
        finished_at = _safe_int(request_row.get("finished_at") or time.time())
        client_model = _normalize_dimension(request_row.get("model"))
        client_format = _normalize_dimension(request_row.get("client_format"), limit=100)
        outcome = self._request_outcome(request_row, attempts)
        final_attempt = self._final_attempt(attempts)
        request_metrics = _empty_metrics()
        request_metrics["requests"] = 1
        if _safe_int(request_row.get("status_code")) < 400:
            request_metrics["request_success"] = 1
        else:
            request_metrics["request_failed"] = 1
        if outcome == "recovered_success":
            request_metrics["recovered"] = 1
        first_event_ms = _safe_int(request_row.get("first_byte_ms"))
        duration_ms = max(0, _safe_int(request_row.get("duration_ms")))
        if first_event_ms > 0:
            request_metrics["request_first_event_ms_sum"] = first_event_ms
            request_metrics["request_first_event_samples"] = 1
            request_metrics["request_first_event_ms_max"] = first_event_ms
        request_metrics["request_duration_ms_sum"] = duration_ms
        request_metrics["request_duration_samples"] = 1
        request_metrics["request_duration_ms_max"] = duration_ms
        request_metrics["last_used_at"] = finished_at
        facts = [
            self._fact(
                FACT_REQUEST,
                finished_at,
                timezone_name,
                client_model=client_model,
                provider=final_attempt.get("provider"),
                upstream_model=final_attempt.get("provider_model"),
                client_format=client_format,
                upstream_format=final_attempt.get("upstream_format"),
                route_outcome=outcome,
                metrics=request_metrics,
            )
        ]
        for attempt in attempts:
            usage = normalize_usage(attempt)
            attempt_metrics = _empty_metrics()
            attempt_metrics["attempts"] = 1
            attempt_outcome = str(attempt.get("outcome") or "failed")
            if attempt_outcome == "success":
                attempt_metrics["attempt_success"] = 1
            else:
                attempt_metrics["attempt_failed"] = 1
            for name in (
                "input_tokens",
                "uncached_input_tokens",
                "cached_input_tokens",
                "cache_write_tokens",
                "output_tokens",
                "reasoning_tokens",
                "total_tokens",
            ):
                attempt_metrics[name] = _safe_int(usage.get(name))
            cost_usd = max(0.0, safe_float(attempt.get("cost_usd")))
            cost_metrics = self._cost_metrics(
                str(attempt.get("cost_status") or "legacy"),
                cost_usd,
                bool(attempt_metrics["total_tokens"] or attempt_metrics["input_tokens"] or attempt_metrics["output_tokens"]),
            )
            for name in ADDITIVE_COLUMNS:
                attempt_metrics[name] += cost_metrics[name]
            attempt_first_event = max(0, _safe_int(attempt.get("first_event_ms")))
            attempt_duration = max(0, _safe_int(attempt.get("duration_ms")))
            if attempt_first_event > 0:
                attempt_metrics["attempt_first_event_ms_sum"] = attempt_first_event
                attempt_metrics["attempt_first_event_samples"] = 1
                attempt_metrics["attempt_first_event_ms_max"] = attempt_first_event
            attempt_metrics["attempt_duration_ms_sum"] = attempt_duration
            attempt_metrics["attempt_duration_samples"] = 1
            attempt_metrics["attempt_duration_ms_max"] = attempt_duration
            attempt_metrics["last_used_at"] = finished_at
            facts.append(
                self._fact(
                    FACT_ATTEMPT,
                    finished_at,
                    timezone_name,
                    client_model=client_model,
                    provider=attempt.get("provider"),
                    upstream_model=attempt.get("provider_model"),
                    client_format=client_format,
                    upstream_format=attempt.get("upstream_format"),
                    route_outcome=attempt_outcome,
                    metrics=attempt_metrics,
                )
            )
        return facts

    def _fact(
        self,
        fact_kind: str,
        finished_at: int,
        timezone_name: str,
        *,
        client_model: Any,
        provider: Any,
        upstream_model: Any,
        client_format: Any,
        upstream_format: Any,
        route_outcome: Any,
        metrics: Dict[str, Any],
    ) -> Dict[str, Any]:
        return {
            "fact_kind": fact_kind,
            "finished_at": finished_at,
            "hour_bucket": self._bucket_start(finished_at, timezone_name, "hour"),
            "day_bucket": self._bucket_start(finished_at, timezone_name, "day"),
            "client_model": _normalize_dimension(client_model),
            "provider": _normalize_dimension(provider),
            "upstream_model": _normalize_dimension(upstream_model),
            "client_format": _normalize_dimension(client_format, limit=100),
            "upstream_format": _normalize_dimension(upstream_format, limit=100),
            "route_outcome": _normalize_dimension(route_outcome, limit=100),
            "metrics": metrics,
        }

    @staticmethod
    def _bucket_start(timestamp: int, timezone_name: str, resolution: str) -> int:
        tz = _timezone(timezone_name)
        value = _dt.datetime.fromtimestamp(int(timestamp), tz)
        if resolution == "day":
            bucket = value.replace(hour=0, minute=0, second=0, microsecond=0, fold=0)
        else:
            bucket = value.replace(minute=0, second=0, microsecond=0)
        return int(bucket.timestamp())

    @staticmethod
    def _request_rows(conn, request_id: str) -> tuple[Optional[Dict[str, Any]], list[Dict[str, Any]]]:
        request = conn.execute(
            "SELECT * FROM requests WHERE request_id = ?", (str(request_id or ""),)
        ).fetchone()
        if request is None:
            return None, []
        attempts = conn.execute(
            """
            SELECT * FROM attempts WHERE request_id = ?
            ORDER BY attempt_no ASC, provider ASC, key_index ASC, upstream_format ASC
            """,
            (str(request_id or ""),),
        ).fetchall()
        return dict(request), [dict(row) for row in attempts]

    def reconcile_request(
        self,
        conn,
        request_id: str,
        *,
        now: Optional[int] = None,
        live_write: bool = False,
    ) -> bool:
        if not self.enabled or not str(request_id or ""):
            return False
        now_i = _safe_int(now or time.time())
        meta = self.ensure_meta(conn, now=now_i)
        request, attempts = self._request_rows(conn, request_id)
        if request is None:
            return False
        if self._is_probe_request(request):
            return False
        generation = _safe_int(meta.get("generation")) or 1
        old = conn.execute(
            """
            SELECT fingerprint, contribution_snapshot
            FROM usage_statistics_ledger
            WHERE generation = ? AND request_id = ?
            """,
            (generation, str(request_id)),
        ).fetchone()
        finished_at = _safe_int(request.get("finished_at"))
        if (
            old is None
            and not live_write
            and finished_at <= _safe_int(meta.get("backfill_cutoff_at"))
        ):
            return False
        facts = self._facts(
            request,
            attempts,
            timezone_name=str(meta.get("reporting_timezone") or "+00:00"),
        )
        compact_facts = self._compact_facts(facts)
        snapshot_json = _canonical_json(compact_facts)
        snapshot = zlib.compress(snapshot_json.encode("utf-8"), level=6)
        fingerprint = hashlib.sha256(snapshot_json.encode("utf-8")).hexdigest()
        if old is not None and str(old["fingerprint"] or "") == fingerprint:
            return False
        if old is not None:
            try:
                old_facts = self._decode_snapshot(old["contribution_snapshot"])
            except (TypeError, ValueError):
                old_facts = []
            for fact in old_facts if isinstance(old_facts, list) else []:
                self._apply_fact(conn, generation, fact, -1, now_i=now_i)
        for fact in facts:
            self._apply_fact(conn, generation, fact, 1, now_i=now_i)
        conn.execute(
            """
            INSERT INTO usage_statistics_ledger (
              generation, request_id, finished_at, fingerprint,
              contribution_snapshot, accounted_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(generation, request_id) DO UPDATE SET
              finished_at = excluded.finished_at,
              fingerprint = excluded.fingerprint,
              contribution_snapshot = excluded.contribution_snapshot,
              accounted_at = excluded.accounted_at
            """,
            (generation, str(request_id), finished_at, fingerprint, snapshot, now_i),
        )
        conn.execute(
            """
            UPDATE usage_statistics_meta
            SET statistics_started_at = CASE
                  WHEN statistics_started_at <= 0 OR statistics_started_at > ?
                  THEN ? ELSE statistics_started_at END,
                updated_at = ?
            WHERE id = 1
            """,
            (finished_at, finished_at, now_i),
        )
        return True

    @staticmethod
    def _compact_facts(facts: Iterable[Dict[str, Any]]) -> list[Dict[str, Any]]:
        compact = []
        for fact in facts or []:
            item = {key: value for key, value in fact.items() if key != "metrics"}
            item["metrics"] = {
                key: value for key, value in (fact.get("metrics") or {}).items() if value
            }
            compact.append(item)
        return compact

    @staticmethod
    def _decode_snapshot(value: Any) -> list[Dict[str, Any]]:
        if not value:
            return []
        if isinstance(value, memoryview):
            value = value.tobytes()
        if isinstance(value, bytes):
            try:
                raw = zlib.decompress(value).decode("utf-8")
            except zlib.error:
                raw = value.decode("utf-8")
        else:
            raw = str(value)
        decoded = json.loads(raw or "[]")
        return decoded if isinstance(decoded, list) else []

    @staticmethod
    def _is_probe_request(request_row: Dict[str, Any]) -> bool:
        client_format = str(request_row.get("client_format") or "").lower()
        endpoint = str(request_row.get("endpoint") or "").lower()
        profile = str(request_row.get("request_profile") or "").lower()
        return (
            client_format in {"admin_probe", "health_probe"}
            or endpoint in {"key_test", "idle_probe", "patrol_probe", "health_probe"}
            or profile in {"admin_probe", "health_probe"}
        )

    def _apply_fact(self, conn, generation: int, fact: Dict[str, Any], sign: int, *, now_i: int) -> None:
        metrics = fact.get("metrics") or {}
        hourly_cutoff = now_i - self.hourly_retention_days * 86400
        if _safe_int(fact.get("hour_bucket")) >= hourly_cutoff:
            self._upsert_aggregate(
                conn,
                "usage_statistics_hourly",
                generation,
                fact,
                sign,
                bucket_start=_safe_int(fact.get("hour_bucket")),
            )
        self._upsert_aggregate(
            conn,
            "usage_statistics_daily",
            generation,
            fact,
            sign,
            bucket_start=_safe_int(fact.get("day_bucket")),
        )
        self._upsert_aggregate(conn, "usage_statistics_totals", generation, fact, sign)

    def _upsert_aggregate(
        self,
        conn,
        table: str,
        generation: int,
        fact: Dict[str, Any],
        sign: int,
        *,
        bucket_start: Optional[int] = None,
    ) -> None:
        dimensions = [str(fact.get(name) or "") for name in DIMENSION_COLUMNS]
        metrics = fact.get("metrics") or {}
        prefix_columns = ["generation"]
        prefix_values: list[Any] = [generation]
        conflict = ["generation"]
        if bucket_start is not None:
            prefix_columns.append("bucket_start")
            prefix_values.append(bucket_start)
            conflict.append("bucket_start")
        prefix_columns.extend(["fact_kind", *DIMENSION_COLUMNS])
        prefix_values.extend([str(fact.get("fact_kind") or ""), *dimensions])
        conflict.extend(["fact_kind", *DIMENSION_COLUMNS])
        additive_values = []
        for name in ADDITIVE_COLUMNS:
            value = safe_float(metrics.get(name)) if name.startswith("cost_") else _safe_int(metrics.get(name))
            additive_values.append(value * sign)
        max_values = [
            _safe_int(metrics.get(name)) if sign > 0 else 0 for name in MAX_COLUMNS
        ]
        columns = [*prefix_columns, *ADDITIVE_COLUMNS, *MAX_COLUMNS]
        placeholders = ",".join("?" for _ in columns)
        update_additive = ", ".join(
            f"{name} = {table}.{name} + excluded.{name}" for name in ADDITIVE_COLUMNS
        )
        update_max = ", ".join(
            f"{name} = MAX({table}.{name}, excluded.{name})" for name in MAX_COLUMNS
        )
        conn.execute(
            f"""
            INSERT INTO {table} ({", ".join(columns)})
            VALUES ({placeholders})
            ON CONFLICT({", ".join(conflict)}) DO UPDATE SET
              {update_additive},
              {update_max}
            """,
            [*prefix_values, *additive_values, *max_values],
        )
        if sign < 0:
            where_columns = prefix_columns
            where = " AND ".join(f"{name} = ?" for name in where_columns)
            conn.execute(
                f"""
                DELETE FROM {table}
                WHERE {where}
                  AND requests = 0 AND attempts = 0 AND total_tokens = 0
                  AND ABS(cost_priced_usd) < 0.000000000001
                  AND ABS(cost_estimated_usd) < 0.000000000001
                  AND ABS(cost_legacy_usd) < 0.000000000001
                """,
                prefix_values,
            )

    def backfill_batch(self, conn, *, limit: int = 250, now: Optional[int] = None) -> Dict[str, Any]:
        if not self.enabled:
            return {"processed": 0, "complete": True}
        now_i = _safe_int(now or time.time())
        meta = self.ensure_meta(conn, now=now_i)
        generation = _safe_int(meta.get("generation")) or 1
        legacy_complete = bool(_safe_int(meta.get("backfill_completed_at")))
        if not legacy_complete and not _safe_int(meta.get("backfill_started_at")):
            conn.execute(
                "UPDATE usage_statistics_meta SET backfill_started_at = ?, updated_at = ? WHERE id = 1",
                (now_i, now_i),
            )
        dirty_rows = conn.execute(
            """
            SELECT request_id FROM usage_statistics_dirty
            ORDER BY marked_at ASC, request_id ASC
            LIMIT ?
            """,
            (max(1, min(2000, _safe_int(limit) or 250)),),
        ).fetchall()
        processed = 0
        for row in dirty_rows:
            request_id = str(row["request_id"] or "")
            self.reconcile_request(conn, request_id, now=now_i)
            conn.execute(
                "DELETE FROM usage_statistics_dirty WHERE request_id = ?",
                (request_id,),
            )
            processed += 1
        if legacy_complete:
            return {"processed": processed, "complete": True}
        remaining = max(1, min(2000, _safe_int(limit) or 250)) - processed
        rows = conn.execute(
            """
            SELECT r.request_id
            FROM requests r
            LEFT JOIN usage_statistics_ledger l
              ON l.generation = ? AND l.request_id = r.request_id
            WHERE l.request_id IS NULL AND r.finished_at > ?
              AND LOWER(r.client_format) NOT IN ('admin_probe', 'health_probe')
              AND LOWER(r.endpoint) NOT IN (
                'key_test', 'idle_probe', 'patrol_probe', 'health_probe'
              )
              AND LOWER(r.request_profile) NOT IN ('admin_probe', 'health_probe')
            ORDER BY r.finished_at ASC, r.request_id ASC
            LIMIT ?
            """,
            (
                generation,
                _safe_int(meta.get("backfill_cutoff_at")),
                max(0, remaining),
            ),
        ).fetchall() if remaining > 0 else []
        for row in rows:
            if self.reconcile_request(conn, str(row["request_id"]), now=now_i):
                processed += 1
        complete = len(rows) == 0
        dirty_remaining = _safe_int(
            conn.execute("SELECT COUNT(*) FROM usage_statistics_dirty").fetchone()[0]
        )
        complete = complete and dirty_remaining == 0
        if complete:
            conn.execute(
                """
                UPDATE usage_statistics_meta
                SET backfill_completed_at = ?, updated_at = ?
                WHERE id = 1
                """,
                (now_i, now_i),
            )
        return {"processed": processed, "complete": complete}

    def prune(self, conn, *, now: Optional[int] = None) -> Dict[str, int]:
        if not self.enabled:
            return {"hourly_deleted": 0, "ledger_deleted": 0}
        now_i = _safe_int(now or time.time())
        meta = self.ensure_meta(conn, now=now_i)
        generation = _safe_int(meta.get("generation")) or 1
        hourly_cutoff = now_i - self.hourly_retention_days * 86400
        ledger_cutoff = now_i - (self.history_retention_days + 1) * 86400
        hourly = conn.execute(
            "DELETE FROM usage_statistics_hourly WHERE generation = ? AND bucket_start < ?",
            (generation, hourly_cutoff),
        )
        ledger = conn.execute(
            "DELETE FROM usage_statistics_ledger WHERE generation = ? AND finished_at < ?",
            (generation, ledger_cutoff),
        )
        conn.execute(
            """
            UPDATE usage_statistics_meta
            SET last_compacted_at = ?, updated_at = ?
            WHERE id = 1
            """,
            (now_i, now_i),
        )
        return {
            "hourly_deleted": max(0, _safe_int(hourly.rowcount)),
            "ledger_deleted": max(0, _safe_int(ledger.rowcount)),
        }

    def clear(self, conn, *, now: Optional[int] = None) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "rows_deleted": 0}
        now_i = _safe_int(now or time.time())
        meta = self.ensure_meta(conn, now=now_i)
        counts = {}
        for table in (
            "usage_statistics_hourly",
            "usage_statistics_daily",
            "usage_statistics_totals",
            "usage_statistics_ledger",
            "usage_statistics_dirty",
        ):
            counts[table] = _safe_int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            conn.execute(f"DELETE FROM {table}")
        generation = (_safe_int(meta.get("generation")) or 1) + 1
        conn.execute(
            """
            UPDATE usage_statistics_meta
            SET schema_version = ?, generation = ?, statistics_started_at = ?,
                backfill_cutoff_at = ?, backfill_started_at = ?,
                backfill_completed_at = ?, last_compacted_at = ?,
                updated_at = ?
            WHERE id = 1
            """,
            (SCHEMA_VERSION, generation, now_i, now_i, now_i, now_i, now_i, now_i),
        )
        return {
            "enabled": True,
            "generation": generation,
            "statistics_started_at": now_i,
            "backfill_cutoff_at": now_i,
            "rows_deleted": sum(counts.values()),
            "tables": counts,
        }

    @staticmethod
    def _parse_time(value: Any, timezone_name: str) -> int:
        if value in (None, ""):
            return 0
        try:
            return int(float(value))
        except (TypeError, ValueError):
            pass
        text = str(value).strip()
        try:
            parsed = _dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=_timezone(timezone_name))
            return int(parsed.timestamp())
        except (TypeError, ValueError):
            raise ValueError(f"invalid time value: {text}")

    def _range(
        self,
        meta: Dict[str, Any],
        range_name: str,
        *,
        start: Any = None,
        end: Any = None,
        now: Optional[int] = None,
    ) -> Dict[str, Any]:
        now_i = _safe_int(now or time.time())
        name = str(range_name or "7d").lower()
        timezone_name = str(meta.get("reporting_timezone") or "+00:00")
        end_i = min(now_i, self._parse_time(end, timezone_name) or now_i)
        if name == "custom":
            start_i = self._parse_time(start, timezone_name)
            if not start_i or start_i >= end_i:
                raise ValueError("custom range requires start < end")
        elif name == "today":
            start_i = self._bucket_start(end_i, timezone_name, "day")
        elif name == "24h":
            start_i = end_i - 86400
        elif name == "7d":
            start_i = end_i - 7 * 86400
        elif name == "30d":
            start_i = end_i - 30 * 86400
        elif name == "90d":
            start_i = end_i - 90 * 86400
        elif name == "1y":
            start_i = end_i - 365 * 86400
        elif name == "all":
            start_i = _safe_int(meta.get("statistics_started_at"))
        else:
            raise ValueError(f"unsupported statistics range: {name}")
        started = _safe_int(meta.get("statistics_started_at"))
        if started:
            start_i = max(start_i, started)
        return {
            "name": name,
            "start": max(0, start_i),
            "end": max(0, end_i),
            "timezone": timezone_name,
        }

    @staticmethod
    def _filters(filters: Optional[Dict[str, Any]]) -> tuple[list[str], list[Any]]:
        filters = filters or {}
        mapping = {
            "model": "client_model",
            "provider": "provider",
            "client_format": "client_format",
            "upstream_format": "upstream_format",
        }
        clauses = []
        params: list[Any] = []
        for key, column in mapping.items():
            value = str(filters.get(key) or "").strip()
            if value:
                clauses.append(f"{column} = ?")
                params.append(value)
        return clauses, params

    @staticmethod
    def _metric_select() -> str:
        sums = ", ".join(f"COALESCE(SUM({name}), 0) AS {name}" for name in ADDITIVE_COLUMNS)
        maxima = ", ".join(f"COALESCE(MAX({name}), 0) AS {name}" for name in MAX_COLUMNS)
        return f"{sums}, {maxima}"

    def _source(
        self,
        meta: Dict[str, Any],
        range_info: Dict[str, Any],
        *,
        resolution: str = "auto",
        for_series: bool = False,
    ) -> tuple[str, str]:
        name = range_info["name"]
        if not for_series and name == "all":
            return "usage_statistics_totals", "total"
        requested = str(resolution or "auto").lower()
        hourly_available_from = _safe_int(time.time()) - self.hourly_retention_days * 86400
        can_hourly = range_info["start"] >= hourly_available_from
        if requested == "hour" and can_hourly:
            return "usage_statistics_hourly", "hour"
        if requested == "day":
            return "usage_statistics_daily", "day"
        if requested not in ("auto", "hour", "day"):
            raise ValueError(f"unsupported resolution: {requested}")
        if can_hourly and range_info["end"] - range_info["start"] <= 90 * 86400:
            return "usage_statistics_hourly", "hour"
        return "usage_statistics_daily", "day"

    @staticmethod
    def _row_payload(row: Any) -> Dict[str, Any]:
        get = lambda name: row[name] if row is not None and name in row.keys() else 0
        requests = _safe_int(get("requests"))
        attempts = _safe_int(get("attempts"))
        request_success = _safe_int(get("request_success"))
        request_failed = _safe_int(get("request_failed"))
        input_tokens = _safe_int(get("input_tokens"))
        cached_tokens = _safe_int(get("cached_input_tokens"))
        first_samples = _safe_int(get("request_first_event_samples"))
        duration_samples = _safe_int(get("request_duration_samples"))
        attempt_first_samples = _safe_int(get("attempt_first_event_samples"))
        attempt_duration_samples = _safe_int(get("attempt_duration_samples"))
        priced = float(get("cost_priced_usd") or 0)
        estimated = float(get("cost_estimated_usd") or 0)
        legacy = float(get("cost_legacy_usd") or 0)
        return {
            "requests": requests,
            "success": request_success,
            "failed": request_failed,
            "recovered": _safe_int(get("recovered")),
            "success_rate": round(request_success / requests, 4) if requests else 0.0,
            "attempts": attempts,
            "attempt_success": _safe_int(get("attempt_success")),
            "attempt_failed": _safe_int(get("attempt_failed")),
            "usage": {
                "input_tokens": input_tokens,
                "uncached_input_tokens": _safe_int(get("uncached_input_tokens")),
                "cached_input_tokens": cached_tokens,
                "cache_write_tokens": _safe_int(get("cache_write_tokens")),
                "output_tokens": _safe_int(get("output_tokens")),
                "reasoning_tokens": _safe_int(get("reasoning_tokens")),
                "total_tokens": _safe_int(get("total_tokens")),
            },
            "cache_rate": round(cached_tokens / input_tokens, 4) if input_tokens else 0.0,
            "cost": {
                "priced_usd": round(priced, 10),
                "estimated_usd": round(estimated, 10),
                "legacy_usd": round(legacy, 10),
                "known_usd": round(priced + estimated + legacy, 10),
                "statuses": {
                    "priced": _safe_int(get("cost_priced_count")),
                    "estimated": _safe_int(get("cost_estimated_count")),
                    "pending": _safe_int(get("cost_pending_count")),
                    "unpriced": _safe_int(get("cost_unpriced_count")),
                    "legacy": _safe_int(get("cost_legacy_count")),
                },
            },
            "latency": {
                "avg_first_event_ms": round(_safe_int(get("request_first_event_ms_sum")) / first_samples) if first_samples else 0,
                "max_first_event_ms": _safe_int(get("request_first_event_ms_max")),
                "first_event_samples": first_samples,
                "avg_duration_ms": round(_safe_int(get("request_duration_ms_sum")) / duration_samples) if duration_samples else 0,
                "max_duration_ms": _safe_int(get("request_duration_ms_max")),
                "duration_samples": duration_samples,
                "avg_attempt_first_event_ms": round(_safe_int(get("attempt_first_event_ms_sum")) / attempt_first_samples) if attempt_first_samples else 0,
                "max_attempt_first_event_ms": _safe_int(get("attempt_first_event_ms_max")),
                "attempt_first_event_samples": attempt_first_samples,
                "avg_attempt_duration_ms": round(_safe_int(get("attempt_duration_ms_sum")) / attempt_duration_samples) if attempt_duration_samples else 0,
                "max_attempt_duration_ms": _safe_int(get("attempt_duration_ms_max")),
                "attempt_duration_samples": attempt_duration_samples,
            },
            "last_used_at": _safe_int(get("last_used_at")),
        }

    def _base_query(
        self,
        meta: Dict[str, Any],
        range_info: Dict[str, Any],
        filters: Optional[Dict[str, Any]],
        *,
        resolution: str = "auto",
        for_series: bool = False,
    ) -> tuple[str, str, str, list[Any]]:
        table, resolved = self._source(
            meta, range_info, resolution=resolution, for_series=for_series
        )
        clauses = ["generation = ?"]
        params: list[Any] = [_safe_int(meta.get("generation")) or 1]
        if table != "usage_statistics_totals":
            clauses.extend(["bucket_start >= ?", "bucket_start <= ?"])
            params.extend(
                [
                    self._bucket_start(
                        range_info["start"], range_info["timezone"], resolved
                    ),
                    self._bucket_start(
                        range_info["end"], range_info["timezone"], resolved
                    ),
                ]
            )
        filter_clauses, filter_params = self._filters(filters)
        clauses.extend(filter_clauses)
        params.extend(filter_params)
        return table, resolved, "WHERE " + " AND ".join(clauses), params

    def status(self, conn) -> Dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "source": "disabled"}
        meta = self.ensure_meta(conn)
        counts = {}
        for table in (
            "usage_statistics_hourly",
            "usage_statistics_daily",
            "usage_statistics_totals",
            "usage_statistics_ledger",
            "usage_statistics_dirty",
        ):
            counts[table] = _safe_int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        generation = _safe_int(meta.get("generation")) or 1
        accounted = _safe_int(
            conn.execute(
                "SELECT COUNT(*) FROM usage_statistics_ledger WHERE generation = ?",
                (generation,),
            ).fetchone()[0]
        )
        dirty = counts.get("usage_statistics_dirty", 0)
        backfill_complete = bool(_safe_int(meta.get("backfill_completed_at")))
        if backfill_complete:
            eligible = accounted
            remaining = dirty
        else:
            eligible = _safe_int(
                conn.execute(
                    """
                    SELECT COUNT(*) FROM requests r
                    WHERE r.finished_at > ?
                      AND LOWER(r.client_format) NOT IN ('admin_probe', 'health_probe')
                      AND LOWER(r.endpoint) NOT IN (
                        'key_test', 'idle_probe', 'patrol_probe', 'health_probe'
                      )
                      AND LOWER(r.request_profile) NOT IN ('admin_probe', 'health_probe')
                    """,
                    (_safe_int(meta.get("backfill_cutoff_at")),),
                ).fetchone()[0]
            )
            remaining = max(dirty, eligible - accounted)
        return {
            "enabled": True,
            "source": "sqlite_aggregate",
            "schema_version": _safe_int(meta.get("schema_version")),
            "generation": _safe_int(meta.get("generation")),
            "reporting_timezone": str(meta.get("reporting_timezone") or ""),
            "statistics_started_at": _safe_int(meta.get("statistics_started_at")),
            "backfill_cutoff_at": _safe_int(meta.get("backfill_cutoff_at")),
            "backfill_started_at": _safe_int(meta.get("backfill_started_at")),
            "backfill_completed_at": _safe_int(meta.get("backfill_completed_at")),
            "partial": (not backfill_complete) or dirty > 0,
            "hourly_retention_days": self.hourly_retention_days,
            "rows": counts,
            "backfill": {
                "eligible": eligible,
                "accounted": accounted,
                "remaining": remaining,
            },
        }

    def detail_prune_allowed(self, conn) -> bool:
        """Do not delete legacy detail until the one-time aggregate backfill finishes."""
        if not self.enabled:
            return True
        meta = self.ensure_meta(conn)
        return bool(_safe_int(meta.get("backfill_completed_at")))

    def summary(
        self,
        conn,
        *,
        range_name: str = "7d",
        start: Any = None,
        end: Any = None,
        filters: Optional[Dict[str, Any]] = None,
        now: Optional[int] = None,
    ) -> Dict[str, Any]:
        meta = self.ensure_meta(conn, now=now)
        range_info = self._range(meta, range_name, start=start, end=end, now=now)
        table, resolution, where, params = self._base_query(meta, range_info, filters)
        row = conn.execute(
            f"SELECT {self._metric_select()} FROM {table} {where}", params
        ).fetchone()
        status = self.status(conn)
        return {
            **status,
            "range": range_info,
            "resolution": resolution,
            "summary": self._row_payload(row),
            "semantics": {
                "requests": "client_requests",
                "usage": "upstream_attempts",
                "cost": "upstream_attempts",
                "latency": "client_requests",
            },
        }

    def timeseries(
        self,
        conn,
        *,
        range_name: str = "7d",
        start: Any = None,
        end: Any = None,
        filters: Optional[Dict[str, Any]] = None,
        resolution: str = "auto",
        metric: str = "tokens",
        now: Optional[int] = None,
    ) -> Dict[str, Any]:
        metric_name = str(metric or "tokens").lower()
        if metric_name not in ("requests", "tokens", "cost", "latency"):
            raise ValueError(f"unsupported statistics metric: {metric_name}")
        meta = self.ensure_meta(conn, now=now)
        range_info = self._range(meta, range_name, start=start, end=end, now=now)
        table, resolved, where, params = self._base_query(
            meta,
            range_info,
            filters,
            resolution=resolution,
            for_series=True,
        )
        base_bucket_s = 3600 if resolved == "hour" else 86400
        source_buckets = max(
            1,
            math.ceil(
                max(1, range_info["end"] - range_info["start"]) / base_bucket_s
            ),
        )
        merge_factor = max(1, math.ceil(source_buckets / 400))
        bucket_s = base_bucket_s * merge_factor
        anchor = self._bucket_start(
            range_info["start"], range_info["timezone"], resolved
        )
        rows = conn.execute(
            f"""
            SELECT
              CAST((bucket_start - ?) / ? AS INTEGER) * ? + ? AS series_start,
              {self._metric_select()}
            FROM {table}
            {where}
            GROUP BY series_start
            ORDER BY series_start ASC
            """,
            [anchor, bucket_s, bucket_s, anchor, *params],
        ).fetchall()
        return {
            **self.status(conn),
            "range": range_info,
            "resolution": resolved,
            "bucket_s": bucket_s,
            "metric": metric_name,
            "points": [
                {"start": _safe_int(row["series_start"]), **self._row_payload(row)}
                for row in rows
            ],
        }

    def breakdown(
        self,
        conn,
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
        now: Optional[int] = None,
    ) -> Dict[str, Any]:
        groups = {
            "model": "client_model",
            "provider": "provider",
            "client_format": "client_format",
            "upstream_format": "upstream_format",
        }
        sorts = {
            "requests": "requests",
            "tokens": "total_tokens",
            "cost": "SUM(cost_priced_usd + cost_estimated_usd + cost_legacy_usd)",
            "failures": "request_failed",
            "latency": "CASE WHEN SUM(request_duration_samples) > 0 THEN CAST(SUM(request_duration_ms_sum) AS REAL) / SUM(request_duration_samples) ELSE 0 END",
        }
        group_name = str(group_by or "model")
        group_column = groups.get(group_name)
        if not group_column:
            raise ValueError(f"unsupported breakdown group: {group_name}")
        sort_name = str(sort or "requests")
        sort_sql = sorts.get(sort_name)
        if not sort_sql:
            raise ValueError(f"unsupported breakdown sort: {sort_name}")
        order_sql = "ASC" if str(order or "desc").lower() == "asc" else "DESC"
        limit_i = max(1, min(500, _safe_int(limit) or 20))
        offset_i = max(0, _safe_int(offset))
        meta = self.ensure_meta(conn, now=now)
        range_info = self._range(meta, range_name, start=start, end=end, now=now)
        table, resolution, where, params = self._base_query(meta, range_info, filters)
        total = _safe_int(
            conn.execute(
                f"SELECT COUNT(DISTINCT {group_column}) FROM {table} {where} AND {group_column} != ''",
                params,
            ).fetchone()[0]
        )
        rows = conn.execute(
            f"""
            SELECT {group_column} AS dimension, {self._metric_select()}
            FROM {table}
            {where} AND {group_column} != ''
            GROUP BY {group_column}
            ORDER BY {sort_sql} {order_sql}, {group_column} ASC
            LIMIT ? OFFSET ?
            """,
            [*params, limit_i, offset_i],
        ).fetchall()
        return {
            **self.status(conn),
            "range": range_info,
            "resolution": resolution,
            "group_by": group_name,
            "sort": sort_name,
            "order": order_sql.lower(),
            "total": total,
            "limit": limit_i,
            "offset": offset_i,
            "fact_kind": "combined_request_and_attempt",
            "items": [
                {
                    "dimension": str(row["dimension"] or ""),
                    **self._row_payload(row),
                }
                for row in rows
            ],
        }

    def dimensions(self, conn) -> Dict[str, Any]:
        meta = self.ensure_meta(conn)
        generation = _safe_int(meta.get("generation")) or 1
        mapping = {
            "models": "client_model",
            "providers": "provider",
            "client_formats": "client_format",
            "upstream_formats": "upstream_format",
        }
        out: Dict[str, Any] = {**self.status(conn)}
        for key, column in mapping.items():
            rows = conn.execute(
                f"""
                SELECT DISTINCT {column} AS value
                FROM usage_statistics_totals
                WHERE generation = ? AND {column} != ''
                ORDER BY {column} ASC
                """,
                (generation,),
            ).fetchall()
            out[key] = [str(row["value"] or "") for row in rows]
        return out
