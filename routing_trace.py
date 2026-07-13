from __future__ import annotations

import copy
import threading
from typing import Any, Dict, List


_SENSITIVE_FIELDS = {
    "authorization",
    "headers",
    "key",
    "api_key",
    "admin_key",
    "x-admin-key",
}


class RoutingTrace:
    """Thread-safe, secret-free routing decision collector for one request."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: List[Dict[str, Any]] = []

    def record(self, code: str, *, stage: str, owner: str = "", **details: Any) -> None:
        event: Dict[str, Any] = {
            "stage": str(stage or "routing"),
            "code": str(code or "unknown"),
        }
        if owner:
            event["owner"] = str(owner)
        for name, value in details.items():
            event[str(name)] = self._sanitize(value, str(name))
        with self._lock:
            self._events.append(event)

    def snapshot(self) -> List[Dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._events)

    @classmethod
    def _sanitize(cls, value: Any, field_name: str = "") -> Any:
        if field_name.lower() in _SENSITIVE_FIELDS:
            return "***"
        if isinstance(value, dict):
            return {
                str(name): cls._sanitize(child, str(name))
                for name, child in value.items()
            }
        if isinstance(value, (list, tuple)):
            return [cls._sanitize(child, field_name) for child in value]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)
