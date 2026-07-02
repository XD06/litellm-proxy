#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import concurrent.futures
import datetime
import hashlib
import json
import re
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from proxy_utils import key_proxy, key_value, resolve_proxy_url


_cached_models_by_provider: Dict[str, Dict[str, Any]] = {}
_union_model_id_set: set = set()

# --- Config version + caches (perf: avoid SHA256 / deep-copy on every poll) ---
#
# _config_version is a monotonic counter bumped on every config change or
# capability update.  It replaces the expensive _union_signature() deep-copy
# and provider_config_signature() SHA256 as the primary cache-validity check.
#
# _union_dirty is set True whenever provider_model_capabilities changes.
# The next models_from_capabilities() call rebuilds the snapshot lazily,
# avoiding redundant full rebuilds when multiple providers are discovered
# sequentially by the background discovery queue.
#
# _signature_cache stores (config_version, signature) per provider so that
# repeated provider_config_signature() calls within the same config generation
# are O(1) instead of O(json.dumps + sha256).
_config_version: int = 0
_union_dirty: bool = False
_signature_cache: Dict[str, Tuple[int, str]] = {}
_cache_lock = threading.Lock()


def union_model_ids() -> set:
    return set(_union_model_id_set)


def restore_union_model_ids(model_ids) -> None:
    global _union_model_id_set
    _union_model_id_set = set(str(mid) for mid in (model_ids or []) if str(mid or "").strip())


def provider_model_disabled(config: Dict[str, Any], provider: str, canonical_model: str) -> bool:
    if not provider or not canonical_model:
        return False
    disabled = ((config.get("models") or {}).get("provider_model_disabled") or {}).get(provider) or {}
    if not isinstance(disabled, dict):
        return False
    model = str(canonical_model or "").strip()
    if not model:
        return False
    return bool(disabled.get(model) or disabled.get(model.lower()))


def provider_model_id_disabled(
    config: Dict[str, Any],
    provider: str,
    model_id: str,
    canonical_map: Optional[Dict[str, str]] = None,
) -> bool:
    if provider_model_disabled(config, provider, model_id):
        return True
    raw_model = str(model_id or "").strip()
    if not raw_model or not isinstance(canonical_map, dict):
        return False
    for canonical, raw in canonical_map.items():
        if str(raw or "").strip() == raw_model and provider_model_disabled(config, provider, str(canonical)):
            return True
    return False


def _manual_raw_claims(config: Dict[str, Any], provider: str) -> Dict[str, str]:
    manual_map = ((config.get("models") or {}).get("provider_model_map") or {}).get(provider) or {}
    if not isinstance(manual_map, dict):
        return {}
    claims = {}
    for canonical, raw in manual_map.items():
        raw_id = str(raw or "").strip()
        canonical_id = str(canonical or "").strip()
        if raw_id and canonical_id:
            claims[raw_id] = canonical_id
    return claims


def provider_model_auto_hidden_by_manual_map(
    config: Dict[str, Any],
    provider: str,
    canonical_model: str,
    canonical_map: Optional[Dict[str, str]] = None,
) -> bool:
    if not canonical_model or not isinstance(canonical_map, dict):
        return False
    raw_model = canonical_map.get(canonical_model)
    if raw_model is None:
        raw_model = canonical_map.get(str(canonical_model).lower())
    raw_model = str(raw_model or "").strip()
    if not raw_model:
        return False
    manual_canonical = _manual_raw_claims(config, provider).get(raw_model)
    return bool(manual_canonical and manual_canonical != str(canonical_model or "").strip())


def has_cached_models(cache_key: str) -> bool:
    return cache_key in _cached_models_by_provider


def bump_config_version() -> None:
    """Increment the config version, invalidating all derived caches.

    Called internally by clear_cache() and _store_provider_capabilities().
    External callers (sse2json._apply_runtime_config) should call this after
    a hot-swap so that signature caches and snapshot validity checks pick up
    the new config generation.
    """
    global _config_version, _union_dirty
    with _cache_lock:
        _config_version += 1
        _union_dirty = True
        _signature_cache.clear()


def get_config_version() -> int:
    return _config_version


def clear_cache(provider: Optional[str] = None) -> None:
    global _union_model_id_set
    bump_config_version()
    with _cache_lock:
        if provider:
            _cached_models_by_provider.pop(str(provider), None)
            _cached_models_by_provider.pop("__union__", None)
            return
        _cached_models_by_provider.clear()
        _union_model_id_set.clear()


def _safe_model_id(value: str) -> str:
    normalized = str(value or "").strip().lower().replace("\\", "/")
    normalized = re.sub(r"[\s_]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized)
    parts = [part.strip("-") for part in normalized.split("/") if part.strip("-")]
    return "/".join(parts)


def normalize_model_id(provider_name: str, mid: str) -> Tuple[str, list]:
    _ = provider_name
    s = (mid or "").strip()
    if not s:
        return s, []
    s_lower = s.lower()
    safe = _safe_model_id(s)
    best = safe
    candidates = [safe]
    if s_lower != safe:
        candidates.append(s_lower)
    if "/" in safe:
        parts = [p for p in safe.split("/") if p]
        if len(parts) >= 2:
            last = parts[-1]
            if last:
                best = last
                candidates.append(last)
    return best, _dedupe(candidates)


def _dedupe(values: List[str]) -> List[str]:
    seen = set()
    out = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def _extract_model_items(data) -> List[Dict[str, Any]]:
    raw_list = data.get("data", data) if isinstance(data, dict) else data
    if isinstance(raw_list, dict) and "data" in raw_list:
        raw_list = raw_list["data"]
    if not isinstance(raw_list, list):
        return []
    return [m for m in raw_list if isinstance(m, dict)]


def _created_at_from_model(m: Dict[str, Any]) -> str:
    created_ts = m.get("created", 0)
    if created_ts and isinstance(created_ts, (int, float)):
        return datetime.datetime.fromtimestamp(created_ts).strftime("%Y-%m-%dT%H:%M:%SZ")
    return ""


def _provider_enabled_formats(pcfg: Dict[str, Any]) -> List[str]:
    raw_formats = pcfg.get("formats") or {}
    if not isinstance(raw_formats, dict):
        return ["chat_completions"]
    formats = []
    for fmt, entry in raw_formats.items():
        if isinstance(entry, dict) and entry.get("enabled", False):
            formats.append(str(fmt))
    return formats or ["chat_completions"]


def _sanitize_error(err: Exception, keys: List[Any]) -> str:
    msg = str(err or "")
    for key in keys or []:
        key_s = key_value(key)
        if key_s:
            msg = msg.replace(key_s, "***")
    return msg


def provider_config_signature(config: Dict[str, Any], provider: str) -> str:
    # Fast path: if the config version hasn't changed since we last computed
    # the signature for this provider, return the cached value.  This avoids
    # a json.dumps + sha256 on every dashboard poll (every ~5 s × N providers).
    cached = _signature_cache.get(provider)
    if cached and cached[0] == _config_version:
        return cached[1]
    pcfg = ((config.get("providers") or {}).get(provider) or {})
    payload = {
        "base_url": pcfg.get("base_url") or "",
        "models_path": pcfg.get("models_path") or "/v1/models",
        "keys": [key_value(entry) for entry in (pcfg.get("keys") or [])],
        "proxy": pcfg.get("proxy") or {},
        "headers": pcfg.get("headers") or {},
        "user_agent": pcfg.get("user_agent") or "",
        "formats": pcfg.get("formats") or {},
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    sig = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    with _cache_lock:
        _signature_cache[provider] = (_config_version, sig)
    return sig


def parse_provider_models(provider: str, upstream_data) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str], List[str]]:
    union_map: Dict[str, Dict[str, Any]] = {}
    canonical_map: Dict[str, str] = {}
    raw_ids: List[str] = []

    for m in _extract_model_items(upstream_data):
        mid = m.get("id") or m.get("model") or m.get("name") or ""
        if not mid:
            continue
        raw_mid = str(mid)
        raw_ids.append(raw_mid)
        best_canonical, candidates = normalize_model_id(provider, raw_mid)
        if not best_canonical:
            continue
        matched = best_canonical
        for c in candidates:
            if c in union_map:
                matched = c
                break
        if matched not in union_map:
            display = m.get("display_name") or m.get("name") or best_canonical
            union_map[matched] = {
                "type": "model",
                "id": matched,
                "display_name": display,
                "created_at": _created_at_from_model(m),
            }
        prev = canonical_map.get(matched)
        if not prev or (len(raw_mid) < len(str(prev))):
            canonical_map[matched] = raw_mid

    return union_map, canonical_map, raw_ids


def _store_provider_capabilities(
    config: Dict[str, Any],
    provider: str,
    *,
    status: str,
    canonical_map: Optional[Dict[str, str]] = None,
    raw_ids: Optional[List[str]] = None,
    error: str = "",
) -> None:
    models_cfg = config.setdefault("models", {})
    caps = models_cfg.setdefault("provider_model_capabilities", {})
    pcfg = (config.get("providers") or {}).get(provider) or {}

    # Get existing entry to preserve data on error/pending
    existing = caps.get(provider) if isinstance(caps.get(provider), dict) else {}

    if status == "error":
        models_list = list(raw_ids) if raw_ids else list(existing.get("models") or [])
        cmap = dict(canonical_map) if canonical_map else dict(existing.get("canonical_map") or {})
    else:
        models_list = list(raw_ids or [])
        cmap = dict(canonical_map or {})

    entry = {
        "status": status,
        "fetched_at": int(time.time()),
        "models": models_list,
        "canonical_map": cmap,
        "formats": _provider_enabled_formats(pcfg),
        "config_signature": provider_config_signature(config, provider),
    }
    if error:
        entry["error"] = error
    caps[provider] = entry
    # Mark the union snapshot as dirty so the next /v1/models request
    # rebuilds it lazily.  This avoids redundant full rebuilds when the
    # background discovery queue discovers multiple providers sequentially.
    global _union_dirty
    with _cache_lock:
        _union_dirty = True


def _rebuild_union_model_ids_from_capabilities(config: Dict[str, Any]) -> None:
    global _union_model_id_set
    caps = ((config.get("models") or {}).get("provider_model_capabilities") or {})
    model_ids = set()
    if isinstance(caps, dict):
        for provider, entry in caps.items():
            if not isinstance(entry, dict) or entry.get("status") not in ("ok", "error", "pending"):
                continue
            for mid in (entry.get("canonical_map") or {}).keys():
                model_id = str(mid or "").strip()
                if model_id and not provider_model_id_disabled(
                    config, str(provider), model_id, entry.get("canonical_map") or {}
                ) and not provider_model_auto_hidden_by_manual_map(
                    config, str(provider), model_id, entry.get("canonical_map") or {}
                ):
                    model_ids.add(model_id)
    _union_model_id_set = model_ids


def rebuild_union_model_ids_from_capabilities(config: Dict[str, Any]) -> None:
    _rebuild_union_model_ids_from_capabilities(config)


def _models_payload_from_ids(model_ids: List[str]) -> Dict[str, Any]:
    seen = set()
    models = []
    for model_id in model_ids or []:
        mid = str(model_id or "").strip()
        if not mid or mid in seen:
            continue
        seen.add(mid)
        models.append({"type": "model", "id": mid, "display_name": mid, "created_at": ""})
    return {
        "data": models,
        "has_more": False,
        "first_id": models[0]["id"] if models else "",
        "last_id": models[-1]["id"] if models else "",
    }


def _store_models_union_snapshot(
    config: Dict[str, Any],
    *,
    models_source: str,
    payload: Dict[str, Any],
    signature: Dict[str, Any],
    provider: str = "",
) -> None:
    models_cfg = config.setdefault("models", {})
    model_ids = [str(m.get("id") or "") for m in payload.get("data") or [] if isinstance(m, dict) and str(m.get("id") or "").strip()]
    models_cfg["models_union_snapshot"] = {
        "status": "ok",
        "built_at": int(time.time()),
        "models_source": models_source,
        "provider": provider,
        "signature": signature,
        "config_version": _config_version,
        "model_ids": model_ids,
        "payload": payload,
    }


def _union_signature(config: Dict[str, Any], *, models_source: str, provider: str = "") -> Dict[str, Any]:
    providers_cfg = config.get("providers") or {}
    caps = ((config.get("models") or {}).get("provider_model_capabilities") or {})
    provider_names = [provider] if provider else list(providers_cfg.keys())
    providers = {}
    if isinstance(caps, dict):
        for pname in provider_names:
            pcfg = providers_cfg.get(str(pname)) or {}
            if not pcfg.get("enabled", True):
                continue
            entry = caps.get(str(pname)) or {}
            if not isinstance(entry, dict):
                continue
            canonical_map = entry.get("canonical_map") or {}
            raw_models = entry.get("models") or []
            providers[str(pname)] = {
                "status": str(entry.get("status") or ""),
                "fetched_at": int(entry.get("fetched_at") or 0),
                "canonical_count": len(canonical_map) if isinstance(canonical_map, dict) else 0,
                "models_count": len(raw_models) if isinstance(raw_models, list) else 0,
            }
    return {
        "models_source": models_source,
        "provider": provider,
        "providers": providers,
        "configured_model_ids": _configured_model_ids(config, provider or None),
        "provider_model_map": copy_provider_model_maps(config, provider or None),
        "provider_model_disabled": copy_disabled_provider_models(config, provider or None),
    }


def copy_provider_model_maps(config: Dict[str, Any], provider: Optional[str] = None) -> Dict[str, Any]:
    maps = (config.get("models") or {}).get("provider_model_map") or {}
    if not isinstance(maps, dict):
        return {}
    if provider:
        entry = maps.get(provider) or {}
        return {provider: dict(entry)} if isinstance(entry, dict) and entry else {}
    return {
        str(p): dict(entry)
        for p, entry in maps.items()
        if isinstance(entry, dict) and entry
    }


def copy_disabled_provider_models(config: Dict[str, Any], provider: Optional[str] = None) -> Dict[str, Any]:
    disabled = (config.get("models") or {}).get("provider_model_disabled") or {}
    if not isinstance(disabled, dict):
        return {}
    if provider:
        entry = disabled.get(provider) or {}
        return {provider: dict(entry)} if isinstance(entry, dict) and entry else {}
    return {
        str(p): dict(entry)
        for p, entry in disabled.items()
        if isinstance(entry, dict) and entry
    }


def _snapshot_payload_if_current(
    config: Dict[str, Any],
    *,
    models_source: str,
    signature: Dict[str, Any],
    provider: str = "",
) -> Optional[Dict[str, Any]]:
    snapshot = ((config.get("models") or {}).get("models_union_snapshot") or {})
    if not isinstance(snapshot, dict):
        return None
    if snapshot.get("status") != "ok":
        return None
    if str(snapshot.get("models_source") or "") != models_source:
        return None
    if str(snapshot.get("provider") or "") != provider:
        return None
    # Fast path: compare config_version (O(1)) before falling back to the
    # expensive deep-dict comparison of the full signature.
    snap_version = snapshot.get("config_version")
    if snap_version is not None:
        if snap_version != _config_version:
            return None
    elif snapshot.get("signature") != signature:
        # Backward-compat: old snapshots without config_version fall back
        # to the full signature comparison.
        return None
    payload = snapshot.get("payload") or {}
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return None
    return payload


def _configured_model_ids(config: Dict[str, Any], provider: Optional[str] = None) -> List[str]:
    models_cfg = config.get("models") or {}
    providers_cfg = config.get("providers") or {}
    provider_names = [provider] if provider else list(providers_cfg.keys())
    out: List[str] = []

    for pname in provider_names:
        pcfg = providers_cfg.get(str(pname or "")) or {}
        static_models = pcfg.get("static_models")
        if isinstance(static_models, list):
            for entry in static_models:
                if isinstance(entry, str):
                    mid = entry.strip()
                elif isinstance(entry, dict):
                    mid = str(entry.get("id") or "").strip()
                else:
                    mid = ""
                if mid and not provider_model_disabled(config, str(pname or ""), mid):
                    out.append(mid)

        manual_map = (models_cfg.get("provider_model_map") or {}).get(str(pname or "")) or {}
        if isinstance(manual_map, dict):
            out.extend(
                str(mid)
                for mid in manual_map.keys()
                if str(mid or "").strip() and not provider_model_disabled(config, str(pname or ""), str(mid))
            )

    routes = models_cfg.get("routes") or {}
    if isinstance(routes, dict):
        out.extend(str(mid) for mid, route in routes.items() if str(mid or "").strip() and route is not None)

    client_map = models_cfg.get("client_model_map") or {}
    if isinstance(client_map, dict):
        out.extend(str(mid) for mid in client_map.keys() if str(mid or "").strip())

    return _dedupe(out)


def rebuild_models_union_snapshot(config: Dict[str, Any], router=None) -> Dict[str, Any]:
    """Rebuild the local /v1/models snapshot from saved capabilities/config.

    This never performs upstream I/O. Provider refresh paths update
    provider_model_capabilities first, then call this to publish a fast,
    persisted read model for GET /v1/models.
    """
    global _union_dirty
    with _cache_lock:
        _union_dirty = False
    models_source = str((config.get("models") or {}).get("models_source", "first_healthy_provider"))
    if models_source not in ("union", "first_healthy_provider"):
        return default_models()

    caps = ((config.get("models") or {}).get("provider_model_capabilities") or {})
    providers_cfg = config.get("providers") or {}

    if models_source == "union":
        model_ids: List[str] = []
        if isinstance(caps, dict):
            for provider, entry in caps.items():
                provider_name = str(provider)
                pcfg = providers_cfg.get(provider_name) or {}
                if not pcfg.get("enabled", True):
                    continue
                if not isinstance(entry, dict) or entry.get("status") not in ("ok", "pending"):
                    continue
                canonical_map = entry.get("canonical_map") or {}
                if isinstance(canonical_map, dict) and canonical_map:
                    model_ids.extend(
                        str(mid)
                        for mid in canonical_map.keys()
                        if str(mid or "").strip()
                        and not provider_model_id_disabled(config, provider_name, str(mid), canonical_map)
                        and not provider_model_auto_hidden_by_manual_map(config, provider_name, str(mid), canonical_map)
                    )
                else:
                    model_ids.extend(
                        str(mid)
                        for mid in (entry.get("models") or [])
                        if str(mid or "").strip() and not provider_model_disabled(config, provider_name, str(mid))
                    )

        model_ids.extend(_configured_model_ids(config))
        model_ids = _dedupe(model_ids)
        if not model_ids:
            _rebuild_union_model_ids_from_capabilities(config)
            return default_models()

        payload = _models_payload_from_ids(model_ids)
        signature = _union_signature(config, models_source=models_source)
        _store_models_union_snapshot(config, models_source=models_source, payload=payload, signature=signature)
        _cached_models_by_provider["__union__"] = payload
        _rebuild_union_model_ids_from_capabilities(config)
        return payload

    provider = None
    if router is not None and hasattr(router, "first_healthy_provider"):
        try:
            provider = router.first_healthy_provider()
        except Exception:
            provider = None
    if not provider:
        for pname, entry in (caps.items() if isinstance(caps, dict) else []):
            pcfg = providers_cfg.get(str(pname)) or {}
            if pcfg.get("enabled", True) and isinstance(entry, dict) and entry.get("status") == "ok":
                provider = str(pname)
                break

    model_ids = []
    if provider and isinstance(caps, dict):
        entry = caps.get(provider) or {}
        if isinstance(entry, dict) and entry.get("status") == "ok":
            canonical_map = entry.get("canonical_map") or {}
            model_ids.extend(
                str(mid)
                for mid in (entry.get("models") or [])
                if str(mid or "").strip()
                and not provider_model_id_disabled(config, provider, str(mid), canonical_map)
                and not provider_model_auto_hidden_by_manual_map(config, provider, str(mid), canonical_map)
            )
            if not model_ids and isinstance(canonical_map, dict) and canonical_map:
                model_ids.extend(
                    str(mid)
                    for mid in canonical_map.keys()
                    if str(mid or "").strip()
                    and not provider_model_id_disabled(config, provider, str(mid), canonical_map)
                    and not provider_model_auto_hidden_by_manual_map(config, provider, str(mid), canonical_map)
                )

    model_ids.extend(_configured_model_ids(config, provider))
    model_ids = _dedupe(model_ids)
    if not model_ids:
        _rebuild_union_model_ids_from_capabilities(config)
        return default_models()

    payload = _models_payload_from_ids(model_ids)
    signature = _union_signature(config, models_source=models_source, provider=provider or "")
    _store_models_union_snapshot(
        config,
        models_source=models_source,
        payload=payload,
        signature=signature,
        provider=provider or "",
    )
    if provider:
        _cached_models_by_provider[provider] = payload
    _rebuild_union_model_ids_from_capabilities(config)
    return payload


def models_from_capabilities(config: Dict[str, Any], router=None) -> Dict[str, Any]:
    """Return a client model list from saved capabilities/config only.

    This path intentionally performs no upstream I/O. Discovery is handled by
    startup/manual/provider refresh paths and persisted in provider capabilities.
    """
    # Lazy rebuild: if provider_model_capabilities changed since the last
    # snapshot was built, rebuild now.  This defers the O(N) union rebuild
    # from the background discovery thread to the next /v1/models request,
    # avoiding redundant rebuilds when multiple providers are discovered
    # sequentially.
    if _union_dirty:
        return rebuild_models_union_snapshot(config, router)

    models_source = str((config.get("models") or {}).get("models_source", "first_healthy_provider"))
    if models_source not in ("union", "first_healthy_provider"):
        return default_models()

    if models_source == "union":
        cache_key = "__union__"
        with _cache_lock:
            cached = _cached_models_by_provider.get(cache_key)
        if cached:
            return cached
        signature = _union_signature(config, models_source=models_source)
        payload = _snapshot_payload_if_current(config, models_source=models_source, signature=signature)
        if payload:
            with _cache_lock:
                _cached_models_by_provider[cache_key] = payload
            _rebuild_union_model_ids_from_capabilities(config)
            return payload
        return rebuild_models_union_snapshot(config, router)

    provider = None
    if router is not None and hasattr(router, "first_healthy_provider"):
        try:
            provider = router.first_healthy_provider()
        except Exception:
            provider = None
    if not provider:
        caps = ((config.get("models") or {}).get("provider_model_capabilities") or {})
        providers_cfg = config.get("providers") or {}
        for pname, entry in (caps.items() if isinstance(caps, dict) else []):
            pcfg = providers_cfg.get(str(pname)) or {}
            if pcfg.get("enabled", True) and isinstance(entry, dict) and entry.get("status") == "ok":
                provider = str(pname)
                break

    if provider:
        with _cache_lock:
            cached = _cached_models_by_provider.get(provider)
        if cached:
            return cached
    signature = _union_signature(config, models_source=models_source, provider=provider or "")
    payload = _snapshot_payload_if_current(
        config,
        models_source=models_source,
        signature=signature,
        provider=provider or "",
    )
    if payload:
        if provider:
            with _cache_lock:
                _cached_models_by_provider[provider] = payload
        _rebuild_union_model_ids_from_capabilities(config)
        return payload
    return rebuild_models_union_snapshot(config, router)


def to_anthropic_models(data):
    anth_models = []
    for m in _extract_model_items(data):
        mid = m.get("id") or m.get("model") or m.get("name") or ""
        if not mid:
            continue
        display = m.get("display_name") or m.get("name") or mid
        anth_models.append({"type": "model", "id": mid, "display_name": display, "created_at": _created_at_from_model(m)})

    return {
        "data": anth_models,
        "has_more": False,
        "first_id": anth_models[0]["id"] if anth_models else "",
        "last_id": anth_models[-1]["id"] if anth_models else "",
    }


def merge_similar_models(union_map: dict, auto_provider_map: dict) -> None:
    # Conservative by design: model names are only merged during parsing when
    # they normalize to the same exact lowercase id or safe vendor/model suffix.
    # Substring-based merging can route unrelated provider models together.
    _ = auto_provider_map
    global _union_model_id_set
    _union_model_id_set = set(union_map.keys())


def resolve_provider_model(config: Dict[str, Any], provider: str, canonical_model: str) -> str:
    manual_map = ((config.get("models") or {}).get("provider_model_map") or {}).get(provider) or {}
    if canonical_model in manual_map:
        return str(manual_map[canonical_model])

    caps = ((config.get("models") or {}).get("provider_model_capabilities") or {}).get(provider) or {}
    if isinstance(caps, dict):
        canonical_map = caps.get("canonical_map") or {}
        if canonical_model in canonical_map:
            return str(canonical_map[canonical_model])
        lower_model = str(canonical_model or "").lower()
        if lower_model in canonical_map:
            return str(canonical_map[lower_model])

    return canonical_model


def find_providers_for_model(
    config: Dict[str, Any], canonical_model: str
) -> List[Dict[str, Any]]:
    """Find all providers that can serve *canonical_model*.

    Returns a list of dicts, each containing:
    - ``provider``: provider name
    - ``raw_model``: the upstream model id to use
    - ``match_type``: ``"exact"`` (found in canonical_map), ``"manual"``
      (found in provider_model_map), or ``"fuzzy"`` (normalised match)

    This is the reverse lookup that powers the Dashboard's "auto-infer"
    button: given a client-requested model name, discover which providers
    already have an equivalent upstream model.
    """
    if not canonical_model:
        return []
    model = str(canonical_model).strip()
    lower_model = model.lower()
    safe_model = _safe_model_id(model)

    models_cfg = config.get("models") or {}
    caps = models_cfg.get("provider_model_capabilities") or {}
    manual_maps = models_cfg.get("provider_model_map") or {}

    results: List[Dict[str, Any]] = []
    seen_providers: set = set()

    # 1. Check manual provider_model_map first (highest priority)
    for provider, pmap in manual_maps.items():
        if not isinstance(pmap, dict):
            continue
        if model in pmap or lower_model in pmap:
            raw = str(pmap.get(model) or pmap.get(lower_model) or "")
            if raw:
                results.append({"provider": str(provider), "raw_model": raw, "match_type": "manual"})
                seen_providers.add(str(provider))

    # 2. Check discovered canonical_map (exact match)
    for provider, entry in caps.items():
        provider = str(provider)
        if provider in seen_providers:
            continue
        if not isinstance(entry, dict) or entry.get("status") != "ok":
            continue
        canonical_map = entry.get("canonical_map") or {}
        if not isinstance(canonical_map, dict):
            continue
        raw = canonical_map.get(model) or canonical_map.get(lower_model)
        if raw:
            results.append({"provider": provider, "raw_model": str(raw), "match_type": "exact"})
            seen_providers.add(provider)

    # 3. Fuzzy matching: normalise both sides and compare
    if safe_model:
        for provider, entry in caps.items():
            provider = str(provider)
            if provider in seen_providers:
                continue
            if not isinstance(entry, dict) or entry.get("status") != "ok":
                continue
            canonical_map = entry.get("canonical_map") or {}
            if not isinstance(canonical_map, dict):
                continue
            for canon, raw in canonical_map.items():
                if _safe_model_id(str(canon)) == safe_model:
                    results.append({"provider": provider, "raw_model": str(raw), "match_type": "fuzzy"})
                    seen_providers.add(provider)
                    break

    return results


def infer_model_mapping(
    config: Dict[str, Any], canonical_model: str
) -> Dict[str, str]:
    """Infer a ``{provider: raw_model}`` mapping for *canonical_model*.

    Convenience wrapper around :func:`find_providers_for_model` that returns
    a simple dict suitable for direct insertion into ``provider_model_map``.
    """
    return {
        entry["provider"]: entry["raw_model"]
        for entry in find_providers_for_model(config, canonical_model)
    }


def provider_supports_model(
    config: Dict[str, Any],
    provider: str,
    canonical_model: str,
    *,
    manual_filter_active: bool = False,
) -> bool:
    _ = manual_filter_active
    if not canonical_model:
        return True

    models_cfg = config.get("models") or {}
    manual_map = (models_cfg.get("provider_model_map") or {}).get(provider) or {}
    caps = (models_cfg.get("provider_model_capabilities") or {}).get(provider)
    canonical_map = caps.get("canonical_map") if isinstance(caps, dict) else {}

    if provider_model_id_disabled(config, provider, canonical_model, canonical_map):
        return False

    if canonical_model in manual_map:
        return True

    if isinstance(caps, dict) and caps.get("status") == "ok":
        canonical_map = canonical_map or {}
        lower_model = str(canonical_model).lower()
        if provider_model_auto_hidden_by_manual_map(config, provider, canonical_model, canonical_map):
            return False
        return canonical_model in canonical_map or lower_model in canonical_map

    pcfg = ((config.get("providers") or {}).get(provider) or {})
    if "assume_supports_unknown_models" in pcfg:
        return bool(pcfg.get("assume_supports_unknown_models"))
    if manual_filter_active:
        return False
    return bool(models_cfg.get("assume_supports_unknown_models", True))


def default_models():
    return {
        "data": [
            {
                "type": "model",
                "id": "claude-sonnet-4-20250514",
                "display_name": "Claude Sonnet 4",
                "created_at": "2025-05-14T00:00:00Z",
            },
            {
                "type": "model",
                "id": "claude-3-5-sonnet-20241022",
                "display_name": "Claude 3.5 Sonnet",
                "created_at": "2024-10-22T00:00:00Z",
            },
            {
                "type": "model",
                "id": "claude-opus-4-20250514",
                "display_name": "Claude Opus 4",
                "created_at": "2025-05-14T00:00:00Z",
            },
            {
                "type": "model",
                "id": "deepseek-v4-flash",
                "display_name": "DeepSeek V4 Flash",
                "created_at": "2025-01-01T00:00:00Z",
            },
        ],
        "has_more": False,
        "first_id": "claude-sonnet-4-20250514",
        "last_id": "deepseek-v4-flash",
    }


def fetch_upstream_models(
    config: Dict[str, Any],
    router,
    upstream_client,
    *,
    format_provider: Optional[Callable[[str], str]] = None,
    only_provider: Optional[str] = None,
):
    models_source = str((config.get("models") or {}).get("models_source", "first_healthy_provider"))
    providers_cfg = config.get("providers") or {}
    hprov = format_provider or (lambda provider: f"provider={provider}")

    def fetch_one(provider: str):
        pcfg = providers_cfg.get(provider) or {}
        if not pcfg.get("enabled", True):
            return None

        base_url = (pcfg.get("base_url") or "").rstrip("/")
        models_path = pcfg.get("models_path") or "/v1/models"
        key_entry = None
        if hasattr(router, "first_healthy_key_entry"):
            selected = router.first_healthy_key_entry(provider)
            if selected:
                _key_index, key_entry = selected
        if key_entry is None:
            key_entry = (pcfg.get("keys") or [""])[0]
        key = key_value(key_entry)
        headers = {}
        headers.update((pcfg.get("headers") or {}))
        headers["Authorization"] = f"Bearer {key}"
        configured_ua = ""
        for header_name in list(headers.keys()):
            if str(header_name).lower() == "user-agent":
                configured_ua = configured_ua or str(headers.get(header_name) or "").strip()
                headers.pop(header_name, None)
        provider_ua = str(pcfg.get("user_agent") or "").strip()
        if provider_ua:
            headers["User-Agent"] = provider_ua
        elif client_ua := (format_provider and getattr(format_provider, "_client_ua", None)):
            headers["User-Agent"] = client_ua
        else:
            headers["User-Agent"] = configured_ua or "Mozilla/5.0"

        proxy_url = resolve_proxy_url(key_proxy(key_entry), pcfg.get("proxy"), config.get("proxy"))

        errors: List[str] = []

        def _fetch(candidate_base_url: str):
            try:
                data = upstream_client.fetch_models(candidate_base_url, models_path, headers=headers, timeout_s=6, proxy_url=proxy_url)
                if data:
                    return data
                errors.append(f"{candidate_base_url.rstrip('/')}{models_path}: empty response")
                return None
            except Exception as e:
                errors.append(f"{candidate_base_url.rstrip('/')}{models_path}: {_sanitize_error(e, pcfg.get('keys') or [])}")
                return None

        data = _fetch(base_url)
        if data:
            return data

        parsed = urlparse(base_url)
        if parsed.scheme and parsed.netloc and (parsed.path or "").strip("/"):
            origin_url = f"{parsed.scheme}://{parsed.netloc}"
            if origin_url != base_url:
                data = _fetch(origin_url)
                if data:
                    return data

        # static_models as fallback when live fetch fails
        static_models = pcfg.get("static_models")
        if isinstance(static_models, list) and static_models:
            items = []
            for entry in static_models:
                if isinstance(entry, str):
                    mid = entry.strip()
                elif isinstance(entry, dict):
                    mid = str(entry.get("id") or "").strip()
                else:
                    mid = ""
                if mid:
                    items.append({"id": mid, "object": "model"})
            if items:
                out = {"object": "list", "data": items, "_source": "static"}
                if errors:
                    out["_error"] = "Live /v1/models failed; using static_models fallback: " + "; ".join(errors)
                return out
        if errors:
            raise RuntimeError("; ".join(errors))
        return data

    if only_provider:
        provider = str(only_provider)
        if provider not in providers_cfg:
            raise ValueError(f"unknown provider: {provider}")
        clear_cache(provider)
        try:
            upstream_data = fetch_one(provider)
            if not upstream_data:
                raise RuntimeError("empty upstream models")
            anth = to_anthropic_models(upstream_data)
            provider_union, canonical_map, raw_ids = parse_provider_models(provider, upstream_data)
            _ = provider_union
            if not raw_ids:
                raise RuntimeError("empty upstream models")
            _store_provider_capabilities(
                config,
                provider,
                status="ok",
                canonical_map=canonical_map,
                raw_ids=raw_ids,
                error=str(upstream_data.get("_error") or "") if isinstance(upstream_data, dict) else "",
            )
            with _cache_lock:
                _cached_models_by_provider[provider] = anth
            # Keep _union_model_id_set fresh for routing/aliasing (lightweight:
            # just iterates capabilities and builds a set).  The full
            # rebuild_models_union_snapshot() is deferred to the next
            # models_from_capabilities() call via the _union_dirty flag.
            _rebuild_union_model_ids_from_capabilities(config)
            print(f"[proxy] Refreshed {len(anth.get('data') or [])} models from {hprov(provider)}", flush=True)
            return anth
        except Exception as e:
            pcfg = providers_cfg.get(provider) or {}
            _store_provider_capabilities(
                config,
                provider,
                status="error",
                error=_sanitize_error(e, pcfg.get("keys") or []),
            )
            print(f"[proxy] Failed to refresh provider models ({hprov(provider)}): {e}", flush=True)
            return default_models()

    if models_source == "union":
        cache_key = "__union__"
        with _cache_lock:
            if cache_key in _cached_models_by_provider:
                return _cached_models_by_provider[cache_key]

        union_map: Dict[str, Dict[str, Any]] = {}
        auto_provider_map: Dict[str, Dict[str, str]] = {}

        providers_list = [p for p in providers_cfg.keys() if (providers_cfg.get(p) or {}).get("enabled", True)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, max(1, len(providers_list)))) as ex:
            futs = {ex.submit(fetch_one, p): p for p in providers_list}
            end = time.time() + 8.0
            for fut, p in list(futs.items()):
                remaining = max(0.0, end - time.time())
                if remaining <= 0:
                    break
                try:
                    upstream_data = fut.result(timeout=remaining)
                    if not upstream_data:
                        raise RuntimeError("empty upstream models")
                    provider_union, canonical_map, raw_ids = parse_provider_models(p, upstream_data)
                    if not raw_ids:
                        raise RuntimeError("empty upstream models")
                    for mid, model_info in provider_union.items():
                        union_map.setdefault(mid, model_info)
                    auto_provider_map[p] = canonical_map
                    _store_provider_capabilities(
                        config,
                        p,
                        status="ok",
                        canonical_map=canonical_map,
                        raw_ids=raw_ids,
                        error=str(upstream_data.get("_error") or "") if isinstance(upstream_data, dict) else "",
                    )
                except Exception as e:
                    pcfg = providers_cfg.get(p) or {}
                    err_msg = _sanitize_error(e, pcfg.get("keys") or [])
                    _store_provider_capabilities(
                        config,
                        p,
                        status="error",
                        error=err_msg,
                    )
                    continue

        merge_similar_models(union_map, auto_provider_map)

        fetched_payload = {
            "data": list(union_map.values()),
            "has_more": False,
            "first_id": next(iter(union_map.keys()), ""),
            "last_id": list(union_map.keys())[-1] if union_map else "",
        }
        # rebuild deferred to _union_dirty flag; just refresh model ID set
        _rebuild_union_model_ids_from_capabilities(config)
        print(f"[proxy] Auto-fetched union models: {len(fetched_payload.get('data') or [])}", flush=True)
        return fetched_payload if fetched_payload.get("data") else default_models()

    provider = router.first_healthy_provider()
    if not provider:
        return default_models()

    with _cache_lock:
        if provider in _cached_models_by_provider:
            return _cached_models_by_provider[provider]

    try:
        upstream_data = fetch_one(provider)
        if not upstream_data:
            raise RuntimeError("empty upstream models")
        anth = to_anthropic_models(upstream_data)
        provider_union, canonical_map, raw_ids = parse_provider_models(provider, upstream_data)
        _ = provider_union
        if raw_ids:
            _store_provider_capabilities(
                config,
                provider,
                status="ok",
                canonical_map=canonical_map,
                raw_ids=raw_ids,
                error=str(upstream_data.get("_error") or "") if isinstance(upstream_data, dict) else "",
            )
        with _cache_lock:
            _cached_models_by_provider[provider] = anth
        # rebuild deferred to _union_dirty flag; just refresh model ID set
        _rebuild_union_model_ids_from_capabilities(config)
        print(f"[proxy] Auto-fetched {len(anth.get('data') or [])} models from {hprov(provider)}", flush=True)
        return anth
    except Exception as e:
        pcfg = providers_cfg.get(provider) or {}
        _store_provider_capabilities(
            config,
            provider,
            status="error",
            error=_sanitize_error(e, pcfg.get("keys") or []),
        )
        print(f"[proxy] Failed to fetch upstream models ({hprov(provider)}): {e}", flush=True)
        return default_models()
