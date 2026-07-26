#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Hashable, Optional, Tuple


class ProbeCoordinator:
    """Serialize active probes and keep their health effects scoped."""

    def __init__(self, min_interval_s: float = 1.0, max_failure_scopes: int = 4096):
        self.min_interval_s = max(0.0, float(min_interval_s))
        self.max_failure_scopes = max(1, int(max_failure_scopes))
        self._condition = threading.Condition()
        self._active: Optional[Hashable] = None
        self._last_finished = 0.0
        self._real_request_generation = 0
        self._failure_counts: dict[Tuple[Hashable, str], int] = {}
        self._failure_types_by_key: dict[Hashable, set[str]] = {}

    def note_real_request(self) -> None:
        with self._condition:
            self._real_request_generation += 1
            self._condition.notify_all()

    def run_auto(self, key: Hashable, fn: Callable[[], Any], *, recent_success: bool = False) -> tuple[bool, Any]:
        with self._condition:
            if recent_success or self._active is not None:
                return False, None
            if self._last_finished and time.monotonic() - self._last_finished < self.min_interval_s:
                return False, None
            generation = self._real_request_generation
            self._active = key
        try:
            with self._condition:
                if generation != self._real_request_generation:
                    return False, None
            return True, fn()
        finally:
            with self._condition:
                if self._active == key:
                    self._active = None
                self._last_finished = time.monotonic()
                self._condition.notify_all()

    def run_manual(self, key: Hashable, fn: Callable[[], Any]) -> Any:
        with self._condition:
            while self._active is not None:
                self._condition.wait(timeout=0.25)
            self._active = key
        try:
            return fn()
        finally:
            with self._condition:
                if self._active == key:
                    self._active = None
                self._last_finished = time.monotonic()
                self._condition.notify_all()

    def record_success(self, key: Hashable) -> None:
        with self._condition:
            for error in self._failure_types_by_key.pop(key, set()):
                self._failure_counts.pop((key, error), None)

    def should_apply_failure(self, key: Hashable, error_type: str) -> bool:
        error = str(error_type or "unknown")
        if error in ("key_invalid", "quota_or_balance"):
            return True
        failure_key = (key, error)
        with self._condition:
            count = int(self._failure_counts.get(failure_key) or 0) + 1
            if failure_key in self._failure_counts:
                self._failure_counts.pop(failure_key, None)
            self._failure_counts[failure_key] = count
            self._failure_types_by_key.setdefault(key, set()).add(error)
            while len(self._failure_counts) > self.max_failure_scopes:
                expired_key = next(iter(self._failure_counts))
                self._failure_counts.pop(expired_key, None)
                expired_scope, expired_error = expired_key
                errors = self._failure_types_by_key.get(expired_scope)
                if errors is not None:
                    errors.discard(expired_error)
                    if not errors:
                        self._failure_types_by_key.pop(expired_scope, None)
        return count >= 2

    def snapshot(self) -> dict:
        with self._condition:
            return {
                "running": self._active is not None,
                "active": str(self._active or ""),
                "failure_scopes": len(self._failure_counts),
            }
