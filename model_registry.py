#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import concurrent.futures
import datetime
import re
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from proxy_utils import key_proxy, key_value, resolve_proxy_url


_cached_models_by_provider: Dict[str, Dict[str, Any]] = {}
_union_model_id_set: set = set()


def union_model_ids() -> set:
    return set(_union_model_id_set)


def has_cached_models(cache_key: str) -> bool:
    return cache_key in _cached_models_by_provider


def clear_cache() -> None:
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
    entry = {
        "status": status,
        "fetched_at": int(time.time()),
        "models": list(raw_ids or []),
        "canonical_map": dict(canonical_map or {}),
        "formats": _provider_enabled_formats(pcfg),
    }
    if error:
        entry["error"] = error
    caps[provider] = entry


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
    if canonical_model in manual_map:
        return True

    caps = (models_cfg.get("provider_model_capabilities") or {}).get(provider)
    if isinstance(caps, dict) and caps.get("status") == "ok":
        canonical_map = caps.get("canonical_map") or {}
        lower_model = str(canonical_model).lower()
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
        headers.setdefault("User-Agent", "Mozilla/5.0")

        proxy_url = resolve_proxy_url(key_proxy(key_entry), pcfg.get("proxy"), config.get("proxy"))

        data = upstream_client.fetch_models(base_url, models_path, headers=headers, timeout_s=6, proxy_url=proxy_url)
        if data:
            return data

        parsed = urlparse(base_url)
        if parsed.scheme and parsed.netloc and (parsed.path or "").strip("/"):
            origin_url = f"{parsed.scheme}://{parsed.netloc}"
            if origin_url != base_url:
                return upstream_client.fetch_models(origin_url, models_path, headers=headers, timeout_s=6, proxy_url=proxy_url)
        return data

    if models_source == "union":
        cache_key = "__union__"
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
                    )
                except Exception as e:
                    pcfg = providers_cfg.get(p) or {}
                    _store_provider_capabilities(
                        config,
                        p,
                        status="error",
                        error=_sanitize_error(e, pcfg.get("keys") or []),
                    )
                    continue

        merge_similar_models(union_map, auto_provider_map)

        anth = {
            "data": list(union_map.values()),
            "has_more": False,
            "first_id": next(iter(union_map.keys()), ""),
            "last_id": list(union_map.keys())[-1] if union_map else "",
        }
        global _union_model_id_set
        _union_model_id_set = set(union_map.keys())

        _cached_models_by_provider[cache_key] = anth
        print(f"[proxy] Auto-fetched union models: {len(anth.get('data') or [])}", flush=True)
        return anth if anth.get("data") else default_models()

    provider = router.first_healthy_provider()
    if not provider:
        return default_models()

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
            )
        _cached_models_by_provider[provider] = anth
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
