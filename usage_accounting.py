#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict

# Module-level import of the Artificial Analysis singleton.  Previously this
# was a per-request `from artificial_analysis_api import aa` inside
# estimate_cost_usd(), which—while Python caches the module in sys.modules—
# still incurred a dict lookup + attribute resolution on every single request.
# Importing once at module load is safe: artificial_analysis_api is a local
# package with no circular dependency on this module.
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

_OUTPUT_RATE_KEYS = (
    "output_per_million",
    "output_cost_per_million",
    "output_usd_per_million",
    "completion_per_million",
    "completion_cost_per_million",
    "completion_usd_per_million",
)


def empty_usage() -> Dict[str, int]:
    return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}


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
    for key in keys:
        if key in source and source.get(key) is not None:
            return safe_float(source.get(key))
    return 0.0


def normalize_usage(value: Any) -> Dict[str, int]:
    if not isinstance(value, dict):
        return empty_usage()
    source = value.get("usage") if isinstance(value.get("usage"), dict) else value
    if not isinstance(source, dict):
        return empty_usage()

    input_tokens = first_number(source, ("input_tokens", "prompt_tokens"))
    output_tokens = first_number(source, ("output_tokens", "completion_tokens"))
    if "total_tokens" in source and source.get("total_tokens") is not None:
        total_tokens = safe_int(source.get("total_tokens"))
    else:
        total_tokens = input_tokens + output_tokens
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": max(total_tokens, input_tokens + output_tokens),
    }


def has_usage(usage: Any) -> bool:
    normalized = normalize_usage(usage)
    return any(int(normalized.get(key) or 0) > 0 for key in ("input_tokens", "output_tokens", "total_tokens"))


def add_usage_totals(target: Dict[str, Any], usage: Any, *, cost_usd: Any = 0.0) -> None:
    normalized = normalize_usage(usage)
    target["input_tokens"] = safe_int(target.get("input_tokens")) + normalized["input_tokens"]
    target["output_tokens"] = safe_int(target.get("output_tokens")) + normalized["output_tokens"]
    target["total_tokens"] = safe_int(target.get("total_tokens")) + normalized["total_tokens"]
    target["cost_usd"] = round(safe_float(target.get("cost_usd")) + safe_float(cost_usd), 10)


def usage_with_cost(usage: Any, *, cost_usd: Any = 0.0) -> Dict[str, Any]:
    out: Dict[str, Any] = normalize_usage(usage)
    out["cost_usd"] = round(safe_float(cost_usd), 10)
    return out


def _pricing_for_model(pricing: Dict[str, Any], provider_model: str) -> Dict[str, Any]:
    models = pricing.get("models") or pricing.get("model_prices") or pricing.get("model_pricing") or {}
    if isinstance(models, dict):
        model_price = models.get(provider_model) or models.get(str(provider_model or "").lower())
        if isinstance(model_price, dict):
            merged = dict(pricing)
            merged.update(model_price)
            return merged
    return pricing


def estimate_cost_usd(cfg: Dict[str, Any], provider: str, provider_model: str, usage: Any) -> float:
    normalized = normalize_usage(usage)
    if not has_usage(normalized):
        return 0.0
    providers = (cfg or {}).get("providers") or {}
    pcfg = providers.get(provider) if isinstance(providers, dict) else {}
    input_rate = 0.0
    output_rate = 0.0
    if isinstance(pcfg, dict):
        pricing = pcfg.get("pricing") or pcfg.get("cost") or {}
        if isinstance(pricing, dict):
            pricing = _pricing_for_model(pricing, provider_model)
            input_rate = first_rate(pricing, _INPUT_RATE_KEYS)
            output_rate = first_rate(pricing, _OUTPUT_RATE_KEYS)
            
    if input_rate <= 0 and output_rate <= 0:
        if _aa is not None:
            try:
                # Ensure the slug index is loaded from local file; resolve() does
                # not lazy-load so without this it returns None until aa.get() is
                # called somewhere. Pure local read, no network.
                try:
                    _aa._index.load_local()
                except Exception:
                    pass
                # Resolve model to its slug using index (memory-safe lookup)
                slug = _aa._index.resolve(provider_model)
                if slug:
                    # Query local memory/file cache only; never query network on request path
                    cached = _aa._cache.get(slug)
                    if isinstance(cached, dict) and "pricing" in cached:
                        pricing_summary = cached["pricing"]
                        input_rate = safe_float(pricing_summary.get("input"))
                        output_rate = safe_float(pricing_summary.get("output"))
            except Exception:
                pass

    if input_rate <= 0 and output_rate <= 0:
        return 0.0

    return round(
        (normalized["input_tokens"] / 1_000_000.0) * input_rate
        + (normalized["output_tokens"] / 1_000_000.0) * output_rate,
        10,
    )
