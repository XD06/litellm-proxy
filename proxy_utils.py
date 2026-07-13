#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional


# Known proxy schemes (lowercase). ``socks4a`` is included for completeness
# even though urllib3.contrib.socks maps it to ``socks4``.
_PROXY_SCHEMES = {"http", "https", "socks4", "socks4a", "socks5", "socks5h"}

# Match ``ip:port`` or ``host:port`` without a scheme — e.g. ``127.0.0.1:7890``
# or ``proxy.example.com:10808``.  Also handles ``user:pass@host:port`` without
# a scheme.
_BARE_PROXY_RE = re.compile(
    r"^"                         # start
    r"(?:[^/@:]+:[^//@:]+@)?"  # optional user:pass@
    r"[\w.\-]+:"               # host or ip followed by colon
    r"\d+"                      # port (digits only)
    r"$"
)


def normalize_proxy_url(url: str) -> str:
    """Return a proxy URL with a proper scheme.

    Accepted inputs (case-insensitive scheme):
      * ``127.0.0.1:10808``           → ``http://127.0.0.1:10808``
      * ``http://127.0.0.1:10808``    → unchanged
      * ``socks5://127.0.0.1:10808``  → unchanged
      * ``http://user:pass@ip:port``  → unchanged
      * ``user:pass@127.0.0.1:10808`` → ``http://user:pass@127.0.0.1:10808``

    Returns an empty string for blank input.
    """
    proxy = str(url or "").strip()
    if not proxy:
        return ""
    # Already has a scheme — validate it.
    m = re.match(r"^([a-zA-Z][a-zA-Z0-9+.-]*)://", proxy)
    if m:
        scheme = m.group(1).lower()
        if scheme not in _PROXY_SCHEMES:
            # Unknown scheme — return as-is and let the caller fail with a
            # clear error rather than silently mangling the URL.
            return proxy
        return proxy
    # Bare ``host:port`` or ``user:pass@host:port`` — prepend ``http://``.
    if _BARE_PROXY_RE.match(proxy):
        return f"http://{proxy}"
    return proxy


def is_socks_proxy(proxy_url: str) -> bool:
    """Return True if *proxy_url* uses a SOCKS scheme."""
    proxy = str(proxy_url or "").strip().lower()
    return proxy.startswith(("socks4://", "socks4a://", "socks5://", "socks5h://"))


def normalize_proxy_config(value: Any) -> Dict[str, str]:
    """Normalize proxy config to {"http": url, "https": url}.

    Empty values mean direct connection. The rest of the code treats missing or
    blank proxy entries as no proxy.
    """
    if value is None:
        return {}
    if isinstance(value, str):
        proxy = normalize_proxy_url(value)
        return {"http": proxy, "https": proxy} if proxy else {}
    if isinstance(value, dict):
        out: Dict[str, str] = {}
        for name in ("http", "https"):
            proxy = normalize_proxy_url(str(value.get(name) or "").strip())
            if proxy:
                out[name] = proxy
        fallback = normalize_proxy_url(str(value.get("url") or value.get("all") or "").strip())
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
            return normalize_proxy_url(proxy)
    return None


def proxy_display(value: Any) -> str:
    """Return one compact proxy URL for admin UI/API display."""
    return resolve_proxy_url(value) or ""


def mask_proxy_url(url: Any) -> str:
    """Return a proxy URL with any embedded credentials masked, for logging.

    ``http://user:pass@127.0.0.1:7890`` → ``http://***@127.0.0.1:7890``
    ``socks5://127.0.0.1:1080``           → ``socks5://127.0.0.1:1080`` (no creds)
    Empty/None → "". Only the userinfo component is masked; host/port/scheme
    are preserved so the log line still identifies which proxy was used.
    """
    from urllib.parse import urlparse, urlunparse

    proxy = str(url or "").strip()
    if not proxy:
        return ""
    try:
        parsed = urlparse(proxy)
    except Exception:
        return proxy
    if not parsed.scheme or not parsed.netloc:
        # Bare ``host:port`` (no scheme) — no creds to mask.
        return proxy
    userinfo = ""
    if parsed.username or parsed.password:
        userinfo = "***@"
    hostport = parsed.hostname or ""
    if parsed.port:
        hostport = f"{hostport}:{parsed.port}"
    netloc = userinfo + hostport
    return urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))


def key_value(entry: Any) -> str:
    """Return raw API key from old string entries or new object entries."""
    if isinstance(entry, dict):
        return str(entry.get("key") or entry.get("api_key") or "").strip()
    return str(entry or "").strip()


def key_fingerprint(entry: Any) -> str:
    raw_key = key_value(entry)
    if not raw_key:
        return ""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:16]


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
        models = entry.get("models") if "models" in entry else entry.get("model_map")
        if isinstance(models, dict):
            out["models"] = {
                str(canonical).strip(): str(raw_model).strip()
                for canonical, raw_model in models.items()
                if str(canonical or "").strip() and str(raw_model or "").strip()
            }
        elif isinstance(models, list):
            out["models"] = [
                str(model).strip() for model in models if str(model or "").strip()
            ]
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
