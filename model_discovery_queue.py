#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Background model-discovery queue.

Replaces the previous "fetch all providers once at startup with an 8s timeout"
behavior, which silently dropped any provider that did not respond in time
(epecially providers behind a proxy or with a slow /v1/models). Providers that
failed were marked status=error and never retried, so users had to click
"Refresh models" manually for each one.

This module runs ONE daemon worker thread that pulls providers from a queue and
discovers their models sequentially. It never touches the request-forwarding
worker pool, so it cannot slow down real traffic. Key properties:

  - Persistent cache: a successful snapshot (status=ok) is reused and not
    re-fetched until its TTL expires (default 4 hours).
  - Retry: providers with no snapshot, an error snapshot, or an expired-ok
    snapshot are re-queued automatically and retried on a bounded cadence
    (default every 5 minutes), so a provider that was unreachable at startup gets
    discovered once it comes back — without the user doing anything.
  - Bounded concurrency: two workers can discover different providers while
    the same provider is never fetched concurrently.
  - Non-blocking API: enqueue()/enqueue_all() just put on a queue and return.

The actual fetch still goes through model_registry.fetch_upstream_models
(only_provider=...), which uses upstream_client (its own transport), not the
proxy's HTTP worker pool.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Dict, List, Optional


# How long an "ok" snapshot is trusted before it is re-fetched.
# 4 hours — model catalogs rarely change more frequently than this, and
# re-fetching too often wastes upstream API calls for no benefit.
SNAPSHOT_OK_TTL_S = 4 * 3600
# How soon to retry a provider that is missing a snapshot or had an error.
# 1 hour — gives a flaky provider a reasonable window to recover without
# hammering its /v1/models endpoint every few minutes.
RETRY_INTERVAL_S = 300
# Pause between consecutive provider fetches, to stay polite to upstreams.
INTER_FETCH_PAUSE_S = 1.0
DEFAULT_WORKER_COUNT = 2


class ModelDiscoveryQueue:
    def __init__(
        self,
        *,
        fetch_provider_fn: Callable[[str], None],
        get_snapshot_fn: Callable[[str], Optional[Dict[str, Any]]],
        providers_fn: Callable[[], List[str]],
        enabled_fn: Callable[[], bool] = lambda: True,
        ok_ttl_s: int = SNAPSHOT_OK_TTL_S,
        retry_interval_s: int = RETRY_INTERVAL_S,
        inter_fetch_pause_s: float = INTER_FETCH_PAUSE_S,
        worker_count: int = DEFAULT_WORKER_COUNT,
        network_busy_fn: Optional[Callable[[], bool]] = None,
        defer_interval_s: float = 15.0,
        max_defer_s: float = 1800.0,
    ):
        self._fetch_provider = fetch_provider_fn
        self._get_snapshot = get_snapshot_fn
        self._providers = providers_fn
        self._enabled = enabled_fn
        self._ok_ttl = ok_ttl_s
        self._retry_interval = retry_interval_s
        self._pause = inter_fetch_pause_s
        self._worker_count = max(1, min(int(worker_count or 1), 4))
        # Yield to live traffic: when network_busy_fn() reports real requests
        # are in flight or just finished, due providers are put back on a short
        # defer cadence instead of competing for bandwidth. Urgent fetches
        # (enqueued with force=True, i.e. user-triggered) bypass the check.
        # max_defer_s is the starvation cap: a provider deferred longer than
        # that is fetched anyway so 24/7 traffic cannot starve discovery.
        self._network_busy_fn = network_busy_fn
        self._defer_interval = max(1.0, float(defer_interval_s))
        self._max_defer_s = max(0.0, float(max_defer_s))

        self._lock = threading.Lock()
        self._queue: List[str] = []
        self._queued: set = set()
        # provider -> next-eligible epoch seconds. A provider is only fetched
        # when now >= its next-eligible time. ok snapshots push it far into the
        # future (TTL); errors/missing keep it near (retry interval).
        self._next_eligible: Dict[str, float] = {}
        self._active: set = set()
        # force-enqueued providers (manual refresh / config change): fetched
        # immediately regardless of background network yielding.
        self._urgent: set = set()
        # provider -> first defer wall-clock time (starvation cap bookkeeping).
        self._deferred_since: Dict[str, float] = {}
        self._recent_results: List[Dict[str, Any]] = []
        self._wake = threading.Event()
        self._running = False
        self._threads: List[threading.Thread] = []

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------
    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self.enqueue_all(force=False)
        self._threads = []
        for index in range(self._worker_count):
            thread = threading.Thread(
                target=self._run,
                name=f"model-discovery-queue-{index + 1}",
                daemon=True,
            )
            self._threads.append(thread)
            thread.start()

    def stop(self) -> None:
        self._running = False
        self._wake.set()

    # ------------------------------------------------------------------
    # public API (non-blocking)
    # ------------------------------------------------------------------
    def enqueue(self, provider: str, *, force: bool = False) -> None:
        """Queue a single provider for (re)discovery.

        With force=True the per-provider cooldown is bypassed so the worker
        picks it up on its next cycle. Without force, respect the TTL/retry
        cadence so repeated enqueues (e.g. config edits) do not cause a storm.
        """
        if not provider:
            return
        with self._lock:
            if force:
                self._urgent.add(provider)
                self._deferred_since.pop(provider, None)
            if not force and provider not in self._next_eligible:
                try:
                    snap = self._get_snapshot(provider) or {}
                    status = str(snap.get("status") or "")
                    fetched_at = float(snap.get("fetched_at") or 0.0)
                    if status == "ok" and fetched_at > 0.0:
                        self._next_eligible[provider] = fetched_at + self._ok_ttl
                    elif status == "error" and fetched_at > 0.0:
                        self._next_eligible[provider] = fetched_at + self._retry_interval
                except Exception:
                    pass
            if force:
                self._next_eligible.pop(provider, None)
            if provider in self._queued:
                if force:
                    self._queue = [p for p in self._queue if p != provider]
                    self._queue.insert(0, provider)
                    # The provider is already due (cooldown popped above), so
                    # the worker may be sleeping until its old cooldown. Wake
                    # it now or a user-triggered refresh waits the full defer.
                    self._wake.set()
                return
            self._queued.add(provider)
            if force:
                self._queue.insert(0, provider)
            else:
                self._queue.append(provider)
        self._wake.set()

    def enqueue_all(self, *, force: bool = False) -> None:
        """Queue every currently-enabled provider.

        Used at startup and after a config reload. Respects per-provider
        cadence unless force=True.
        """
        providers = []
        try:
            providers = [p for p in self._providers()]
        except Exception:
            return
        for p in providers:
            self.enqueue(p, force=force)

    def snapshot_status(self) -> Dict[str, Any]:
        """Return queue diagnostics without treating future work as active work.

        Providers remain in the internal queue while their success TTL or retry
        delay is counting down.  Reporting all of them as ``queued`` made the
        dashboard look as if discovery was permanently running, even when every
        provider was served from a fresh persisted snapshot.  ``queued`` now
        means eligible to run now; ``scheduled`` exposes the full timer-backed
        queue for diagnostics.
        """
        now = time.time()
        with self._lock:
            scheduled = [p for p in self._queue]
            active = sorted(str(provider) for provider in self._active)
            waiting = [
                provider
                for provider in scheduled
                if provider not in self._active
                and now >= self._next_eligible.get(provider, 0)
            ]
            recent_results = [dict(item) for item in self._recent_results]
            next_due = sorted(
                ((p, max(0, int(t - now))) for p, t in self._next_eligible.items()),
                key=lambda kv: kv[1],
            )[:12]
        return {
            "running": self._running,
            "queued": len(waiting),
            "queued_providers": waiting,
            "scheduled": len(scheduled),
            "scheduled_providers": scheduled,
            "active": len(active),
            "active_providers": active,
            "recent_results": recent_results,
            "cooldowns": next_due,
            "ok_ttl_s": self._ok_ttl,
            "retry_interval_s": self._retry_interval,
            "worker_count": self._worker_count,
            "deferred": sorted(str(p) for p in self._deferred_since),
        }

    # ------------------------------------------------------------------
    # worker
    # ------------------------------------------------------------------
    def _run(self) -> None:
        while self._running:
            provider = self._pop_due()
            if provider is None:
                # Nothing due right now; wait for a wake signal or the nearest
                # cooldown, whichever is sooner.
                timeout = self._next_timeout()
                self._wake.wait(timeout=timeout)
                self._wake.clear()
                continue
            started = time.time()
            status = "error"
            try:
                if not self._enabled():
                    continue
                if self._should_defer(provider):
                    status = "deferred"
                    self._requeue_deferred(provider)
                    continue
                self._fetch_provider(provider)
                status = self._record_outcome(provider)
            except Exception:
                # The fetch function is expected to store its own error
                # snapshot; just make sure we schedule a retry.
                self._schedule_retry(provider)
            finally:
                with self._lock:
                    self._active.discard(provider)
                    if status != "deferred":
                        self._urgent.discard(provider)
                        self._deferred_since.pop(provider, None)
                    self._recent_results.insert(
                        0,
                        {
                            "provider": provider,
                            "status": status,
                            "completed_at": int(time.time()),
                            "duration_ms": max(0, int((time.time() - started) * 1000)),
                        },
                    )
                    del self._recent_results[12:]
                self._wake.set()
            # Polite pause between fetches.
            if self._pause > 0:
                time.sleep(self._pause)

    def _should_defer(self, provider: str) -> bool:
        """True = put this fetch back; real traffic owns the network right now.

        Urgent (force-enqueued) fetches never defer. Non-urgent fetches defer
        while network_busy_fn() reports traffic, unless the provider has
        already been starved past max_defer_s (then it goes through anyway).
        """
        if self._network_busy_fn is None:
            return False
        if self._max_defer_s <= 0:
            return False
        try:
            urgent = provider in self._urgent
        except Exception:
            urgent = False
        if urgent:
            return False
        now = time.time()
        with self._lock:
            try:
                busy = bool(self._network_busy_fn())
            except Exception:
                busy = False
            if not busy:
                self._deferred_since.pop(provider, None)
                return False
            first = self._deferred_since.get(provider)
            if first is None:
                self._deferred_since[provider] = now
                return True
            if now - first >= self._max_defer_s:
                self._deferred_since.pop(provider, None)
                return False
            return True

    def _requeue_deferred(self, provider: str) -> None:
        """Put a traffic-yielded provider back on a short retry cadence."""
        with self._lock:
            self._next_eligible[provider] = time.time() + self._defer_interval
            if provider not in self._queued:
                self._queued.add(provider)
                self._queue.append(provider)
        self._wake.set()

    def _pop_due(self) -> Optional[str]:
        """Return the next provider that is eligible to be fetched now."""
        now = time.time()
        with self._lock:
            if not self._queue:
                return None
            # Find the first queued provider whose cooldown has elapsed.
            due_index = None
            for idx, provider in enumerate(self._queue):
                if provider in self._active:
                    continue
                eligible_at = self._next_eligible.get(provider, 0)
                if now >= eligible_at:
                    due_index = idx
                    break
            if due_index is None:
                return None
            provider = self._queue.pop(due_index)
            self._queued.discard(provider)
            self._active.add(provider)
            return provider

    def _next_timeout(self) -> float:
        """How long to wait before re-checking (nearest cooldown or a cap)."""
        now = time.time()
        with self._lock:
            if not self._queue:
                return 30.0
            nearest = None
            for provider in self._queue:
                if provider in self._active:
                    continue
                eligible_at = self._next_eligible.get(provider, 0)
                wait = max(0.0, eligible_at - now)
                if nearest is None or wait < nearest:
                    nearest = wait
        if nearest is None:
            return 30.0
        return min(30.0, max(0.5, nearest + 0.1))

    def _record_outcome(self, provider: str) -> str:
        """After a fetch, read the stored snapshot and schedule accordingly.

        ok -> long cooldown (TTL); error/missing -> short cooldown (retry).
        """
        try:
            snap = self._get_snapshot(provider) or {}
        except Exception:
            snap = {}
        status = str(snap.get("status") or "")
        if status == "ok":
            self._schedule_ok(provider)
        else:
            self._schedule_retry(provider)
        return status or "error"

    def _schedule_ok(self, provider: str) -> None:
        with self._lock:
            self._next_eligible[provider] = time.time() + self._ok_ttl

    def _schedule_retry(self, provider: str) -> None:
        with self._lock:
            self._next_eligible[provider] = time.time() + self._retry_interval
            # Re-queue so the worker picks it up again after the cooldown.
            if provider not in self._queued:
                self._queued.add(provider)
                self._queue.append(provider)
        self._wake.set()
