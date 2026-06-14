"""解析 AA 页面 JSON-LD + RSC 数据"""
import json
import re
from typing import Any, Optional

from bs4 import BeautifulSoup


def parse_json_ld_datasets(html: str) -> dict[str, dict]:
    soup = BeautifulSoup(html, "html.parser")
    datasets: dict[str, dict] = {}
    for b in soup.find_all("script", type="application/ld+json"):
        try:
            raw = json.loads(b.string)
            items = raw if isinstance(raw, list) else [raw]
            for item in items:
                if isinstance(item, dict) and item.get("@type") == "Dataset":
                    name = item.get("name")
                    if name and "data" in item:
                        datasets[name] = item
        except (json.JSONDecodeError, TypeError, AttributeError):
            pass
    return datasets


def find_in_ds(dataset: dict, model_slug: str) -> tuple[Optional[int], Optional[dict]]:
    path = f"/models/{model_slug}"
    for i, entry in enumerate(dataset.get("data", [])):
        if isinstance(entry, dict) and entry.get("detailsUrl") == path:
            return i + 1, entry
    return None, None


def rsc_pricing_fallback(html: str) -> dict[str, float]:
    pricing: dict[str, float] = {}
    for key, pat in [
        ("input", r'price_1m_input_tokens[^0-9]+([0-9.]+)'),
        ("output", r'price_1m_output_tokens[^0-9]+([0-9.]+)'),
        ("cache_hit", r'cache_hit_price[^0-9]+([0-9.]+)'),
        ("cache_discount", r'cache_hit_discount_percent[^0-9]+([0-9.]+)'),
    ]:
        m = re.search(pat, html)
        if m:
            pricing[key] = float(m.group(1))
    return pricing


def build_summary(datasets: dict[str, dict], model_slug: str, html: str = "") -> dict[str, Any]:
    result: dict[str, Any] = {}

    # Intelligence
    for name in ("Intelligence", "Artificial Analysis Intelligence Index"):
        ds = datasets.get(name)
        if ds:
            r, e = find_in_ds(ds, model_slug)
            if e:
                score = e.get("artificialAnalysisIntelligenceIndex") or e.get("intelligenceIndex")
                if score is not None:
                    result["intelligence"] = {"rank": r, "total": len(ds["data"]), "score": round(score, 1)}

    # Speed
    for name, key in (("Speed", "medianOutputSpeed"), ("Output Speed", "outputSpeed")):
        ds = datasets.get(name)
        if ds and "speed" not in result:
            r, e = find_in_ds(ds, model_slug)
            if e:
                speed = e.get("medianOutputSpeed") or e.get("outputSpeed")
                if speed is not None:
                    result["speed"] = {"rank": r, "total": len(ds["data"]), "tokens_per_second": round(speed, 1)}

    # Pricing
    pds = datasets.get("Pricing: Cache Hit, Input, and Output")
    if pds:
        r, e = find_in_ds(pds, model_slug)
        if e:
            bds = datasets.get("Price")
            if bds:
                _, be = find_in_ds(bds, model_slug)
                if be and be.get("pricePerMillionTokens") is not None:
                    result["price_blended"] = {"rank": r, "total": len(bds["data"]),
                                               "price_per_1m_tokens": be["pricePerMillionTokens"]}
            pricing_arr = e.get("pricing", [])
            pm = {}
            for p in pricing_arr:
                if isinstance(p, dict) and p.get("name"):
                    pm[p["name"]] = p["value"]
            result["pricing"] = {"rank": r, "total": len(pds["data"]),
                                 "cache_hit": pm.get("cacheHitPrice"),
                                 "input": pm.get("inputPrice"),
                                 "output": pm.get("outputPrice")}

    if "pricing" not in result and html:
        fb = rsc_pricing_fallback(html)
        if fb:
            result["pricing"] = {"rank": None, "total": None,
                                 "cache_hit": fb.get("cache_hit"),
                                 "input": fb.get("input"),
                                 "output": fb.get("output")}

    # Other datasets
    for ds_name, key in [
        ("Artificial Analysis Openness Index: Score", "openness"),
        ("Context Window", "context_window"),
        ("End-to-End Response Time", "latency"),
        ("Model Size: Total and Active Parameters", "model_size"),
        ("Output Tokens Used to Run Artificial Analysis Intelligence Index", "verbosity"),
        ("Cost to Run Artificial Analysis Intelligence Index", "eval_cost"),
    ]:
        if key in result:
            continue
        ds = datasets.get(ds_name)
        if not ds:
            continue
        r, e = find_in_ds(ds, model_slug)
        if not e:
            continue

        if ds_name == "End-to-End Response Time":
            result[key] = {"rank": r, "total": len(ds["data"]),
                           "input_time_s": e.get("inputTime"),
                           "reasoning_time_s": e.get("reasoningTime"),
                           "answer_time_s": e.get("answerTime")}
        elif ds_name == "Model Size: Total and Active Parameters":
            ap = e.get("activeParams")
            pp = e.get("passiveParams")
            result[key] = {"rank": r, "total": len(ds["data"]),
                           "active_params_b": ap,
                           "total_params_b": (pp or 0) + (ap or 0) if pp is not None else None}
        elif ds_name == "Cost to Run Artificial Analysis Intelligence Index":
            ic, rc, ac = e.get("inputCost"), e.get("reasoningCost"), e.get("answerCost")
            total = round(ic + rc + ac, 2) if None not in (ic, rc, ac) else None
            result[key] = {"rank": r, "total": len(ds["data"]), "total_usd": total}
        elif ds_name == "Artificial Analysis Openness Index: Score":
            v = e.get("opennessIndex")
            if v is not None:
                result[key] = {"rank": r, "total": len(ds["data"]), "score": round(v, 1)}
        elif ds_name == "Context Window":
            v = e.get("contextWindowTokens")
            if v is not None:
                result[key] = {"rank": r, "total": len(ds["data"]), "tokens": v}
        elif ds_name == "Output Tokens Used to Run Artificial Analysis Intelligence Index":
            rt = e.get("reasoningTokens")
            at = e.get("answerTokens")
            if rt is not None:
                result[key] = {"rank": r, "total": len(ds["data"]),
                               "reasoning_tokens": rt, "answer_tokens": at}

    return result
