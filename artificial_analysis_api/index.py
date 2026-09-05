"""模型索引：从 AA 页面 RSC 中提取模型列表 + 模糊匹配"""
import json
import re
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional


def _normalize(s: str) -> str:
    s = s.lower().strip()
    for ch in (".", " ", "/"):
        s = s.replace(ch, "-")
    for ch in ("(", ")", ":", ","):
        s = s.replace(ch, "")
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


# AA 的 index slug 对“厂商前缀-版本号”两种写法并存
#（qwen3-8-* 无横杠，qwen-2-5-max 有横杠），_alias_forms 把查询展开成
# 多种等价写法。仅精确命中有效，不产生模糊，因此不会误配。
def _alias_forms(normalized: str) -> list[str]:
    forms = [normalized]
    # qwen-3-8-flash -> qwen3-8-flash（去厂商/数字间横杠）
    stripped = re.sub(r"(?<=[a-z])-(?=\d)", "", normalized)
    if stripped != normalized:
        forms.append(stripped)
    # qwen3-8-flash -> qwen-3-8-flash（反向，兼容旧写法）
    dashed = re.sub(r"(?<=[a-z])(?=\d)", "-", normalized)
    if dashed not in forms:
        forms.append(dashed)
    return forms


# 已知实验性变体后缀（按长度降序，-non-reasoning 必须先于 -reasoning 剥离）。
# 家族归一时剥离，用于判断候选是否属于“同一家族”。
_VARIANT_SUFFIXES = (
    "-non-reasoning",
    "-reasoning",
    "-minimal",
    "-xhigh",
    "-medium",
    "-high",
    "-low",
)


def _strip_variant(slug: str) -> str:
    for suf in _VARIANT_SUFFIXES:
        if slug.endswith(suf):
            return slug[: -len(suf)]
    return slug


# SequenceMatcher 近似命中的最低相似度。低于此值一律返回 none（只给建议，
# 不抓取），避免把毫不相干的模型数据张冠李戴。0.85 可容忍拼写错误
# （deepsek-v4-flash -> deepseek-v4-flash ≈ 0.94），同时拒绝歧义过大的
# 短查询（gpt-5 -> gpt-5-5 仅 0.83，且可能是 GPT-5 家族任一变体）。
_APPROXIMATE_THRESHOLD = 0.85
# token 级（按 "-" 切分）最低相似度：转置/乱序的 token 序列在此被拦截
# （gpt-5-4 vs gpt-4-5 仅 "gpt" 对齐 ≈ 0.33）。
_TOKEN_THRESHOLD = 0.6
# 首 token（厂商前缀）最低相似度：grok vs gpt ≈ 0.29 否决，
# deepsek vs deepseek ≈ 0.93 放行（拼写错误仍可近似命中）。
_PREFIX_THRESHOLD = 0.6


def _canonical_prefix(token: str) -> str:
    """首 token 规范形：字母前缀长度≥2 时去尾部数字。

    qwen3 -> qwen（与 qwen 等价，兼容 AA 两种写法），o1 保持 o1
    （o1 ≠ o3），gpt/grok 保持原样（互不相等即不同厂商）。
    """
    m = re.match(r"([a-z]{2,})\d*$", token)
    return m.group(1) if m else token


def _prefix_compatible(q_pref: str, s_pref: str) -> bool:
    """前缀不可变：规范形相等，或拼写高度相似（容忍拼写错误）。

    grok vs gpt 直接否决；deepsek vs deepseek 放行。
    """
    if _canonical_prefix(q_pref) == _canonical_prefix(s_pref):
        return True
    return SequenceMatcher(None, q_pref, s_pref).ratio() >= _PREFIX_THRESHOLD


def _digit_compatible(q_norm: str, slug: str) -> bool:
    """顺序不可变：双方数字序列必须一方是另一方的子序列。

    gpt-5-4（5,4）vs gpt-4-5（4,5）互相不是子序列 -> 否决；
    gpt-5（5）vs gpt-5-5（5,5）是子序列 -> 放行（再由相似度阈值把关）。
    无数字时恒成立，交由其他条件判断。
    """
    qd, sd = re.findall(r"\d+", q_norm), re.findall(r"\d+", slug)

    def _sub(a: list[str], b: list[str]) -> bool:
        it = iter(b)
        return all(x in it for x in a)

    return _sub(qd, sd) or _sub(sd, qd)


def _family_default_in(models: dict[str, str], form: str) -> Optional[str]:
    """单家族默认：form 是某一家族全体成员的公共前缀时返回默认成员。

    候选剥离变体后缀（-xhigh/-reasoning 等）后必须归一到同一家族，
    多家族（如 gpt-5 对应几十个家族）一律返回 None，避免误配。
    家族内优先无后缀的基础成员，否则取最短（同长度字典序稳定）。
    """
    if len(form) < 3:
        return None
    prefix = form + "-"
    members = [s for s in models if s.startswith(prefix)]
    if not members:
        return None
    families: dict[str, list[str]] = {}
    for s in members:
        families.setdefault(_strip_variant(s), []).append(s)
    if len(families) != 1:
        return None
    stem, group = next(iter(families.items()))
    if stem in group:
        return stem
    group.sort(key=lambda s: (len(s), s))
    return group[0]


def _prefer_member(stem: str, group: list[str]) -> str:
    if stem in group:
        return stem
    return sorted(group, key=lambda s: (len(s), s))[0]


def _resolve_with_kind_in(
    models: dict[str, str],
    query: str,
    *,
    allow_approximate: bool = True,
) -> tuple[Optional[str], str]:
    """分级映射管线，返回 (slug, kind)。差别主要在格式/分隔符时总有一级能中；
    实在无法命中才返回 none（调用方给建议，不抓取）。

    kind（前 7 级为确定性命中，可直接抓取）：
    exact（slug 直接命中）/ name（显示名命中）/ stripname（去括号显示名
    全索引唯一）/ alias（别名写法精确命中，如 gpt-5.6-sol -> gpt-5-6-sol、
    qwen-3.8 -> qwen3-8）/ family（单家族默认，如 qwen3-32b ->
    qwen3-32b-instruct）/ segment（取 vendor/name 尾段后确定性命中）/
    substring（任一别名写法是唯一 slug/单一家族的子串，如 opus 4.8 ->
    claude-opus-4-8）/ approximate（高相似度兜底且同时满足前缀/顺序不变，
    抓取但标记）/ none。
    allow_approximate=False 时不跑 SequenceMatcher 慢路径（定价批量查询用，
    避免每个未知模型 80ms）。
    """
    q = (query or "").strip().lower()
    if not q:
        return None, "none"
    if q in models:
        return q, "exact"

    name_to_slug = {v.lower(): k for k, v in models.items()}
    if q in name_to_slug:
        return name_to_slug[q], "name"

    # 去括号显示名："DeepSeek V4 Flash" vs "DeepSeek V4 Flash (Max)"。
    # 仅括号外完全一致且全索引唯一时命中，多变体共用同一括号外
    # 名称时（如 GPT-5.5 有 medium/high/low）拒绝猜测，交由建议流程。
    stripped_q = re.sub(r"\s*\(.*?\)\s*", "", q).strip()
    if stripped_q and stripped_q != q:
        stripped_map: dict[str, list[str]] = {}
        for s, n in models.items():
            key = re.sub(r"\s*\(.*?\)\s*", "", n).strip().lower()
            if key:
                stripped_map.setdefault(key, []).append(s)
        group = stripped_map.get(stripped_q, [])
        if len(group) == 1:
            return group[0], "stripname"

    # 全查询归一/别名/家族优先于尾段拆分："claude opus 4.8" 整体即
    # claude-opus-4-8，不能先拆出 "4.8" 再模糊（会误配最短子串）。
    forms = _alias_forms(_normalize(q))
    for form in forms:
        if form in models:
            return form, "alias"

    for form in forms:
        fam = _family_default_in(models, form)
        if fam:
            return fam, "family"

    # 尾段递归：处理 "vendor/model.name"、"Pro/Qwen/Qwen3-32B" 形式。
    # 内层 approximate 冒泡为外层 approximate（抓取但标记）。
    parts = re.split(r"[/\s]+", q)
    last = parts[-1]
    if last != q:
        slug, kind = _resolve_with_kind_in(models, last,
                                           allow_approximate=allow_approximate)
        if slug:
            return slug, kind if kind == "approximate" else "segment"
        # 尾段无命中不直接放弃：继续走下面的子串/近似级
        # （如 "opus 4.8" 尾段 "4.8" 无意义，整体确是 claude-opus-4-8）。

    # 子串唯一：任一别名写法是唯一 slug / 单一家族的子串。
    # 多家族（如 "flash" 命中几十个）直接跳过，避免误配。
    sub_families: dict[str, list[str]] = {}
    for form in forms:
        if len(form) < 3:
            continue
        for s in models:
            if form in s:
                sub_families.setdefault(_strip_variant(s), []).append(s)
    if len(sub_families) == 1:
        stem, group = next(iter(sub_families.items()))
        return _prefer_member(stem, group), "substring"

    if not allow_approximate:
        return None, "none"

    # 近似兜底：字符相似度达阈值，且同时满足“前缀不可变、顺序不可变”
    # 才命中（抓取但标记 approximate）。三道否决：
    # ① 首 token 厂商不同（grok-4.5 vs gpt-4.5）；
    # ② 数字转置（gpt-5-4 vs gpt-4-5）；
    # ③ token 级乱序或差异过大。
    norm_q = _normalize(q)
    q_tokens = norm_q.split("-")
    q_pref = q_tokens[0] if q_tokens else ""
    best_slug: Optional[str] = None
    best_score = 0.0
    for slug, name in models.items():
        score = max(
            SequenceMatcher(None, q, slug).ratio(),
            SequenceMatcher(None, q, name.lower()).ratio(),
            SequenceMatcher(None, norm_q, _normalize(name)).ratio(),
        )
        if score < _APPROXIMATE_THRESHOLD:
            continue
        s_tokens = slug.split("-")
        if not s_tokens or not _prefix_compatible(q_pref, s_tokens[0]):
            continue
        if not _digit_compatible(norm_q, slug):
            continue
        if SequenceMatcher(None, q_tokens, s_tokens).ratio() < _TOKEN_THRESHOLD:
            continue
        if score > best_score or (score == best_score and best_slug is not None
                                  and (len(slug), slug) < (len(best_slug), best_slug)):
            best_score, best_slug = score, slug
    if best_slug is not None:
        return best_slug, "approximate"
    return None, "none"


def resolve_deterministic(
    models: dict[str, str], query: str
) -> tuple[Optional[str], str]:
    """无 I/O 的确定性解析：exact..substring 级，不跑 SequenceMatcher。

    给定价批量查询等高频只读路径用（未知模型也不触发 80ms 慢路径）。
    与 ModelIndex 同一管线，保证行为一致。
    """
    return _resolve_with_kind_in(models, query, allow_approximate=False)


class ModelIndex:
    def __init__(self, cache_dir: str | Path):
        self._cache_file = Path(cache_dir) / "model_index.json"
        self._models: dict[str, str] = {}  # slug -> short_name
        # Process-local cache of resolve() results so repeated lookups for the
        # same model name (e.g. one per request in cost estimation, or a batch
        # pricing query) do not re-run the O(n) fuzzy matcher every time. The
        # index is static for the process lifetime, so caching is safe.
        # value 是 (slug, kind)，kind 见 _resolve_with_kind。
        self._resolve_cache: dict[str, tuple[Optional[str], str]] = {}

    # ---- load / save ----

    def load_local(self) -> bool:
        if self._models:
            return True
        if self._cache_file.exists():
            try:
                self._models = json.loads(self._cache_file.read_text()).get("models", {})
                if self._models:
                    self.invalidate_resolve_cache()
                return bool(self._models)
            except (json.JSONDecodeError, KeyError):
                pass
        return False

    def invalidate_resolve_cache(self) -> None:
        """Drop memoized resolve() results.

        The cache is only valid for one snapshot of ``_models``; a refreshed
        index must invalidate it, otherwise newly added models stay unresolvable
        (and stale fuzzy mismatches persist) until process restart.
        """
        self._resolve_cache.clear()

    def save(self):
        self._cache_file.parent.mkdir(parents=True, exist_ok=True)
        self._cache_file.write_text(
            json.dumps({"updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "models": self._models})
        )

    # ---- build from RSC ----

    def build_from_html(self, html: str):
        """从 /models 页面的 RSC 数据流提取 (slug -> 显示名)。

        AA 页面 2026 年改版后的结构：
        - 完整模型对象形如 {"slug": "...", "name": "...", "deprecated": ...}；
        - 只有 initialModels 里的极少数对象带 shortName 字段。
        因此 shortName 从必选改为可选，缺失时用 name 兜底，
        否则索引只能解析出 initialModels 的几个模型。
        """
        pairs: dict[str, str] = {}
        pos = 0
        while True:
            i = html.find('slug\\":\\"', pos)
            if i == -1:
                break
            vs = i + 9
            ve = html.find('\\"', vs)
            slug = html[vs:ve]
            if not slug or len(slug) < 6:
                pos = ve + 2
                continue
            if '\\"deprecated\\"' not in html[ve:ve + 250]:
                pos = ve + 2
                continue

            j2 = html.find('name\\":\\"', ve)
            if j2 == -1 or j2 - ve > 300:
                pos = ve + 2
                continue
            ns = j2 + 9
            ne = html.find('\\"', ns)
            name = html[ns:ne]

            # shortName 仅存在于少数对象，缺失时回退到 name
            display = name
            j3 = html.find('shortName\\":\\"', ne)
            if j3 != -1 and j3 - ne <= 300:
                ss = j3 + 14
                se = html.find('\\"', ss)
                display = html[ss:se]
                pos = se + 2
            else:
                pos = ne + 2
            pairs[slug] = display

        self._models = pairs
        # 索引重建后清空 resolve 结果缓存，避免进程内继续使用旧索引的匹配结果
        self._resolve_cache.clear()

    @property
    def models(self) -> dict[str, str]:
        return dict(self._models)

    @property
    def size(self) -> int:
        return len(self._models)

    # ---- resolve ----

    def resolve(self, query: str) -> Optional[str]:
        # Memoize: the index does not change during the process lifetime, so a
        # repeated resolve() for the same query returns the cached slug without
        # re-running the O(n) fuzzy matcher. This is what makes batch pricing
        # queries (200+ models) fast on the second call.
        return self.resolve_kind(query)[0]

    def resolve_kind(self, query: str) -> tuple[Optional[str], str]:
        """与 resolve() 同一管线，但同时返回 kind（见 _resolve_with_kind_in）。"""
        cache_key = (query or "").strip().lower()
        if cache_key in self._resolve_cache:
            return self._resolve_cache[cache_key]
        out = _resolve_with_kind_in(self._models, query)
        self._resolve_cache[cache_key] = out
        return out

    def warm(self, query: str) -> Optional[str]:
        """启动预热专用：只计算确定性级别（exact..substring）并 memoize。

        未知模型（如 embedding/私有模型）不跑 SequenceMatcher 慢路径
        （单个 ~126ms，几百个即烧满 GIL 一分钟，拖慢启动后的管理接口），
        也不写入缓存——按需 resolve() 仍会走完整管线（含近似级），
        缓存语义与逐个查询完全一致。
        """
        cache_key = (query or "").strip().lower()
        if cache_key in self._resolve_cache:
            return self._resolve_cache[cache_key][0]
        slug, kind = _resolve_with_kind_in(
            self._models, query, allow_approximate=False
        )
        if kind in self.DETERMINISTIC_KINDS:
            self._resolve_cache[cache_key] = (slug, kind)
            return slug
        return None

    # 确定性命中：可直接抓取，无需二次确认。approximate 也会抓取，
    # 但响应带 match.approximate=true 标记；none 不抓取，只给建议。
    DETERMINISTIC_KINDS = frozenset({
        "exact", "name", "stripname", "alias", "family", "segment", "substring",
    })

    def is_exact_resolve(self, query: str, slug: Optional[str]) -> bool:
        """判断 resolve() 的结果是否为"确定性命中"（非近似猜测）。

        别名（qwen-3-8-flash -> qwen3-8-flash-next）、单家族默认
        （qwen3-32b -> qwen3-32b-instruct）、子串唯一
        （opus 4.8 -> claude-opus-4-8）都属于确定性命中；
        响应中的 model / match 字段会带出实际抓取的 slug 与 kind。
        SequenceMatcher 近似命中返回 False，调用方据此决定是否先联网
        刷新索引再重试（索引过期时近似可能是假阳性）。
        """
        if not slug:
            return False
        cache_key = (query or "").strip().lower()
        ent = self._resolve_cache.get(cache_key)
        if ent is not None and ent[0] == slug:
            return ent[1] in self.DETERMINISTIC_KINDS
        # 没走过 resolve()（或索引中途被替换）：用同一管线复算，保证单一真相源
        slug2, kind = _resolve_with_kind_in(self._models, query)
        return slug2 == slug and kind in self.DETERMINISTIC_KINDS

    def _family_default(self, form: str) -> Optional[str]:
        return _family_default_in(self._models, form)

    def _resolve_with_kind(self, query: str) -> tuple[Optional[str], str]:
        return _resolve_with_kind_in(self._models, query)

    def search(self, query: str, limit: int = 30) -> list[dict]:
        q = query.lower().strip()
        norm_q = _normalize(q)
        alias = {f for f in _alias_forms(norm_q) if f != norm_q}
        results = []
        for slug, name in self._models.items():
            nl = name.lower()
            score = 0
            if q == slug or q == nl or norm_q == slug or slug in alias:
                score = 1.0
            elif q in slug or q in nl or norm_q in slug or norm_q in nl:
                score = 0.8
            else:
                hit_alias = False
                for f in alias:
                    if f in slug or f in nl:
                        score = 0.8
                        hit_alias = True
                        break
                if not hit_alias:
                    ratio = max(SequenceMatcher(None, q, slug).ratio(),
                                SequenceMatcher(None, q, name.lower()).ratio())
                    if ratio > 0.5:
                        score = ratio
            if score > 0:
                results.append({"slug": slug, "name": name, "score": round(score, 3)})
        results.sort(key=lambda x: (-x["score"], x["slug"]))
        return results[:limit]
