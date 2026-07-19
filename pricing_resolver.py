#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import heapq
import queue
import threading
import time
from typing import Any, Dict, Optional, Tuple

from usage_accounting import resolve_price_snapshot


class PricingResolver:
    def __init__(self, cfg: Dict[str, Any], history: Any):
        self.cfg = cfg or {}
        self.history = history
        pricing_cfg = ((self.cfg.get("observability") or {}).get("pricing") or {})
        self.enabled = bool(pricing_cfg.get("resolve_missing_prices", True))
        self.proxy = str(pricing_cfg.get("proxy") or "") or None
        self.max_retries = max(0, min(5, int(pricing_cfg.get("max_retries", 2))))
        self.retry_backoff_s = max(0.0, min(30.0, float(pricing_cfg.get("retry_backoff_s", 1.0))))
        self.connect_timeout_s = max(0.5, min(15.0, float(pricing_cfg.get("connect_timeout_s", 3.0))))
        self.total_timeout_s = max(
            self.connect_timeout_s,
            min(30.0, float(pricing_cfg.get("total_timeout_s", 8.0))),
        )
        queue_size = max(4, min(1000, int(pricing_cfg.get("queue_size", 64))))
        self._queue: queue.Queue = queue.Queue(maxsize=queue_size)
        self._lock = threading.Lock()
        self._queued: set[Tuple[str, str]] = set()
        self._resolved: Dict[Tuple[str, str], Dict[str, Any]] = {}
        self._running = True
        self._thread: Optional[threading.Thread] = None
        self.dropped = 0
        self.failures = 0
        self.backfill_failures = 0

    def local_snapshot(self, provider: str, provider_model: str) -> Optional[Dict[str, Any]]:
        key = (str(provider or ""), str(provider_model or ""))
        with self._lock:
            cached = self._resolved.get(key)
        if cached:
            return dict(cached)
        return resolve_price_snapshot(self.cfg, key[0], key[1])

    def enqueue(self, provider: str, provider_model: str) -> bool:
        if not self.enabled:
            return False
        key = (str(provider or ""), str(provider_model or ""))
        if not key[0] or not key[1]:
            return False
        with self._lock:
            if key in self._queued or key in self._resolved:
                return False
            self._queued.add(key)
            self._ensure_worker_locked()
        try:
            self._queue.put_nowait((key, 0))
            return True
        except queue.Full:
            with self._lock:
                self._queued.discard(key)
                self.dropped += 1
            return False

    def _ensure_worker_locked(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="pricing-resolver", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        retries = []
        sequence = 0
        while self._running:
            queued_item = False
            now = time.monotonic()
            if retries and retries[0][0] <= now:
                _, _, key, retry = heapq.heappop(retries)
            else:
                timeout = 1.0
                if retries:
                    timeout = max(0.01, min(1.0, retries[0][0] - now))
                try:
                    item = self._queue.get(timeout=timeout)
                except queue.Empty:
                    continue
                queued_item = True
                if item is None:
                    self._queue.task_done()
                    return
                key, retry = item

            provider, provider_model = key
            try:
                snapshot = self._fetch(provider, provider_model)
                if snapshot:
                    with self._lock:
                        self._resolved[key] = snapshot
                        self._queued.discard(key)
                    try:
                        self.history.backfill_pending_pricing(provider, provider_model, snapshot)
                    except Exception as exc:
                        self._record_backfill_failure("backfill", provider, provider_model, exc)
                elif retry < self.max_retries and self._running:
                    delay = self.retry_backoff_s * (2 ** retry)
                    sequence += 1
                    heapq.heappush(retries, (time.monotonic() + delay, sequence, key, retry + 1))
                else:
                    with self._lock:
                        self._queued.discard(key)
                        self.failures += 1
                    try:
                        self.history.mark_pending_unpriced(provider, provider_model)
                    except Exception as exc:
                        self._record_backfill_failure("mark_unpriced", provider, provider_model, exc)
            finally:
                if queued_item:
                    self._queue.task_done()

    def _record_backfill_failure(self, action: str, provider: str, provider_model: str, exc: Exception) -> None:
        with self._lock:
            self.backfill_failures += 1
            count = self.backfill_failures
        if count <= 3 or count % 100 == 0:
            print(
                f"[pricing] {action} failed for {provider}/{provider_model} "
                f"({count} total): {type(exc).__name__}: {exc}",
                flush=True,
            )

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "queued": len(self._queued),
                "resolved": len(self._resolved),
                "dropped": int(self.dropped),
                "failures": int(self.failures),
                "backfill_failures": int(self.backfill_failures),
            }

    def _fetch(self, provider: str, provider_model: str) -> Optional[Dict[str, Any]]:
        try:
            from artificial_analysis_api import aa

            result = aa.get(
                provider_model,
                proxy=self.proxy,
                connect_timeout_s=self.connect_timeout_s,
                total_timeout_s=self.total_timeout_s,
            )
            if not isinstance(result, dict) or result.get("error"):
                return None
            return resolve_price_snapshot(self.cfg, provider, provider_model)
        except Exception:
            return None

    def shutdown(self) -> None:
        self._running = False
        try:
            self._queue.put_nowait(None)
        except queue.Full:
            pass
        if self._thread is not None:
            self._thread.join(timeout=1.0)
