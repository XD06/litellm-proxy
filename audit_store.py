#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import copy
import datetime
import json
import os
import threading
import time
from collections import deque
from typing import Any, Dict, Optional


SENSITIVE_FIELD_NAMES = {
    "key",
    "keys",
    "api_key",
    "apikey",
    "admin_key",
    "authorization",
    "x-admin-key",
    "bearer",
}


class AdminAuditStore:
    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg or {}
        self.enabled = self._enabled()
        self.path = self._path()
        self.max_records = self._max_records()
        self._lock = threading.Lock()
        self._recent = deque(maxlen=self.max_records)

    def record(
        self,
        action: str,
        *,
        target: str = "",
        status: str = "success",
        detail: Optional[Dict[str, Any]] = None,
        error: str = "",
        source_ip: str = "",
        path: str = "",
    ) -> Dict[str, Any]:
        item = {
            "id": f"audit_{int(time.time() * 1000)}_{os.getpid()}",
            "ts": int(time.time()),
            "iso": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
            "action": str(action or "unknown"),
            "target": str(target or ""),
            "status": str(status or "success"),
            "source_ip": str(source_ip or ""),
            "path": str(path or "").split("?", 1)[0],
            "detail": self._sanitize(detail or {}),
        }
        if error:
            item["error"] = str(error)[:500]

        if not self.enabled:
            return item

        with self._lock:
            self._recent.append(copy.deepcopy(item))
            try:
                os.makedirs(os.path.dirname(self.path), exist_ok=True)
                with open(self.path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(item, ensure_ascii=False, sort_keys=True))
                    f.write("\n")
                self._prune_locked()
            except Exception:
                pass
        return item

    def list(self, *, limit: int = 50) -> Dict[str, Any]:
        try:
            limit = max(1, min(500, int(limit)))
        except Exception:
            limit = 50

        if not self.enabled:
            return {"source": "disabled", "total": 0, "limit": limit, "items": []}

        with self._lock:
            items = self._read_items_locked()
            if not items:
                items = [copy.deepcopy(item) for item in self._recent]
        items = sorted(items, key=lambda item: (int(item.get("ts") or 0), str(item.get("id") or "")), reverse=True)
        return {
            "source": "jsonl" if os.path.exists(self.path) else "memory",
            "total": len(items),
            "limit": limit,
            "items": items[:limit],
        }

    def _audit_cfg(self) -> Dict[str, Any]:
        obs = self.cfg.get("observability") or {}
        audit = obs.get("audit") or {}
        return audit if isinstance(audit, dict) else {}

    def _enabled(self) -> bool:
        audit = self._audit_cfg()
        return bool(audit.get("enabled", True))

    def _path(self) -> str:
        audit = self._audit_cfg()
        raw = str(audit.get("path") or os.path.join("tmp", "admin_audit.jsonl"))
        if os.path.isabs(raw):
            return raw
        return os.path.join(os.path.dirname(__file__), raw)

    def _max_records(self) -> int:
        audit = self._audit_cfg()
        try:
            return max(100, min(10000, int(audit.get("max_records", 1000))))
        except Exception:
            return 1000

    def _read_items_locked(self) -> list:
        if not os.path.exists(self.path):
            return []
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                lines = f.readlines()[-self.max_records :]
            items = []
            for line in lines:
                try:
                    item = json.loads(line)
                except Exception:
                    continue
                if isinstance(item, dict):
                    items.append(item)
            return items
        except Exception:
            return []

    def _prune_locked(self) -> None:
        if self.max_records <= 0 or not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            if len(lines) <= self.max_records:
                return
            # Atomic prune: write to a temp file then os.replace() onto the
            # real path. The previous open("w") truncated first and wrote
            # second, so a crash between the two wiped the whole audit log.
            # os.replace is atomic on POSIX and Windows for same-filesystem
            # renames, so readers never see a partial/empty file.
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(lines[-self.max_records :])
            os.replace(tmp, self.path)
        except Exception:
            return

    @classmethod
    def _sanitize(cls, value: Any, field_name: str = "") -> Any:
        if field_name.lower() in SENSITIVE_FIELD_NAMES:
            if isinstance(value, list):
                return [cls._sanitize_secret_entry(v) for v in value]
            if isinstance(value, dict):
                return cls._sanitize_secret_entry(value)
            return cls._mask_secret(str(value))
        if isinstance(value, dict):
            return {str(k): cls._sanitize(v, str(k)) for k, v in value.items()}
        if isinstance(value, list):
            return [cls._sanitize(v, field_name) for v in value]
        if isinstance(value, str) and (value.startswith("sk-") or value.lower().startswith("bearer ")):
            return cls._mask_secret(value)
        return copy.deepcopy(value)

    @staticmethod
    def _mask_secret(value: str, prefix: int = 6, suffix: int = 4) -> str:
        if not value:
            return ""
        if len(value) <= prefix + suffix:
            return "*" * len(value)
        return f"{value[:prefix]}**{value[-suffix:]}"

    @classmethod
    def _sanitize_secret_entry(cls, value: Any) -> Any:
        if isinstance(value, dict):
            out = copy.deepcopy(value)
            raw_key = str(out.get("key") or out.get("api_key") or "")
            out.pop("api_key", None)
            out["key"] = cls._mask_secret(raw_key)
            return out
        return cls._mask_secret(str(value))
