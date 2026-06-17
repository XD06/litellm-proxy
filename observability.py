#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import hashlib
import threading
import time
from collections import deque
from typing import Any, Dict, Optional

from history_store import RequestHistoryStore
from routing_explain import enrich_request
from usage_accounting import add_usage_totals, empty_usage, estimate_cost_usd, has_usage, normalize_usage, safe_float


def empty_usage_with_cost() -> Dict[str, Any]:
    out: Dict[str, Any] = empty_usage()
    out["cost_usd"] = 0.0
    return out


def aggregate_attempt_usage(attempts: Any) -> tuple[Dict[str, int], float]:
    usage = empty_usage()
    cost_usd = 0.0
    for attempt in attempts or []:
        if not isinstance(attempt, dict):
            continue
        attempt_usage = normalize_usage(attempt.get("usage") or attempt)
        if not has_usage(attempt_usage):
            continue
        usage["input_tokens"] += attempt_usage["input_tokens"]
        usage["output_tokens"] += attempt_usage["output_tokens"]
        usage["total_tokens"] += attempt_usage["total_tokens"]
        cost_usd += safe_float(attempt.get("cost_usd"))
    return usage, round(cost_usd, 10)


class ProxyObservability:
    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg
        self._lock = threading.Lock()
        self._started_at = time.time()
        self._active: Dict[str, Dict[str, Any]] = {}
        self._recent = deque(maxlen=self._recent_limit())
        self._counters = self._new_counters()
        self._history = RequestHistoryStore(cfg)
        self._restore_counters_from_history()

    def _restore_counters_from_history(self) -> None:
        counters = self._history.rebuild_counters()
        if counters is None:
            return
        recent = self._history.recent_requests(self._recent_limit())
        with self._lock:
            in_flight = int(self._counters.get("requests_in_flight") or 0)
            self._counters = counters
            self._counters["requests_in_flight"] = in_flight
            if recent is not None:
                self._recent = deque(recent, maxlen=self._recent_limit())

    def _recent_limit(self) -> int:
        try:
            return int((self.cfg.get("observability") or {}).get("recent_requests_limit", 200))
        except Exception:
            return 200

    def _new_counters(self) -> Dict[str, Any]:
        return {
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

    def migrate_counters_from(self, old_obs: "ProxyObservability") -> None:
        """从旧实例接管内存计数器/最近请求/在途请求/启动时间。

        热加载配置时调用：避免每次改配置都把 provider 统计清零。
        _history（SQLite）在新实例 __init__ 已重新打开，无需迁移。"""
        if old_obs is None:
            return
        if hasattr(old_obs, "_history") and old_obs._history:
            try:
                old_obs._history.shutdown()
            except Exception:
                pass
        with old_obs._lock:
            counters = old_obs._counters
            recent = old_obs._recent
            active = dict(old_obs._active)
            started_at = old_obs._started_at
        with self._lock:
            self._counters = counters
            self._recent = recent
            self._active = active
            self._started_at = started_at

    def reset(self) -> None:
        with self._lock:
            self._started_at = time.time()
            self._active.clear()
            self._recent = deque(maxlen=self._recent_limit())
            self._counters = self._new_counters()

    def clear_history(self) -> Dict[str, Any]:
        history_result = self._history.clear()
        with self._lock:
            active_count = len(self._active)
            self._started_at = time.time()
            self._recent = deque(maxlen=self._recent_limit())
            self._counters = self._new_counters()
            self._counters["requests_in_flight"] = active_count
        return {
            "memory": {
                "recent_requests_cleared": True,
                "counters_reset": True,
                "active_requests_preserved": active_count,
            },
            "history": history_result,
        }

    def delete_requests(self, request_ids: Any) -> Dict[str, Any]:
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

        history_result = self._history.delete_requests(ids)
        with self._lock:
            before = len(self._recent)
            remaining = [item for item in self._recent if str(item.get("request_id") or "") not in seen]
            self._recent = deque(remaining, maxlen=self._recent_limit())
            recent_deleted = before - len(self._recent)
        return {
            "memory": {
                "requested": len(ids),
                "recent_requests_deleted": recent_deleted,
            },
            "history": history_result,
        }

    def delete_matching_requests(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        filters = filters or {}
        history_result = self._history.delete_matching_requests(filters)
        with self._lock:
            before = len(self._recent)
            remaining = [
                item for item in self._recent
                if not self._matches_request_filters(self._summarize_request(item), filters)
            ]
            self._recent = deque(remaining, maxlen=self._recent_limit())
            recent_deleted = before - len(self._recent)
        return {
            "memory": {
                "filters": self._copy_value(filters),
                "recent_requests_deleted": recent_deleted,
            },
            "history": history_result,
        }

    def record_request_start(
        self,
        request_id: str,
        *,
        client_format: str,
        endpoint: str,
        model: str,
        stream: bool,
        path: str,
    ) -> None:
        now = time.time()
        with self._lock:
            self._counters["requests_total"] += 1
            self._counters["requests_in_flight"] += 1
            self._inc_dict(self._counters["by_client_format"], client_format or "unknown")
            self._inc_dict(self._counters["by_endpoint"], endpoint or "unknown")
            self._inc_dict(self._counters["by_model"], model or "")
            self._active[request_id] = {
                "request_id": request_id,
                "client_format": client_format or "unknown",
                "endpoint": endpoint or "unknown",
                "model": model or "",
                "stream": bool(stream),
                "path": path,
                "started_at": now,
                "attempts": [],
            }

    def record_attempt(
        self,
        request_id: str,
        attempt: Any,
        *,
        outcome: str,
        error_type: str = "",
        reason: str = "",
        http_status: Optional[int] = None,
        usage: Optional[Dict[str, Any]] = None,
        duration_ms: Optional[int] = None,
        diagnostic_stage: str = "",
        upstream_error_summary: str = "",
        upstream_error_type: str = "",
        upstream_error_code: str = "",
        upstream_error_param: str = "",
    ) -> None:
        provider = str(getattr(attempt, "provider", "") or "unknown")
        upstream_format = str(getattr(attempt, "upstream_format", "") or "unknown")
        provider_model = str(getattr(attempt, "provider_model", "") or "")
        raw_key = str(getattr(attempt, "key", "") or "")
        item = {
            "attempt_no": int(getattr(attempt, "attempt_no", 0) or 0),
            "provider": provider,
            "key_index": int(getattr(attempt, "key_index", 0) or 0),
            "provider_model": provider_model,
            "upstream_format": upstream_format,
            "outcome": outcome,
        }
        if duration_ms is not None:
            item["duration_ms"] = max(0, int(duration_ms or 0))
        if raw_key:
            item["key_masked"] = self._mask_secret(raw_key)
            item["key_id"] = self._hash_secret_short(raw_key)
        if error_type:
            item["error_type"] = error_type
        if reason:
            item["reason"] = reason
        if http_status is not None:
            item["http_status"] = int(http_status)
        for key, value in {
            "diagnostic_stage": diagnostic_stage,
            "upstream_error_summary": upstream_error_summary,
            "upstream_error_type": upstream_error_type,
            "upstream_error_code": upstream_error_code,
            "upstream_error_param": upstream_error_param,
        }.items():
            text = str(value or "").strip()
            if text:
                item[key] = text[:500]
        usage_totals = normalize_usage(usage)
        cost_usd = estimate_cost_usd(self.cfg, provider, provider_model, usage_totals)
        if has_usage(usage_totals):
            item["usage"] = usage_totals
            item["input_tokens"] = usage_totals["input_tokens"]
            item["output_tokens"] = usage_totals["output_tokens"]
            item["total_tokens"] = usage_totals["total_tokens"]
            item["cost_usd"] = cost_usd

        with self._lock:
            self._counters["attempts_total"] += 1
            if outcome == "success":
                self._counters["attempts_success"] += 1
            else:
                self._counters["attempts_failed"] += 1
            prov = self._counters["by_provider"].setdefault(
                provider,
                {"attempts": 0, "success": 0, "failed": 0, "by_upstream_format": {}, "usage": empty_usage_with_cost()},
            )
            prov.setdefault("usage", empty_usage_with_cost())
            prov["attempts"] += 1
            if outcome == "success":
                prov["success"] += 1
                if has_usage(usage_totals):
                    add_usage_totals(prov["usage"], usage_totals, cost_usd=cost_usd)
            else:
                prov["failed"] += 1
                if error_type:
                    self._inc_dict(self._counters["by_error_type"], error_type)
                if reason:
                    self._inc_dict(self._counters["by_failure_reason"], reason)
                if http_status is not None:
                    self._inc_dict(self._counters["by_attempt_http_status"], str(int(http_status)))
            self._inc_dict(prov["by_upstream_format"], upstream_format)

            active = self._active.get(request_id)
            if active is not None:
                active.setdefault("attempts", []).append(item)

    def record_first_byte(self, request_id: str, first_byte_ms: Optional[int] = None) -> None:
        rid = str(request_id or "")
        if not rid:
            return
        now = time.time()
        with self._lock:
            active = self._active.get(rid)
            if active is None:
                return
            if int(active.get("first_byte_ms") or 0) > 0:
                return
            if first_byte_ms is None:
                first_byte_ms = int((now - float(active.get("started_at") or now)) * 1000)
            active["first_byte_ms"] = max(0, int(first_byte_ms or 0))

    def record_request_end(
        self,
        request_id: str,
        *,
        status_code: int,
        error: str = "",
        usage: Optional[Dict[str, Any]] = None,
        cost_usd: Optional[float] = None,
    ) -> None:
        now = time.time()
        with self._lock:
            active = self._active.pop(request_id, None)
            if self._counters["requests_in_flight"] > 0:
                self._counters["requests_in_flight"] -= 1
            status_key = str(int(status_code or 0))
            self._inc_dict(self._counters["by_status"], status_key)
            if int(status_code or 0) < 400:
                self._counters["requests_success"] += 1
            else:
                self._counters["requests_failed"] += 1

            if active is None:
                active = {"request_id": request_id, "started_at": now, "attempts": []}
            duration_ms = int((now - float(active.get("started_at") or now)) * 1000)
            usage_totals = normalize_usage(usage)
            cost_total = safe_float(cost_usd)
            if not has_usage(usage_totals):
                usage_totals, cost_total = aggregate_attempt_usage(active.get("attempts") or [])
            recent_item = {
                "request_id": request_id,
                "client_format": active.get("client_format", "unknown"),
                "endpoint": active.get("endpoint", "unknown"),
                "model": active.get("model", ""),
                "stream": bool(active.get("stream", False)),
                "path": active.get("path", ""),
                "status_code": int(status_code or 0),
                "duration_ms": max(0, duration_ms),
                "first_byte_ms": max(0, int(active.get("first_byte_ms") or 0)),
                "attempts": list(active.get("attempts") or []),
                "finished_at": int(now),
            }
            if has_usage(usage_totals):
                recent_item["usage"] = usage_totals
                recent_item["input_tokens"] = usage_totals["input_tokens"]
                recent_item["output_tokens"] = usage_totals["output_tokens"]
                recent_item["total_tokens"] = usage_totals["total_tokens"]
                recent_item["cost_usd"] = round(cost_total, 10)
                add_usage_totals(self._counters["usage"], usage_totals, cost_usd=cost_total)
                model_usage = self._counters["by_model_usage"].setdefault(
                    str(active.get("model") or ""),
                    empty_usage_with_cost(),
                )
                add_usage_totals(model_usage, usage_totals, cost_usd=cost_total)
            if error:
                recent_item["error"] = str(error)[:500]
            self._recent.appendleft(recent_item)
        self._history.record_request(recent_item)

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            counters = {
                key: self._copy_value(value)
                for key, value in self._counters.items()
            }
            recent = [self._copy_value(item) for item in self._recent]
            active = [self._copy_value(item) for item in self._active.values()]
            return {
                "started_at": int(self._started_at),
                "uptime_s": int(time.time() - self._started_at),
                "counters": self._with_derived_counters(counters),
                "failure_summary": self._failure_summary_from_requests(recent),
                "recent_requests": recent,
                "active_requests": [
                    {
                        "request_id": item.get("request_id"),
                        "client_format": item.get("client_format"),
                        "endpoint": item.get("endpoint"),
                        "model": item.get("model"),
                        "stream": item.get("stream"),
                        "path": item.get("path"),
                        "duration_ms": int((time.time() - float(item.get("started_at") or time.time())) * 1000),
                        "first_byte_ms": int(item.get("first_byte_ms") or 0),
                        "attempts": self._copy_value(list(item.get("attempts") or [])),
                    }
                    for item in active
                ],
            }

    def snapshot_lite(self) -> Dict[str, Any]:
        """Lightweight snapshot for high-frequency polling.

        Same shape as snapshot() but omits recent_requests (the ~hundreds of KB
        payload that only the requests view and detail drawers actually need).
        counters and failure_summary are still included because they are cheap
        and drive every dashboard view.
        """
        with self._lock:
            counters = {
                key: self._copy_value(value)
                for key, value in self._counters.items()
            }
            recent = [self._copy_value(item) for item in self._recent]
            active = [self._copy_value(item) for item in self._active.values()]
        return {
            "started_at": int(self._started_at),
            "uptime_s": int(time.time() - self._started_at),
            "counters": self._with_derived_counters(counters),
            "failure_summary": self._failure_summary_from_requests(recent),
            "active_requests": [
                {
                    "request_id": item.get("request_id"),
                    "client_format": item.get("client_format"),
                    "endpoint": item.get("endpoint"),
                    "model": item.get("model"),
                    "stream": item.get("stream"),
                    "path": item.get("path"),
                    "duration_ms": int((time.time() - float(item.get("started_at") or time.time())) * 1000),
                    "first_byte_ms": int(item.get("first_byte_ms") or 0),
                    "attempts": self._copy_value(list(item.get("attempts") or [])),
                }
                for item in active
            ],
        }

    def provider_activity_summary(
        self, limit: int = 60, include_events: bool = False
    ) -> Dict[str, Dict[str, Any]]:
        """Aggregate per-provider recent activity in a single pass.

        Replaces the frontend pattern of calling providerActivity(name) per
        provider, each of which re-scanned all recent_requests. Returns one
        entry per provider with the same derived fields the frontend consumed:
        total/ok/warn/bad counts, successRate, latestLatency, avgLatency,
        lastError. The per-event list is omitted by default because it is only
        consumed by the provider drawer's recent-activity panel, not by the
        provider table or overview cards — emitting it for every provider on
        every 5s poll made this the single largest admin payload.

        ``limit`` matches the frontend's events.slice(-60) window so numbers
        stay consistent with the previous client-side computation.
        """
        try:
            limit = max(1, min(200, int(limit)))
        except Exception:
            limit = 60
        with self._lock:
            recent = [self._copy_value(item) for item in self._recent]
        summary = self._provider_activity_from_recent(recent, limit)
        if not include_events:
            for entry in summary.values():
                entry.pop("events", None)
        return summary

    def provider_activity_for(
        self, provider: str, limit: int = 60
    ) -> Optional[Dict[str, Any]]:
        """Return the full activity entry (with events) for a single provider.

        Used by the provider drawer's recent-activity panel, which only needs
        one provider's events. Cheaper than computing the full per-provider
        aggregate when only one provider is on screen.
        """
        try:
            limit = max(1, min(200, int(limit)))
        except Exception:
            limit = 60
        with self._lock:
            recent = [self._copy_value(item) for item in self._recent]
        summary = self._provider_activity_from_recent(recent, limit)
        return summary.get(provider)

    @classmethod
    def _provider_activity_from_recent(
        cls, recent: Any, limit: int
    ) -> Dict[str, Dict[str, Any]]:
        """One-pass aggregation mirroring the prior frontend providerActivity().

        Per request, a provider is credited when one of its attempts ran or it
        was the routing_summary.final_provider. tone/latency rules match the
        legacy client code exactly so dashboards do not visibly change.
        """
        per_provider: Dict[str, Dict[str, Any]] = {}
        for item in recent or []:
            attempts = list(item.get("attempts") or [])
            routing_summary = item.get("routing_summary") or {}
            final_provider = str(routing_summary.get("final_provider") or "")
            status_code = int(item.get("status_code") or 0)
            # recent_items lack a derived "status"; reconstruct it for parity.
            request_status = "success" if status_code and status_code < 400 else "failed"
            first_byte_ms = int(item.get("first_byte_ms") or 0)
            involved: Dict[str, Dict[str, Any]] = {}

            def ensure(name: str) -> Dict[str, Any]:
                entry = involved.get(name)
                if entry is None:
                    entry = {"success": False, "failed_reason": ""}
                    involved[name] = entry
                return entry

            for attempt in attempts:
                name = str(attempt.get("provider") or "")
                if not name:
                    continue
                entry = ensure(name)
                if str(attempt.get("outcome") or "") == "success":
                    entry["success"] = True
                else:
                    reason = attempt.get("reason") or attempt.get("error_type") or ""
                    if reason and not entry.get("failed_reason"):
                        entry["failed_reason"] = str(reason)

            if final_provider and final_provider not in involved:
                ensure(final_provider)

            for name, entry in involved.items():
                success_here = bool(entry.get("success"))
                final_success = request_status == "success" and name == final_provider
                if success_here or final_success:
                    tone = "ok"
                elif request_status == "success":
                    tone = "warn"
                else:
                    tone = "bad"
                reason = entry.get("failed_reason") or (item.get("error") if tone != "ok" else "") or request_status
                latency = first_byte_ms if (success_here or final_success) and first_byte_ms > 0 else 0
                event = {
                    "requestId": str(item.get("request_id") or ""),
                    "ts": int(item.get("finished_at") or 0),
                    "model": str(item.get("model") or "-"),
                    "tone": tone,
                    "reason": str(reason or "-"),
                    "latencyMs": latency,
                    "status": request_status,
                }
                bucket = per_provider.setdefault(
                    name,
                    {
                        "events": [],
                        "total": 0,
                        "ok": 0,
                        "warn": 0,
                        "bad": 0,
                        "latency_samples": [],
                        "successRate": None,
                        "latestLatency": 0,
                        "avgLatency": 0,
                        "lastError": None,
                    },
                )
                bucket["events"].append(event)
                bucket["total"] += 1

        for name, bucket in per_provider.items():
            events = bucket["events"]
            # recent_items are appendleft (newest first); sort ascending then clip.
            events.sort(key=lambda ev: int(ev.get("ts") or 0))
            clipped = events[-limit:]
            bucket["events"] = clipped
            bucket["total"] = len(clipped)
            bucket["ok"] = sum(1 for ev in clipped if ev.get("tone") == "ok")
            bucket["warn"] = sum(1 for ev in clipped if ev.get("tone") == "warn")
            bucket["bad"] = sum(1 for ev in clipped if ev.get("tone") == "bad")
            samples = [int(ev.get("latencyMs") or 0) for ev in clipped if int(ev.get("latencyMs") or 0) > 0]
            bucket["latestLatency"] = samples[-1] if samples else 0
            bucket["avgLatency"] = round(sum(samples) / len(samples)) if samples else 0
            bucket["successRate"] = (bucket["ok"] / len(clipped)) if clipped else None
            last_err = next((ev for ev in reversed(clipped) if ev.get("tone") != "ok"), None)
            bucket["lastError"] = last_err
            bucket.pop("latency_samples", None)
        return per_provider

    def list_requests(
        self,
        *,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        filters = filters or {}
        try:
            limit = max(1, min(500, int(limit)))
        except Exception:
            limit = 50
        try:
            offset = max(0, int(offset))
        except Exception:
            offset = 0

        history = self._history.list_requests(filters=filters, limit=limit, offset=offset)
        if history is not None:
            return history

        with self._lock:
            items = [self._summarize_request(item) for item in self._recent]

        filtered = [item for item in items if self._matches_request_filters(item, filters)]
        return {
            "source": "memory",
            "total": len(filtered),
            "limit": limit,
            "offset": offset,
            "filters": self._copy_value(filters),
            "items": filtered[offset : offset + limit],
        }

    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        rid = str(request_id or "")
        if not rid:
            return None
        history = self._history.get_request(rid)
        if history is not None:
            return history
        now = time.time()
        with self._lock:
            active = self._active.get(rid)
            if active is not None:
                return enrich_request({
                    "state": "active",
                    "request_id": active.get("request_id"),
                    "client_format": active.get("client_format"),
                    "endpoint": active.get("endpoint"),
                    "model": active.get("model"),
                    "stream": bool(active.get("stream", False)),
                    "path": active.get("path", ""),
                    "duration_ms": int((now - float(active.get("started_at") or now)) * 1000),
                    "first_byte_ms": int(active.get("first_byte_ms") or 0),
                    "attempts": self._copy_value(list(active.get("attempts") or [])),
                })
            for item in self._recent:
                if str(item.get("request_id") or "") == rid:
                    detail = self._copy_value(item)
                    detail["state"] = "finished"
                    return enrich_request(detail)
        return None

    def timeseries(self, *, bucket_s: int = 60, buckets: int = 30) -> Dict[str, Any]:
        try:
            bucket_s = max(1, int(bucket_s))
        except Exception:
            bucket_s = 60
        try:
            buckets = max(1, min(240, int(buckets)))
        except Exception:
            buckets = 30

        history = self._history.timeseries(bucket_s=bucket_s, buckets=buckets)
        if history is not None:
            return history

        now = int(time.time())
        end = ((now // bucket_s) + 1) * bucket_s
        start = end - bucket_s * buckets
        series = [self._new_bucket(start + i * bucket_s, bucket_s) for i in range(buckets)]

        with self._lock:
            recent = [self._copy_value(item) for item in self._recent]

        for item in recent:
            finished_at = int(item.get("finished_at") or 0)
            if finished_at < start or finished_at >= end:
                continue
            idx = min(buckets - 1, max(0, (finished_at - start) // bucket_s))
            bucket = series[idx]
            status_code = int(item.get("status_code") or 0)
            bucket["requests"] += 1
            if status_code < 400:
                bucket["success"] += 1
            else:
                bucket["failed"] += 1
            self._inc_dict(bucket["by_client_format"], item.get("client_format") or "unknown")
            self._inc_dict(bucket["by_status"], str(status_code))
            self._inc_dict(bucket["by_model"], item.get("model") or "")
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
                self._inc_dict(bucket["by_provider_attempts"], attempt.get("provider") or "unknown")
                self._inc_dict(bucket["by_upstream_format_attempts"], attempt.get("upstream_format") or "unknown")
                self._inc_nested_attempt(bucket["by_provider"], attempt.get("provider") or "unknown", attempt)
                self._inc_nested_attempt(bucket["by_upstream_format"], attempt.get("upstream_format") or "unknown", attempt)
                if attempt.get("error_type"):
                    self._inc_dict(bucket["by_error_type"], attempt.get("error_type"))
                if attempt.get("reason"):
                    self._inc_dict(bucket["by_failure_reason"], attempt.get("reason"))
                if attempt.get("http_status") is not None:
                    self._inc_dict(bucket["by_attempt_http_status"], str(int(attempt.get("http_status") or 0)))

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

        return {
            "source": "memory",
            "bucket_s": bucket_s,
            "buckets": series,
        }

    @staticmethod
    def _inc_dict(d: Dict[str, int], key: str) -> None:
        d[str(key)] = int(d.get(str(key), 0)) + 1

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

    @classmethod
    def _with_derived_counters(cls, counters: Dict[str, Any]) -> Dict[str, Any]:
        requests_total = int(counters.get("requests_total") or 0)
        requests_failed = int(counters.get("requests_failed") or 0)
        attempts_total = int(counters.get("attempts_total") or 0)
        attempts_failed = int(counters.get("attempts_failed") or 0)
        counters["request_failure_rate"] = (requests_failed / requests_total) if requests_total else 0.0
        counters["attempt_failure_rate"] = (attempts_failed / attempts_total) if attempts_total else 0.0

        by_provider = counters.get("by_provider") or {}
        for provider_stats in by_provider.values():
            attempts = int(provider_stats.get("attempts") or 0)
            failed = int(provider_stats.get("failed") or 0)
            provider_stats["failure_rate"] = (failed / attempts) if attempts else 0.0
        return counters

    @classmethod
    def _failure_summary_from_requests(cls, requests: Any) -> Dict[str, Any]:
        summary = {
            "failed_requests": 0,
            "requests_with_failed_attempts": 0,
            "failed_attempts": 0,
            "by_error_type": {},
            "by_failure_reason": {},
            "by_http_status": {},
            "by_provider": {},
            "by_upstream_format": {},
        }
        for item in requests or []:
            if int(item.get("status_code") or 0) >= 400:
                summary["failed_requests"] += 1
            request_has_failed_attempt = False
            for attempt in item.get("attempts") or []:
                if str(attempt.get("outcome") or "") == "success":
                    continue
                request_has_failed_attempt = True
                summary["failed_attempts"] += 1
                if attempt.get("error_type"):
                    cls._inc_dict(summary["by_error_type"], attempt.get("error_type"))
                if attempt.get("reason"):
                    cls._inc_dict(summary["by_failure_reason"], attempt.get("reason"))
                if attempt.get("http_status") is not None:
                    cls._inc_dict(summary["by_http_status"], str(int(attempt.get("http_status") or 0)))
                cls._inc_dict(summary["by_provider"], attempt.get("provider") or "unknown")
                cls._inc_dict(summary["by_upstream_format"], attempt.get("upstream_format") or "unknown")
            if request_has_failed_attempt:
                summary["requests_with_failed_attempts"] += 1
        return summary

    @classmethod
    def _summarize_request(cls, item: Dict[str, Any]) -> Dict[str, Any]:
        attempts = list(item.get("attempts") or [])
        providers = cls._unique_sorted(a.get("provider") for a in attempts)
        upstream_formats = cls._unique_sorted(a.get("upstream_format") for a in attempts)
        error_types = cls._unique_sorted(a.get("error_type") for a in attempts if a.get("error_type"))
        failure_reasons = cls._unique_sorted(a.get("reason") for a in attempts if a.get("reason"))
        http_statuses = cls._unique_sorted(str(a.get("http_status")) for a in attempts if a.get("http_status") is not None)
        outcomes = cls._unique_sorted(a.get("outcome") for a in attempts if a.get("outcome"))
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
            "providers": providers,
            "upstream_formats": upstream_formats,
            "error_types": error_types,
            "failure_reasons": failure_reasons,
            "attempt_http_statuses": http_statuses,
            "attempt_outcomes": outcomes,
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

    @classmethod
    def _matches_request_filters(cls, item: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        status = str(filters.get("status") or "").strip().lower()
        if status and str(item.get("status") or "").lower() != status:
            return False
        for key in ("client_format", "endpoint"):
            value = str(filters.get(key) or "").strip()
            if value and str(item.get(key) or "") != value:
                return False
        model = str(filters.get("model") or "").strip().lower()
        if model and model not in str(item.get("model") or "").lower():
            return False
        provider = str(filters.get("provider") or "").strip().lower()
        if provider and not any(provider in str(p).lower() for p in (item.get("providers") or [])):
            return False
        upstream_format = str(filters.get("upstream_format") or "").strip().lower()
        if upstream_format and not any(upstream_format in str(uf).lower() for uf in (item.get("upstream_formats") or [])):
            return False
        error_type = str(filters.get("error_type") or "").strip().lower()
        if error_type and not any(error_type in str(et).lower() for et in (item.get("error_types") or [])):
            return False
        failure_reason = str(filters.get("failure_reason") or filters.get("reason") or "").strip().lower()
        if failure_reason and not any(failure_reason in str(fr).lower() for fr in (item.get("failure_reasons") or [])):
            return False
        http_status = str(filters.get("http_status") or "").strip().lower()
        if http_status and not any(http_status in str(hs).lower() for hs in (item.get("attempt_http_statuses") or [])):
            return False
        request_status_code = str(filters.get("status_code") or "").strip()
        if request_status_code and request_status_code != str(item.get("status_code") or ""):
            return False
        return True

    @staticmethod
    def _unique_sorted(values: Any) -> list:
        seen = set()
        out = []
        for value in values:
            if not value:
                continue
            value = str(value)
            if value in seen:
                continue
            seen.add(value)
            out.append(value)
        return sorted(out)

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
    def _copy_value(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return {k: cls._copy_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [cls._copy_value(v) for v in value]
        return value

    @staticmethod
    def _mask_secret(value: str, prefix: int = 6, suffix: int = 4) -> str:
        text = str(value or "")
        if not text:
            return ""
        if len(text) <= 4:
            return "*" * len(text)
        if len(text) <= prefix + suffix:
            return f"{text[:2]}**{text[-2:]}"
        return f"{text[:prefix]}**{text[-suffix:]}"

    @staticmethod
    def _hash_secret_short(value: str) -> str:
        text = str(value or "")
        if not text:
            return ""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]
