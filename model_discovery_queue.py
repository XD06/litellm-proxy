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
    re-fetched until its TTL expires (default 10 min).
  - Retry: providers with no snapshot, an error snapshot, or an expired-ok
    snapshot are re-queued automatically and retried on a slow cadence
    (default every 2 min), so a provider that was unreachable at startup gets
    discovered once it comes back — without the user doing anything.
  - Bounded concurrency: the worker pulls one provider at a time with a short
    pause between fetches, so discovery never hammers upstream APIs.
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
SNAPSHOT_OK_TTL_S = 10 * 60
# How soon to retry a provider that is missing a snapshot or had an error.
RETRY_INTERVAL_S = 2 * 60
# Pause between consecutive provider fetches, to stay polite to upstreams.
INTER_FETCH_PAUSE_S = 3.0


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
    ):
        self._fetch_provider = fetch_provider_fn
        self._get_snapshot = get_snapshot_fn
        self._providers = providers_fn
        self._enabled = enabled_fn
        self._ok_ttl = ok_ttl_s
        self._retry_interval = retry_interval_s
        self._pause = inter_fetch_pause_s

        self._lock = threading.Lock()
        self._queue: List[str] = []
        self._queued: set = set()
        # provider -> next-eligible epoch seconds. A provider is only fetched
        # when now >= its next-eligible time. ok snapshots push it far into the
        # future (TTL); errors/missing keep it near (retry interval).
        self._next_eligible: Dict[str, float] = {}
        self._wake = threading.Event()
        self._running = False
        self._thread: Optional[threading.Thread] = None

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------
    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._run, name="model-discovery-queue", daemon=True
        )
        self._thread.start()

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
        """Return a small status dict for diagnostics (queue depth, waiting)."""
        now = time.time()
        with self._lock:
            waiting = [p for p in self._queue]
            next_due = sorted(
                ((p, max(0, int(t - now))) for p, t in self._next_eligible.items()),
                key=lambda kv: kv[1],
            )[:12]
        return {
            "running": self._running,
            "queued": len(waiting),
            "queued_providers": waiting,
            "cooldowns": next_due,
            "ok_ttl_s": self._ok_ttl,
            "retry_interval_s": self._retry_interval,
        }

    # ------------------------------------------------------------------
    # worker
    # ------------------------------------------------------------------
    def _run(self) -> None:
        # On startup, enqueue every provider once (non-forced) so missing
        # snapshots are discovered and stale ones are refreshed on cadence.
        try:
            self.enqueue_all(force=False)
        except Exception:
            pass
        while self._running:
            provider = self._pop_due()
            if provider is None:
                # Nothing due right now; wait for a wake signal or the nearest
                # cooldown, whichever is sooner.
                timeout = self._next_timeout()
                self._wake.wait(timeout=timeout)
                self._wake.clear()
                continue
            try:
                if not self._enabled():
                    continue
                self._fetch_provider(provider)
                self._record_outcome(provider)
            except Exception:
                # The fetch function is expected to store its own error
                # snapshot; just make sure we schedule a retry.
                self._schedule_retry(provider)
            # Polite pause between fetches.
            if self._pause > 0:
                time.sleep(self._pause)

    def _pop_due(self) -> Optional[str]:
        """Return the next provider that is eligible to be fetched now."""
        now = time.time()
        with self._lock:
            if not self._queue:
                return None
            # Find the first queued provider whose cooldown has elapsed.
            due_index = None
            for idx, provider in enumerate(self._queue):
                eligible_at = self._next_eligible.get(provider, 0)
                if now >= eligible_at:
                    due_index = idx
                    break
            if due_index is None:
                return None
            provider = self._queue.pop(due_index)
            self._queued.discard(provider)
            return provider

    def _next_timeout(self) -> float:
        """How long to wait before re-checking (nearest cooldown or a cap)."""
        now = time.time()
        with self._lock:
            if not self._queue:
                return 30.0
            nearest = None
            for provider in self._queue:
                eligible_at = self._next_eligible.get(provider, 0)
                wait = max(0.0, eligible_at - now)
                if nearest is None or wait < nearest:
                    nearest = wait
        if nearest is None:
            return 30.0
        return min(30.0, max(0.5, nearest + 0.1))

    def _record_outcome(self, provider: str) -> None:
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
