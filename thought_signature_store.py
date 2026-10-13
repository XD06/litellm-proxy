#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bounded proxy-side storage for Gemini 3 thought signatures.

Google validates ``thoughtSignature`` on functionCall parts in conversation
history, but not every client format can carry one back:
``tool_calls[].provider_specific_fields`` exists in Chat/Responses (and is
round-tripped natively by the codecs), while Anthropic tool_use blocks have no
signature slot at all and strict clients may strip unknown fields everywhere.

This store remembers ``call_id -> signature`` for responses that came from a
Google upstream, so the next request rendering toward Google can replay the
real signature even when the client history lost it.  When nothing is known
the codec falls back to the documented dummy
``skip_thought_signature_validator``, so the loop never fails with a 400.

State here is best-effort cache material: TTL- and size-bounded, safe to wipe.
"""

from __future__ import annotations

import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional


DEFAULT_TTL_SECONDS = 24 * 60 * 60
DEFAULT_MAX_RECORDS = 50_000


@dataclass(frozen=True)
class SignatureStoreLimits:
    ttl_seconds: int = DEFAULT_TTL_SECONDS
    max_records: int = DEFAULT_MAX_RECORDS


class GoogleThoughtSignatureStore:
    def __init__(self, path: str, *, limits: Optional[SignatureStoreLimits] = None):
        self.path = path
        self.limits = limits or SignatureStoreLimits()
        self._lock = threading.Lock()
        self._conn: Optional[sqlite3.Connection] = None

    def initialize(self) -> "GoogleThoughtSignatureStore":
        parent = os.path.dirname(self.path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with self._lock:
            conn = sqlite3.connect(self.path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=2000")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS google_thought_signatures (
                    call_id TEXT PRIMARY KEY,
                    signature TEXT NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_gts_updated_at ON google_thought_signatures (updated_at)"
            )
            conn.commit()
            self._conn = conn
            self._purge_expired_locked()
        return self

    def save(self, signatures: Dict[str, str]) -> int:
        rows = [
            (str(call_id), str(signature), time.time())
            for call_id, signature in (signatures or {}).items()
            if call_id and signature
        ]
        if not rows:
            return 0
        with self._lock:
            if self._conn is None:
                return 0
            self._conn.executemany(
                "INSERT OR REPLACE INTO google_thought_signatures (call_id, signature, updated_at) VALUES (?, ?, ?)",
                rows,
            )
            self._conn.commit()
            self._purge_expired_locked()
            self._trim_locked()
        return len(rows)

    def get(self, call_id: str) -> Optional[str]:
        if not call_id:
            return None
        now = time.time()
        with self._lock:
            if self._conn is None:
                return None
            row = self._conn.execute(
                "SELECT signature, updated_at FROM google_thought_signatures WHERE call_id = ?",
                (str(call_id),),
            ).fetchone()
            if not row:
                return None
            signature, updated_at = row[0], float(row[1] or 0)
            if now - updated_at > self.limits.ttl_seconds:
                self._conn.execute("DELETE FROM google_thought_signatures WHERE call_id = ?", (str(call_id),))
                self._conn.commit()
                return None
            return str(signature)

    def count(self) -> int:
        with self._lock:
            if self._conn is None:
                return 0
            return int(self._conn.execute("SELECT COUNT(*) FROM google_thought_signatures").fetchone()[0] or 0)

    def _purge_expired_locked(self) -> None:
        cutoff = time.time() - self.limits.ttl_seconds
        self._conn.execute("DELETE FROM google_thought_signatures WHERE updated_at < ?", (cutoff,))
        self._conn.commit()

    def _trim_locked(self) -> None:
        excess = self.count_untouched() - self.limits.max_records
        if excess <= 0:
            return
        self._conn.execute(
            "DELETE FROM google_thought_signatures WHERE call_id IN ("
            "  SELECT call_id FROM google_thought_signatures ORDER BY updated_at ASC LIMIT ?"
            ")",
            (excess,),
        )
        self._conn.commit()

    def count_untouched(self) -> int:
        # Internal helper without the public lock re-entry.
        return int(self._conn.execute("SELECT COUNT(*) FROM google_thought_signatures").fetchone()[0] or 0)

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                try:
                    self._conn.close()
                except Exception:
                    pass
                self._conn = None


_STORE: Optional[GoogleThoughtSignatureStore] = None


def _positive_int(name: str, raw: Dict[str, Any], default: int) -> int:
    try:
        return max(1, int(raw.get(name, default)))
    except (TypeError, ValueError):
        return default


def configure(config: Dict[str, Any]) -> Optional[GoogleThoughtSignatureStore]:
    """Build the active store from the merged config, or disable it.

    Config block: ``observability.google_thought_signatures``
    ``{enabled, path, ttl_seconds, max_records}`` — enabled by default, with
    bounded TTL/size so stale signatures can never grow the file without end.
    """
    global _STORE
    observability = (config or {}).get("observability") or {}
    raw = observability.get("google_thought_signatures") or {}
    if not isinstance(raw, dict) or not bool(raw.get("enabled", True)):
        if _STORE is not None:
            _STORE.close()
        _STORE = None
        set_hooks(None, None)
        return None
    path = str(raw.get("path") or os.path.join("tmp", "proxy_google_signatures.sqlite3"))
    if not os.path.isabs(path):
        path = os.path.join(os.path.dirname(__file__), path)
    limits = SignatureStoreLimits(
        ttl_seconds=_positive_int("ttl_seconds", raw, DEFAULT_TTL_SECONDS),
        max_records=_positive_int("max_records", raw, DEFAULT_MAX_RECORDS),
    )
    previous = _STORE
    store = GoogleThoughtSignatureStore(path, limits=limits).initialize()
    _STORE = store
    if previous is not None:
        previous.close()
    set_hooks(lookup, persist)
    return store


def set_hooks(lookup_fn, persist_fn) -> None:
    # Imported lazily: storage wiring lives in the app layer while the codec
    # stays free of filesystem dependencies (conversion_core ships standalone).
    from conversion_core.codecs import google as google_codec

    google_codec.set_signature_hooks(lookup=lookup_fn, persist=persist_fn)


def active_store() -> Optional[GoogleThoughtSignatureStore]:
    return _STORE


def lookup(call_id: str) -> Optional[str]:
    store = _STORE
    if store is None:
        return None
    try:
        return store.get(call_id)
    except Exception:
        return None


def persist(signatures: Dict[str, str]) -> None:
    store = _STORE
    if store is None or not signatures:
        return
    try:
        store.save(signatures)
    except Exception:
        pass
