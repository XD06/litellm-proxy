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


class ModelIndex:
    def __init__(self, cache_dir: str | Path):
        self._cache_file = Path(cache_dir) / "model_index.json"
        self._models: dict[str, str] = {}  # slug -> short_name
        # Process-local cache of resolve() results so repeated lookups for the
        # same model name (e.g. one per request in cost estimation, or a batch
        # pricing query) do not re-run the O(n) fuzzy matcher every time. The
        # index is static for the process lifetime, so caching is safe.
        self._resolve_cache: dict[str, Optional[str]] = {}

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
        cache_key = (query or "").strip().lower()
        if cache_key in self._resolve_cache:
            return self._resolve_cache[cache_key]
        result = self._resolve_uncached(query)
        self._resolve_cache[cache_key] = result
        return result

    def is_exact_resolve(self, query: str, slug: Optional[str]) -> bool:
        """判断 resolve() 的结果是否为"精确命中"（非模糊匹配兜底）。

        用于区分：本地索引直接命中的模型 vs 靠 SequenceMatcher 猜出来的模型。
        后者在索引过期时可能是假阳性（如 kimi-k3 被误配到 kimi-k2），
        调用方应据此决定是否先联网刷新索引再重试。
        """
        if not slug:
            return False
        q = (query or "").strip().lower()
        if q == slug:
            return True
        # 显示名精确命中（与 resolve 的 name_to_slug 分支一致）
        for s, n in self._models.items():
            if s == slug and n and n.lower() == q:
                return True
        # 尾段精确命中（与 resolve 的 parts 分支一致，递归复现其路径，
        # 处理 "vendor/model.name" 形式：尾段再按归一化等规则精确命中）
        last = re.split(r"[/\s]+", q)[-1]
        if last != q and self.is_exact_resolve(last, slug):
            return True
        # 归一化精确命中（与 resolve 的 normalized 分支一致）
        return _normalize(q) == slug

    def _resolve_uncached(self, query: str) -> Optional[str]:
        q = query.strip().lower()
        if q in self._models:
            return q

        name_to_slug = {v.lower(): k for k, v in self._models.items()}
        if q in name_to_slug:
            return name_to_slug[q]

        parts = re.split(r"[/\s]+", q)
        last = parts[-1]
        if last != q:
            return self.resolve(last)

        normalized = _normalize(q)
        if normalized in self._models:
            return normalized

        candidates: list[tuple[str, float]] = []
        for slug, name in self._models.items():
            nm = name.lower()
            if q in nm or normalized in nm:
                candidates.append((slug, 1.0))
            elif q in slug or normalized in slug:
                candidates.append((slug, 0.9))

        if not candidates:
            for slug, name in self._models.items():
                score = max(
                    SequenceMatcher(None, q, slug).ratio(),
                    SequenceMatcher(None, q, name.lower()).ratio(),
                    SequenceMatcher(None, normalized, _normalize(name)).ratio(),
                )
                if score > 0.55:
                    candidates.append((slug, score))

        candidates.sort(key=lambda x: (-x[1], len(x[0])))
        return candidates[0][0] if candidates else None

    def search(self, query: str, limit: int = 30) -> list[dict]:
        q = query.lower().strip()
        results = []
        for slug, name in self._models.items():
            score = 0
            if q == slug or q == name.lower():
                score = 1.0
            elif q in slug or q in name.lower():
                score = 0.8
            else:
                ratio = max(SequenceMatcher(None, q, slug).ratio(),
                            SequenceMatcher(None, q, name.lower()).ratio())
                if ratio > 0.5:
                    score = ratio
            if score > 0:
                results.append({"slug": slug, "name": name, "score": round(score, 3)})
        results.sort(key=lambda x: (-x["score"], x["slug"]))
        return results[:limit]
