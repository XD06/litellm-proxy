#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict, List, Optional


def normalize_proxy_config(value: Any) -> Dict[str, str]:
    """Normalize proxy config to {"http": url, "https": url}.

    Empty values mean direct connection. The rest of the code treats missing or
    blank proxy entries as no proxy.
    """
    if value is None:
        return {}
    if isinstance(value, str):
        proxy = value.strip()
        return {"http": proxy, "https": proxy} if proxy else {}
    if isinstance(value, dict):
        out: Dict[str, str] = {}
        for name in ("http", "https"):
            proxy = str(value.get(name) or "").strip()
            if proxy:
                out[name] = proxy
        fallback = str(value.get("url") or value.get("all") or "").strip()
        if fallback and not out:
            out = {"http": fallback, "https": fallback}
        return out
    return {}


def resolve_proxy_url(*sources: Any) -> Optional[str]:
    """Return the first usable proxy URL from highest to lowest priority."""
    for src in sources:
        normalized = normalize_proxy_config(src)
        proxy = (normalized.get("https") or normalized.get("http") or "").strip()
        if proxy:
            return proxy
    return None


def proxy_display(value: Any) -> str:
    """Return one compact proxy URL for admin UI/API display."""
    return resolve_proxy_url(value) or ""


def key_value(entry: Any) -> str:
    """Return raw API key from old string entries or new object entries."""
    if isinstance(entry, dict):
        return str(entry.get("key") or entry.get("api_key") or "").strip()
    return str(entry or "").strip()


def key_proxy(entry: Any) -> Dict[str, str]:
    if isinstance(entry, dict):
        return normalize_proxy_config(entry.get("proxy"))
    return {}


def normalize_key_entry(entry: Any) -> Any:
    """Normalize key config while preserving old string-key compatibility."""
    if isinstance(entry, dict):
        raw_key = key_value(entry)
        if not raw_key:
            return None
        out: Dict[str, Any] = {"key": raw_key}
        try:
            if "index" in entry:
                out["index"] = int(entry.get("index"))
        except Exception:
            pass
        proxy = normalize_proxy_config(entry.get("proxy"))
        if proxy:
            out["proxy"] = proxy
        return out
    raw_key = key_value(entry)
    return raw_key if raw_key else None


def _split_key_string(raw_key: str) -> List[str]:
    return [part.strip() for part in str(raw_key or "").split(",") if part.strip()]


def normalize_key_entries(value: Any) -> List[Any]:
    """Normalize one or many key entries, splitting comma-separated strings."""
    if value is None:
        return []
    raw_items = value if isinstance(value, list) else [value]
    out: List[Any] = []
    for item in raw_items:
        if isinstance(item, dict):
            raw_key = key_value(item)
            for part in _split_key_string(raw_key):
                entry = dict(item)
                entry["key"] = part
                normalized = normalize_key_entry(entry)
                if normalized:
                    out.append(normalized)
            continue
        for part in _split_key_string(key_value(item)):
            normalized = normalize_key_entry(part)
            if normalized:
                out.append(normalized)
    return out
