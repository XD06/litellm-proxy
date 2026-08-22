#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Client virtual key store: issue, authenticate, rate-limit, and account.

Downstream clients authenticate with ``sk-proxy-...`` keys. Only the SHA-256
hash of a key is persisted; the full key is returned exactly once at creation.

Backward compatibility: when no client key exists (or the ``client_keys``
config section is disabled) client endpoints stay open, so single-user
deployments keep working until the owner deliberately issues keys.

Enforcement lives in :func:`ClientKeyStore.check_access` as pure logic so it
can be unit-tested without a running server.
"""
from __future__ import annotations

import collections
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

KEY_PREFIX = "sk-proxy-"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS client_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL DEFAULT '',
    key_suffix TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    quota_tokens INTEGER NOT NULL DEFAULT 0,
    consumed_tokens INTEGER NOT NULL DEFAULT 0,
    rpm INTEGER NOT NULL DEFAULT 0,
    models TEXT NOT NULL DEFAULT '*',
    expires_at REAL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL,
    last_used_at REAL,
    requests_total INTEGER NOT NULL DEFAULT 0,
    requests_failed INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_client_keys_hash ON client_keys(key_hash);
"""


def hash_client_key(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


_QUOTA_UNITS = {"k": 1e3, "m": 1e6, "b": 1e9, "t": 1e12}


def parse_quota_tokens(value: Any) -> int:
    """Parse '100M' / '1.5B' / '500k' / '500000' / '' into a token count."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    text = str(value).strip().lower().replace(",", "")
    if not text or text in ("unlimited", "∞", "-"):
        return 0
    match = re.match(r"^([\d.]+)\s*([kmbt])?$", text)
    if not match:
        return 0
    number = float(match.group(1))
    unit = _QUOTA_UNITS.get(match.group(2) or "", 1)
    return max(0, int(number * unit))


def _parse_models(value: Any) -> Any:
    """Normalize stored model scope into '*' or a sorted list of names."""
    if value is None:
        return "*"
    if isinstance(value, str):
        text = value.strip()
        if not text or text == "*":
            return "*"
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = [item.strip() for item in text.split(",") if item.strip()]
        return _parse_models(parsed)
    if isinstance(value, list):
        names = sorted({str(item).strip() for item in value if str(item).strip()})
        return names or "*"
    return "*"


def _parse_expires(value: Any, now: Optional[float] = None) -> Optional[float]:
    """Accept 'never'/'30d'/'90d'/'<seconds>' and return an epoch timestamp."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text or text in ("never", "none", "0"):
        return None
    multipliers = {"d": 86400.0, "h": 3600.0, "m": 60.0, "s": 1.0}
    total = 0.0
    for chunk in text.replace(",", " ").split():
        unit = chunk[-1] if chunk[-1:].isalpha() else "s"
        number = chunk[:-1] if chunk[-1:].isalpha() else chunk
        try:
            total += float(number) * multipliers.get(unit, 1.0)
        except (TypeError, ValueError):
            continue
    if total <= 0:
        return None
    return (now or time.time()) + total


class ClientKeyError(Exception):
    """Validation failure for a client-key mutation."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class ClientKeyStore:
    def __init__(self, cfg: Dict[str, Any]):
        section = (cfg or {}).get("client_keys") or {}
        if not isinstance(section, dict):
            section = {}
        self.path = str(section.get("store_path") or "tmp/client_keys.sqlite3")
        self.enabled = bool(section.get("enabled", True))
        self._lock = threading.RLock()
        self._rate_windows: Dict[int, collections.deque] = {}
        # hash -> record cache for the hot auth path; rebuilt on every mutation.
        self._by_hash: Dict[str, Dict[str, Any]] = {}
        parent = os.path.dirname(os.path.abspath(self.path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._conn:
            self._conn.executescript(_SCHEMA)
        self._reload_cache_locked()

    # ---- internals ----

    def _reload_cache_locked(self) -> None:
        rows = self._conn.execute("SELECT * FROM client_keys").fetchall()
        self._by_hash = {str(row["key_hash"]): self._row_to_record(row) for row in rows}

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> Dict[str, Any]:
        expires_at = row["expires_at"]
        return {
            "id": int(row["id"]),
            "key_hash": str(row["key_hash"]),
            "key_prefix": str(row["key_prefix"] or ""),
            "key_suffix": str(row["key_suffix"] or ""),
            "name": str(row["name"] or ""),
            "quota_tokens": int(row["quota_tokens"] or 0),
            "consumed_tokens": int(row["consumed_tokens"] or 0),
            "rpm": int(row["rpm"] or 0),
            "models": _parse_models(row["models"]),
            "expires_at": float(expires_at) if expires_at is not None else None,
            "enabled": bool(row["enabled"]),
            "created_at": float(row["created_at"] or 0.0),
            "last_used_at": float(row["last_used_at"]) if row["last_used_at"] is not None else None,
            "requests_total": int(row["requests_total"] or 0),
            "requests_failed": int(row["requests_failed"] or 0),
            "cost_usd": float(row["cost_usd"] or 0.0),
        }

    def _masked(self, record: Dict[str, Any]) -> str:
        return f"{KEY_PREFIX}{record['key_prefix']}***{record['key_suffix']}"

    def _public_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(record)
        out.pop("key_hash", None)
        out["masked"] = self._masked(record)
        out["expired"] = (
            record["expires_at"] is not None and record["expires_at"] <= time.time()
        )
        return out

    def _get_row(self, key_id: int) -> sqlite3.Row:
        row = self._conn.execute(
            "SELECT * FROM client_keys WHERE id = ?", (int(key_id),)
        ).fetchone()
        if row is None:
            raise ClientKeyError(f"unknown client key id: {key_id}", 404)
        return row

    # ---- CRUD ----

    def list_keys(self) -> Dict[str, Any]:
        with self._lock:
            records = [self._public_record(rec) for rec in self._by_hash.values()]
        records.sort(key=lambda item: item["id"])
        return {"keys": records, "enabled": self.enabled, "count": len(records)}

    def create_key(
        self,
        name: str = "",
        quota_tokens: int = 0,
        rpm: int = 0,
        models: Any = "*",
        expires: Any = None,
    ) -> Tuple[Dict[str, Any], str]:
        token = KEY_PREFIX + secrets.token_urlsafe(24)
        record_models = _parse_models(models)
        now = time.time()
        row = {
            "key_hash": hash_client_key(token),
            "key_prefix": token[len(KEY_PREFIX): len(KEY_PREFIX) + 6],
            "key_suffix": token[-4:],
            "name": str(name or "").strip()[:80],
            "quota_tokens": max(0, int(quota_tokens or 0)),
            "rpm": max(0, min(100000, int(rpm or 0))),
            "models": json.dumps(record_models),
            "expires_at": _parse_expires(expires, now=now),
            "created_at": now,
        }
        with self._lock:
            with self._conn:
                cursor = self._conn.execute(
                    """
                    INSERT INTO client_keys
                        (key_hash, key_prefix, key_suffix, name, quota_tokens, rpm,
                         models, expires_at, created_at)
                    VALUES (:key_hash, :key_prefix, :key_suffix, :name,
                            :quota_tokens, :rpm, :models, :expires_at, :created_at)
                    """,
                    row,
                )
                new_id = int(cursor.lastrowid or 0)
            self._reload_cache_locked()
        record = next(rec for rec in self._by_hash.values() if rec["id"] == new_id)
        return self._public_record(record), token

    def update_key(self, key_id: int, patch: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {"name", "quota_tokens", "rpm", "models", "expires", "enabled"}
        clean: Dict[str, Any] = {}
        for field in allowed:
            if field not in (patch or {}):
                continue
            value = patch[field]
            if field == "name":
                clean["name"] = str(value or "").strip()[:80]
            elif field == "quota_tokens":
                clean["quota_tokens"] = parse_quota_tokens(value)
            elif field == "rpm":
                clean["rpm"] = max(0, min(100000, int(value or 0)))
            elif field == "models":
                clean["models"] = json.dumps(_parse_models(value))
            elif field == "enabled":
                clean["enabled"] = 1 if value else 0
            elif field == "expires":
                clean["expires_at"] = _parse_expires(value)
        if not clean:
            raise ClientKeyError("nothing to update")
        assignments = ", ".join(f"{field} = :{field}" for field in clean)
        clean["id"] = int(key_id)
        with self._lock:
            self._get_row(key_id)  # 404 check
            with self._conn:
                self._conn.execute(
                    f"UPDATE client_keys SET {assignments} WHERE id = :id", clean
                )
            self._reload_cache_locked()
            record = next(
                (rec for rec in self._by_hash.values() if rec["id"] == int(key_id)), None
            )
        if record is None:
            raise ClientKeyError(f"unknown client key id: {key_id}", 404)
        return self._public_record(record)

    def delete_key(self, key_id: int) -> Dict[str, Any]:
        with self._lock:
            self._get_row(key_id)
            with self._conn:
                self._conn.execute("DELETE FROM client_keys WHERE id = ?", (int(key_id),))
            self._reload_cache_locked()
            self._rate_windows.pop(int(key_id), None)
        return {"action": "client_key_deleted", "id": int(key_id)}

    def reset_usage(self, key_id: int) -> Dict[str, Any]:
        with self._lock:
            self._get_row(key_id)
            with self._conn:
                self._conn.execute(
                    """
                    UPDATE client_keys
                    SET consumed_tokens = 0, requests_total = 0, requests_failed = 0,
                        cost_usd = 0.0, last_used_at = NULL
                    WHERE id = ?
                    """,
                    (int(key_id),),
                )
            self._reload_cache_locked()
            self._rate_windows.pop(int(key_id), None)
        return {"action": "client_key_usage_reset", "id": int(key_id)}

    # ---- auth & accounting ----

    def has_any_keys(self) -> bool:
        """Whether any client key exists (enabled or not).

        The presence of at least one key switches the proxy into
        key-required mode; disabling the last key must NOT silently reopen
        the endpoints.
        """
        with self._lock:
            return bool(self._by_hash)

    def has_enabled_keys(self) -> bool:
        with self._lock:
            return any(rec["enabled"] for rec in self._by_hash.values())

    def authenticate(self, token: str) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        with self._lock:
            return self._by_hash.get(hash_client_key(str(token)))

    def check_access(
        self,
        record: Dict[str, Any],
        model: Optional[str] = None,
        now: Optional[float] = None,
    ) -> Tuple[bool, int, str, str]:
        """Pure decision: (ok, http_status, error_code, message)."""
        now = time.time() if now is None else now
        if not record.get("enabled"):
            return False, 403, "key_disabled", "This client key is disabled."
        expires_at = record.get("expires_at")
        if expires_at is not None and float(expires_at) <= now:
            return False, 403, "key_expired", "This client key has expired."
        rpm = int(record.get("rpm") or 0)
        if rpm > 0:
            window = self._rate_windows.setdefault(int(record["id"]), collections.deque())
            while window and window[0] <= now - 60.0:
                window.popleft()
            if len(window) >= rpm:
                return False, 429, "rate_limit_exceeded", (
                    f"Rate limit exceeded for this key ({rpm} requests/min)."
                )
        quota = int(record.get("quota_tokens") or 0)
        if quota > 0 and int(record.get("consumed_tokens") or 0) >= quota:
            return False, 429, "quota_exceeded", (
                "Token quota exhausted for this key. Reset usage or raise the quota."
            )
        scope = record.get("models")
        if model is not None and scope != "*":
            allowed = scope if isinstance(scope, list) else [scope]
            if str(model) not in allowed:
                return False, 403, "model_not_allowed", (
                    f"Model '{model}' is not allowed for this client key."
                )
        return True, 0, "", ""

    def stamp_rate_limit(self, key_id: int, now: Optional[float] = None) -> None:
        now = time.time() if now is None else now
        with self._lock:
            window = self._rate_windows.setdefault(int(key_id), collections.deque())
            window.append(now)

    def add_usage(self, key_id: int, tokens: int, cost_usd: float, success: bool) -> None:
        tokens = max(0, int(tokens or 0))
        cost = max(0.0, float(cost_usd or 0.0))
        now = time.time()
        with self._lock:
            try:
                with self._conn:
                    self._conn.execute(
                        """
                        UPDATE client_keys
                        SET consumed_tokens = consumed_tokens + ?,
                            requests_total = requests_total + 1,
                            requests_failed = requests_failed + ?,
                            cost_usd = cost_usd + ?,
                            last_used_at = ?
                        WHERE id = ?
                        """,
                        (tokens, 0 if success else 1, cost, now, int(key_id)),
                    )
                self._reload_cache_locked()
            except sqlite3.Error:
                # Accounting must never break the response path.
                pass
