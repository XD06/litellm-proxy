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


def rsc_pricing_fallback(html: str, model_slug: str = "") -> dict[str, float]:
    """从 RSC 提取定价，兼容新旧两种字段命名。

    新版（2026 改版后）RSC 使用驼峰字段（price1mInputTokens 等），
    且模型页包含多个模型的完整对象——必须按目标 slug 定位到对应对象，
    否则可能取到对比模型的价格。旧版下划线字段（price_1m_input_tokens 等）
    保留作为兜底。cacheWritePrice 等 null 值字段自动跳过。
    """
    # (输出键, 驼峰正则, 下划线正则)
    # 精确匹配 `price1mInputTokens\":3` 形式（HTML 层为单反斜杠转义），
    # 值必须是数字——null 值（如 cacheWritePrice）直接不匹配，避免正则吞掉
    # 相邻字段的数字。
    FIELD_PATTERNS = [
        ("input", r'price1mInputTokens\\":([0-9.]+)', r'price_1m_input_tokens[^0-9.]+([0-9.]+)'),
        ("output", r'price1mOutputTokens\\":([0-9.]+)', r'price_1m_output_tokens[^0-9.]+([0-9.]+)'),
        ("cache_hit", r'cacheHitPrice\\":([0-9.]+)', r'cache_hit_price[^0-9.]+([0-9.]+)'),
        ("cache_discount", r'cacheHitDiscountPercent\\":([0-9.]+)', r'cache_hit_discount_percent[^0-9.]+([0-9.]+)'),
    ]

    def _match(window: str) -> dict[str, float]:
        out: dict[str, float] = {}
        for key, camel_pat, snake_pat in FIELD_PATTERNS:
            m = re.search(camel_pat, window) or re.search(snake_pat, window)
            if m:
                out[key] = float(m.group(1))
        return out

    # 窗口1：目标模型对象（slug 到下一个模型对象的 id 锚点之间）
    # 注意不能用"下一个 slug"做边界——模型对象内部的 release:{slug:...}
    # 嵌套 slug 会提前截断窗口；而嵌套对象没有 "id":"<uuid>"，用它做锚点
    # 才能完整覆盖当前模型对象（价格字段在对象后部，距 slug 约 1.6KB）。
    if model_slug:
        m = re.search(r'slug\\":\\"' + re.escape(model_slug) + r'\\"', html)
        if m:
            start = m.end()
            tail = html[start:]
            nxt = re.search(r'\\"id\\":\\"[0-9a-fA-F-]{36}', tail)
            end = start + nxt.start() if nxt else min(len(html), start + 20000)
            pricing = _match(html[start:end])
            if pricing:
                return pricing
    # 窗口2：全局兜底（旧结构 / 模型页只有一个完整对象时同样有效）
    return _match(html)


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
        fb = rsc_pricing_fallback(html, model_slug)
        if fb:
            result["pricing"] = {"rank": None, "total": None,
                                 "cache_hit": fb.get("cache_hit"),
                                 "input": fb.get("input"),
                                 "output": fb.get("output")}

    # 补充缓存折扣：JSON-LD 的 Pricing dataset 只含 cacheHitPrice/inputPrice/
    # outputPrice，不含 cacheHitDiscountPercent；而页面"Cache Discount"即此值，
    # 只能从 RSC 按 slug 提取。两个 pricing 分支（JSON-LD / fallback）统一在此补。
    if "pricing" in result and html and result["pricing"].get("cache_discount") is None:
        fb = rsc_pricing_fallback(html, model_slug)
        if fb.get("cache_discount") is not None:
            result["pricing"]["cache_discount"] = fb["cache_discount"]

    # Other datasets（新名字在前，旧名字保留兼容旧页面）
    for ds_name, key in [
        ("Artificial Analysis Openness Index: Score", "openness"),
        ("Context Window", "context_window"),
        ("End-to-End Response Time", "latency"),
        ("Model Size: Total and Active Parameters", "model_size"),
        ("Output Tokens per Intelligence Index Task", "verbosity"),
        ("Output Tokens Used to Run Artificial Analysis Intelligence Index", "verbosity"),
        ("Cost per Intelligence Index Task", "eval_cost"),
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
        elif key == "eval_cost":
            # 旧版字段名：inputCost/reasoningCost/answerCost（整次评测总成本）
            ic, rc, ac = e.get("inputCost"), e.get("reasoningCost"), e.get("answerCost")
            if None not in (ic, rc, ac):
                total = round(ic + rc + ac, 2)
            else:
                # 新版字段名（2026 改版后）：input/reasoning/cacheHit/cacheWrite/answer
                # （每个 Intelligence Index task 的 USD 成本，页面显示的
                #  "Cost per Intelligence Index Task" 即五者之和）
                parts = [e.get("input"), e.get("reasoning"), e.get("cacheHit"),
                         e.get("cacheWrite"), e.get("answer")]
                total = round(sum(p for p in parts if p is not None), 2) if any(p is not None for p in parts) else None
            result[key] = {"rank": r, "total": len(ds["data"]), "total_usd": total}
        elif ds_name == "Artificial Analysis Openness Index: Score":
            v = e.get("opennessIndex")
            if v is not None:
                result[key] = {"rank": r, "total": len(ds["data"]), "score": round(v, 1)}
        elif ds_name == "Context Window":
            v = e.get("contextWindowTokens")
            if v is not None:
                result[key] = {"rank": r, "total": len(ds["data"]), "tokens": v}
        elif key == "verbosity":
            rt = e.get("reasoningTokens")
            at = e.get("answerTokens")
            if rt is None:  # 新版 dataset 改用 reasoning / answer
                rt = e.get("reasoning")
                at = e.get("answer")
            if rt is not None:
                result[key] = {"rank": r, "total": len(ds["data"]),
                               "reasoning_tokens": rt, "answer_tokens": at}

    return result
