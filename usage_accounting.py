#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import time
import re
from typing import Any, Dict, Optional, Tuple

_aa = None
try:
    from artificial_analysis_api import aa as _aa
except Exception:
    _aa = None


_INPUT_RATE_KEYS = (
    "input_per_million",
    "input_cost_per_million",
    "input_usd_per_million",
    "prompt_per_million",
    "prompt_cost_per_million",
    "prompt_usd_per_million",
)
_CACHE_READ_RATE_KEYS = (
    "cache_read_per_million",
    "cached_input_per_million",
    "cache_hit_per_million",
    "cache_read_input_per_million",
)
_CACHE_WRITE_RATE_KEYS = (
    "cache_write_per_million",
    "cache_creation_per_million",
    "cache_creation_input_per_million",
)
_OUTPUT_RATE_KEYS = (
    "output_per_million",
    "output_cost_per_million",
    "output_usd_per_million",
    "completion_per_million",
    "completion_cost_per_million",
    "completion_usd_per_million",
)


def empty_usage() -> Dict[str, int]:
    return {
        "input_tokens": 0,
        "uncached_input_tokens": 0,
        "cached_input_tokens": 0,
        "cache_write_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "total_tokens": 0,
    }


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return max(0, int(value))
    except Exception:
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return max(0.0, float(value))
    except Exception:
        return default


def first_number(source: Dict[str, Any], keys: tuple[str, ...]) -> int:
    for key in keys:
        if key in source and source.get(key) is not None:
            return safe_int(source.get(key))
    return 0


def first_rate(source: Dict[str, Any], keys: tuple[str, ...]) -> float:
    return _first_rate_with_presence(source, keys)[0]


def _first_rate_with_presence(source: Dict[str, Any], keys: tuple[str, ...]) -> Tuple[float, bool]:
    for key in keys:
        if key in source and source.get(key) is not None:
            return safe_float(source.get(key)), True
    return 0.0, False


def _details_number(source: Dict[str, Any], detail_keys: tuple[str, ...], value_keys: tuple[str, ...]) -> int:
    for detail_key in detail_keys:
        details = source.get(detail_key)
        if isinstance(details, dict):
            value = first_number(details, value_keys)
            if value or any(key in details for key in value_keys):
                return value
    return 0


def normalize_usage(value: Any) -> Dict[str, int]:
    if not isinstance(value, dict):
        return empty_usage()
    source = value.get("usage") if isinstance(value.get("usage"), dict) else value
    if not isinstance(source, dict):
        return empty_usage()

    output_tokens = first_number(source, ("output_tokens", "completion_tokens"))
    reasoning_tokens = first_number(source, ("reasoning_tokens",)) or _details_number(
        source,
        ("output_tokens_details", "completion_tokens_details"),
        ("reasoning_tokens",),
    )
    cached_input_tokens = first_number(
        source,
        ("cached_input_tokens", "cache_read_input_tokens", "cache_read_tokens"),
    ) or _details_number(
        source,
        ("input_tokens_details", "prompt_tokens_details"),
        ("cached_tokens", "cache_read_tokens"),
    )
    cache_write_tokens = first_number(
        source,
        (
            "cache_write_tokens",
            "cache_creation_input_tokens",
            "cache_creation_tokens",
            "cached_input_creation_tokens",
        ),
    ) or _details_number(
        source,
        ("input_tokens_details", "prompt_tokens_details"),
        ("cache_write_tokens", "cache_creation_tokens"),
    )

    raw_input_tokens = first_number(source, ("input_tokens", "prompt_tokens"))
    explicit_uncached = "uncached_input_tokens" in source and source.get("uncached_input_tokens") is not None
    anthropic_cache_shape = any(
        key in source
        for key in ("cache_read_input_tokens", "cache_creation_input_tokens")
    )
    if explicit_uncached:
        uncached_input_tokens = safe_int(source.get("uncached_input_tokens"))
        input_tokens = max(
            raw_input_tokens,
            uncached_input_tokens + cached_input_tokens + cache_write_tokens,
        )
    elif anthropic_cache_shape:
        uncached_input_tokens = raw_input_tokens
        input_tokens = raw_input_tokens + cached_input_tokens + cache_write_tokens
    else:
        input_tokens = raw_input_tokens
        uncached_input_tokens = max(0, input_tokens - cached_input_tokens - cache_write_tokens)

    return {
        "input_tokens": input_tokens,
        "uncached_input_tokens": uncached_input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "cache_write_tokens": cache_write_tokens,
        "output_tokens": output_tokens,
        "reasoning_tokens": min(reasoning_tokens, output_tokens) if output_tokens else reasoning_tokens,
        "total_tokens": input_tokens + output_tokens,
    }


def has_usage(usage: Any) -> bool:
    normalized = normalize_usage(usage)
    return any(
        int(normalized.get(key) or 0) > 0
        for key in ("input_tokens", "output_tokens", "total_tokens")
    )


def add_usage_totals(target: Dict[str, Any], usage: Any, *, cost_usd: Any = 0.0) -> None:
    normalized = normalize_usage(usage)
    for key in empty_usage():
        target[key] = safe_int(target.get(key)) + normalized[key]
    target["cost_usd"] = round(safe_float(target.get("cost_usd")) + safe_float(cost_usd), 10)


def usage_with_cost(usage: Any, *, cost_usd: Any = 0.0) -> Dict[str, Any]:
    out: Dict[str, Any] = normalize_usage(usage)
    out["cost_usd"] = round(safe_float(cost_usd), 10)
    return out


def _pricing_for_model(pricing: Dict[str, Any], provider_model: str) -> Dict[str, Any]:
    models = pricing.get("models") or pricing.get("model_prices") or pricing.get("model_pricing") or {}
    if isinstance(models, dict):
        model_price = models.get(provider_model) or models.get(str(provider_model or "").lower())
        if not isinstance(model_price, dict):
            query = str(provider_model or "").strip().lower()
            model_price = next(
                (
                    value
                    for key, value in models.items()
                    if str(key or "").strip().lower() == query and isinstance(value, dict)
                ),
                None,
            )
        if isinstance(model_price, dict):
            merged = dict(pricing)
            merged.update(model_price)
            return merged
    return pricing


def _model_lookup_keys(value: Any) -> tuple[str, ...]:
    """Return stable exact/normalized keys for a provider model identifier."""
    text = str(value or "").strip().lower()
    if not text:
        return ()
    last = re.split(r"[/\\\s]+", text)[-1]
    keys = [text, last]
    for item in (text, last):
        normalized = re.sub(r"[^a-z0-9]+", "-", item).strip("-")
        if normalized:
            keys.append(normalized)
    return tuple(dict.fromkeys(key for key in keys if key))


def _cached_model_slug(aa: Any, provider_model: str) -> Optional[str]:
    """Resolve a model directly from cached summaries when the index is stale."""
    cache = getattr(aa, "_cache", None)
    if cache is None:
        return None
    query_keys = set(_model_lookup_keys(provider_model))
    if not query_keys:
        return None
    try:
        slugs = cache.list_slugs() if hasattr(cache, "list_slugs") else []
    except Exception:
        slugs = []
    for slug in slugs or []:
        if query_keys.intersection(_model_lookup_keys(slug)):
            try:
                summary = cache.get(slug)
            except Exception:
                summary = None
            if isinstance(summary, dict):
                return str(slug)
    return None


def _snapshot_from_rates(
    *,
    input_rate: float,
    cache_read_rate: float,
    cache_write_rate: float,
    output_rate: float,
    source: str,
    resolved_model: str,
    complete: bool,
    resolved_at: Optional[int] = None,
) -> Dict[str, Any]:
    return {
        "input_per_million": safe_float(input_rate),
        "cache_read_per_million": safe_float(cache_read_rate),
        "cache_write_per_million": safe_float(cache_write_rate),
        "output_per_million": safe_float(output_rate),
        "source": str(source or ""),
        "resolved_model": str(resolved_model or ""),
        "resolved_at": int(resolved_at or time.time()),
        "complete": bool(complete),
    }


def resolve_price_snapshot(
    cfg: Dict[str, Any],
    provider: str,
    provider_model: str,
    *,
    allow_aa_cache: bool = True,
) -> Optional[Dict[str, Any]]:
    providers = (cfg or {}).get("providers") or {}
    pcfg = providers.get(provider) if isinstance(providers, dict) else {}
    if isinstance(pcfg, dict):
        pricing = pcfg.get("pricing") or pcfg.get("cost") or {}
        if isinstance(pricing, dict) and pricing:
            pricing = _pricing_for_model(pricing, provider_model)
            input_rate, has_input = _first_rate_with_presence(pricing, _INPUT_RATE_KEYS)
            output_rate, has_output = _first_rate_with_presence(pricing, _OUTPUT_RATE_KEYS)
            cache_read_rate, has_cache_read = _first_rate_with_presence(pricing, _CACHE_READ_RATE_KEYS)
            cache_write_rate, has_cache_write = _first_rate_with_presence(pricing, _CACHE_WRITE_RATE_KEYS)
            if has_input or has_output or has_cache_read or has_cache_write:
                if not has_cache_read:
                    cache_read_rate = input_rate
                if not has_cache_write:
                    cache_write_rate = input_rate
                return _snapshot_from_rates(
                    input_rate=input_rate,
                    cache_read_rate=cache_read_rate,
                    cache_write_rate=cache_write_rate,
                    output_rate=output_rate,
                    source="provider_config",
                    resolved_model=provider_model,
                    complete=has_input and has_output and has_cache_read and has_cache_write,
                )

    if not allow_aa_cache or _aa is None:
        return None
    try:
        try:
            _aa._index.load_local()
        except Exception:
            pass
        slug = _aa._index.resolve(provider_model)
        cached = _aa._cache.get(slug) if slug else None
        # The summary cache is durable and can be populated before the model
        # index is refreshed. Do not turn a valid cached price into a pending
        # lookup just because the index is temporarily stale.
        if not isinstance(cached, dict):
            cached_slug = _cached_model_slug(_aa, provider_model)
            if cached_slug:
                slug = cached_slug
                cached = _aa._cache.get(slug)
        pricing = cached.get("pricing") if isinstance(cached, dict) else None
        if not isinstance(pricing, dict):
            return None
        input_rate, has_input = _first_rate_with_presence(pricing, ("input",))
        output_rate, has_output = _first_rate_with_presence(pricing, ("output",))
        cache_read_rate, has_cache_read = _first_rate_with_presence(pricing, ("cache_hit",))
        if not (has_input or has_output or has_cache_read):
            return None
        if not has_cache_read:
            cache_read_rate = input_rate
        return _snapshot_from_rates(
            input_rate=input_rate,
            cache_read_rate=cache_read_rate,
            cache_write_rate=input_rate,
            output_rate=output_rate,
            source="aa_cache",
            resolved_model=slug or provider_model,
            complete=has_input and has_output and has_cache_read,
        )
    except Exception:
        return None


def calculate_cost_usd(usage: Any, pricing_snapshot: Optional[Dict[str, Any]]) -> float:
    normalized = normalize_usage(usage)
    if not has_usage(normalized) or not isinstance(pricing_snapshot, dict):
        return 0.0
    return round(
        normalized["uncached_input_tokens"]
        * safe_float(pricing_snapshot.get("input_per_million"))
        / 1_000_000.0
        + normalized["cached_input_tokens"]
        * safe_float(pricing_snapshot.get("cache_read_per_million"))
        / 1_000_000.0
        + normalized["cache_write_tokens"]
        * safe_float(pricing_snapshot.get("cache_write_per_million"))
        / 1_000_000.0
        + normalized["output_tokens"]
        * safe_float(pricing_snapshot.get("output_per_million"))
        / 1_000_000.0,
        10,
    )


def price_usage(
    cfg: Dict[str, Any],
    provider: str,
    provider_model: str,
    usage: Any,
    *,
    resolve_missing: bool = True,
) -> Dict[str, Any]:
    normalized = normalize_usage(usage)
    snapshot = resolve_price_snapshot(cfg, provider, provider_model)
    if snapshot is None:
        return {
            "cost_usd": 0.0,
            "cost_status": "pending" if resolve_missing else "unpriced",
            "pricing_source": "",
            "pricing_snapshot": None,
        }
    return {
        "cost_usd": calculate_cost_usd(normalized, snapshot),
        "cost_status": "priced" if snapshot.get("complete") else "estimated",
        "pricing_source": str(snapshot.get("source") or ""),
        "pricing_snapshot": snapshot,
    }


def estimate_cost_usd(cfg: Dict[str, Any], provider: str, provider_model: str, usage: Any) -> float:
    return safe_float(price_usage(cfg, provider, provider_model, usage).get("cost_usd"))
