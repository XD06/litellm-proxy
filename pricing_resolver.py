#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import heapq
import queue
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

from usage_accounting import resolve_price_snapshot


class PricingResolver:
    def __init__(
        self,
        cfg: Dict[str, Any],
        history: Any,
        *,
        network_clear_fn: Optional[Callable[[], bool]] = None,
        defer_interval_s: float = 5.0,
        max_defer_s: float = 1800.0,
    ):
        self.cfg = cfg or {}
        self.history = history
        pricing_cfg = ((self.cfg.get("observability") or {}).get("pricing") or {})
        self.enabled = bool(pricing_cfg.get("resolve_missing_prices", True))
        # Yield to live traffic: when network_clear_fn() reports the network
        # is busy with real requests, pending AA fetches are pushed back onto
        # the retry heap on a short cadence instead of competing for bandwidth.
        # max_defer_s (config: background.max_defer_s) is the starvation cap —
        # an item deferred longer than that goes through anyway so 24/7
        # traffic cannot starve price resolution forever.
        self._network_clear_fn = network_clear_fn
        self._defer_interval_s = max(0.5, float(defer_interval_s))
        background_cfg = (self.cfg.get("background") or {})
        try:
            self._max_defer_s = max(0.0, float(background_cfg.get("max_defer_s", max_defer_s)))
        except (TypeError, ValueError):
            self._max_defer_s = max_defer_s
        self._deferred_since: Dict[Tuple[str, str], float] = {}
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
                if self._should_defer(key):
                    sequence += 1
                    heapq.heappush(
                        retries,
                        (time.monotonic() + self._defer_interval_s, sequence, key, retry),
                    )
                    if queued_item:
                        self._queue.task_done()
                        queued_item = False
                    continue
                snapshot = self._fetch(provider, provider_model)
                if snapshot:
                    with self._lock:
                        self._resolved[key] = snapshot
                        self._queued.discard(key)
                        self._deferred_since.pop(key, None)
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
                        self._deferred_since.pop(key, None)
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
                "deferred": len(self._deferred_since),
                "dropped": int(self.dropped),
                "failures": int(self.failures),
                "backfill_failures": int(self.backfill_failures),
            }

    def _should_defer(self, key: Tuple[str, str]) -> bool:
        """True = push this fetch back; the network belongs to real traffic."""
        if self._network_clear_fn is None:
            return False
        now = time.monotonic()
        with self._lock:
            try:
                busy = not bool(self._network_clear_fn())
            except Exception:
                busy = False
            if not busy:
                self._deferred_since.pop(key, None)
                return False
            first = self._deferred_since.get(key)
            if first is None:
                self._deferred_since[key] = now
                return True
            if now - first >= self._max_defer_s:
                self._deferred_since.pop(key, None)
                return False
            return True

    def _fetch(self, provider: str, provider_model: str) -> Optional[Dict[str, Any]]:
        try:
            from artificial_analysis_api import aa
            from usage_accounting import _variant_base_names

            result = aa.get(
                provider_model,
                proxy=self.proxy,
                connect_timeout_s=self.connect_timeout_s,
                total_timeout_s=self.total_timeout_s,
            )
            if isinstance(result, dict) and result.get("error") == "Model not found":
                # Effort/routing variants (":high", "-flex", …) are not listed
                # on AA themselves; warm the base model's summary so the
                # variant fallback in resolve_price_snapshot can price it.
                for base in _variant_base_names(provider_model):
                    warmed = aa.get(
                        base,
                        proxy=self.proxy,
                        connect_timeout_s=self.connect_timeout_s,
                        total_timeout_s=self.total_timeout_s,
                    )
                    if isinstance(warmed, dict) and not warmed.get("error"):
                        break
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
