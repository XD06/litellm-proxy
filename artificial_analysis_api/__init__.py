"""
artificial_analysis_api — LLM 模型评测摘要库

一行获取:
    from artificial_analysis_api import aa

    result = aa.get("gpt-5.5")
    result = aa.get("anthropic/claude-opus-4.8", proxy="http://127.0.0.1:8005")
    result = aa.get("deepseek-v4-flash", refresh=True)

    models = aa.list_models()
    results = aa.search("claude")

自定义缓存目录:
    from artificial_analysis_api import ModelSummary

    ms = ModelSummary(cache_dir="./my_cache")
    summary = ms.get("claude-opus-4-8")
"""
import asyncio
import time
from pathlib import Path
from typing import Optional

from .cache import ModelCache
from .fetcher import ModelFetcher
from .index import ModelIndex

__all__ = ["ModelSummary", "aa"]

# The packed index page is large and slow behind proxies; give the index phase
# its own generous budget instead of letting the tight per-model timeout kill
# it (which made first-time auto-fetches of brand-new models always fail).
_INDEX_PHASE_TIMEOUT_S = 45.0
# Re-fetch the index at most once per TTL so models released after startup
# become resolvable without a process restart or manual refresh.
_INDEX_REFRESH_TTL_S = 6 * 3600.0


class ModelSummary:
    def __init__(self, cache_dir: str | Path = "./data/aa_cache"):
        self._cache_dir = Path(cache_dir)
        self._index = ModelIndex(self._cache_dir)
        self._cache = ModelCache(self._cache_dir)
        # 本地索引可能过期（会漏掉新模型），因此在"非确定性命中"
        # （approximate/none）时联网刷新一次索引再重试；此后按 TTL
        # 周期性再刷新。
        self._index_refreshed_at = 0.0

    def _index_refresh_due(self) -> bool:
        if self._index_refreshed_at <= 0:
            return True
        return (time.time() - self._index_refreshed_at) > _INDEX_REFRESH_TTL_S

    def get(
        self,
        name: str,
        proxy: Optional[str] = None,
        refresh: bool = False,
        *,
        connect_timeout_s: float = 10.0,
        total_timeout_s: float = 30.0,
    ) -> dict:
        """获取模型摘要。"""
        return asyncio.run(self._get(name, proxy, refresh, connect_timeout_s, total_timeout_s))

    async def _get(
        self,
        name: str,
        proxy: Optional[str] = None,
        refresh: bool = False,
        connect_timeout_s: float = 10.0,
        total_timeout_s: float = 30.0,
    ) -> dict:
        # Phase 1 — index bootstrap/refresh: generous fixed budget, exempt
        # from the caller's per-model timeout.
        try:
            await asyncio.wait_for(
                self._ensure_index(proxy, 10.0, 30.0),
                timeout=_INDEX_PHASE_TIMEOUT_S,
            )
        except Exception:
            pass  # 索引不可用：继续用本地/内置索引兜底
        slug, kind = self._index.resolve_kind(name)

        # 分级映射：确定性命中（exact..substring）直接用；approximate/none
        # 说明本地索引可能过期（如新模型刚上架），联网刷新一次再重试。
        # 刷新按 TTL 周期性允许，保证新发布模型无需重启进程即可被解析。
        if kind not in ModelIndex.DETERMINISTIC_KINDS and self._index_refresh_due():
            try:
                await asyncio.wait_for(
                    self._fetch_index(proxy, 10.0, 30.0),
                    timeout=_INDEX_PHASE_TIMEOUT_S,
                )
                self._index_refreshed_at = time.time()
            except Exception:
                pass  # 刷新失败：继续用旧索引，交由下方兜底
            slug, kind = self._index.resolve_kind(name)
        else:
            self._index_refreshed_at = self._index_refreshed_at or time.time()

        # 实在无法命中 → 该模型不在 AA 上。返回 Model not found + 建议，
        # 不抓取，避免把毫不相干模型的数据张冠李戴。
        if not slug or kind == "none":
            suggestions = self._index.search(name, limit=3)
            return {
                "error": "Model not found",
                "query": name,
                "suggestion": suggestions[0] if suggestions else None,
            }
        approximate = kind == "approximate"

        # Phase 2 — model summary fetch: the caller's tight budget applies.
        async def _fetch_phase() -> dict:
            if not refresh:
                cached = self._cache.get(slug)
                if cached:
                    return {"model": slug, "summary": cached, "cached": True,
                            "match": {"kind": kind, "approximate": approximate}}

            fetcher = ModelFetcher(
                proxy,
                connect_timeout_s=connect_timeout_s,
                total_timeout_s=total_timeout_s,
            )
            try:
                result = await fetcher.fetch_and_parse(slug)
            except Exception as e:
                return {"error": str(e), "model_slug": slug}

            self._cache.set(slug, result["summary"])
            result["cached"] = False
            result["match"] = {"kind": kind, "approximate": approximate}
            return result

        return await asyncio.wait_for(
            _fetch_phase(),
            timeout=max(float(total_timeout_s), float(connect_timeout_s)),
        )

    def list_models(self, proxy: Optional[str] = None, refresh: bool = False) -> dict:
        """获取模型列表。"""
        return asyncio.run(self._list_models(proxy, refresh))

    async def _list_models(self, proxy: Optional[str] = None, refresh: bool = False) -> dict:
        if refresh:
            await self._fetch_index(proxy)
        await self._ensure_index(proxy)
        sorted_m = sorted(self._index.models.items(), key=lambda x: x[1].lower())
        return {
            "total": len(sorted_m),
            "models": [{"slug": s, "name": n} for s, n in sorted_m],
        }

    def search(self, query: str, proxy: Optional[str] = None) -> dict:
        """搜索模型。"""
        asyncio.run(self._ensure_index(proxy))
        return {"query": query, "results": self._index.search(query)}

    async def _search(self, query: str, proxy: Optional[str] = None) -> dict:
        await self._ensure_index(proxy)
        return {"query": query, "results": self._index.search(query)}

    # ---- internal ----

    async def _ensure_index(
        self,
        proxy: Optional[str] = None,
        connect_timeout_s: float = 10.0,
        total_timeout_s: float = 30.0,
    ):
        if self._index.load_local():
            return
        builtin = Path(__file__).parent / "builtin_index.json"
        if builtin.exists():
            import json
            self._index._models = json.loads(builtin.read_text()).get("models", {})
            self._index.save()
            if self._index.models:
                return
        await self._fetch_index(proxy, connect_timeout_s, total_timeout_s)

    async def _fetch_index(
        self,
        proxy: Optional[str] = None,
        connect_timeout_s: float = 10.0,
        total_timeout_s: float = 30.0,
    ):
        fetcher = ModelFetcher(
            proxy,
            connect_timeout_s=connect_timeout_s,
            total_timeout_s=total_timeout_s,
        )
        html = await fetcher.fetch_index_html()
        self._index.build_from_html(html)
        self._index.save()
        self._index_refreshed_at = time.time()


# 全局单例 — 最简用法
aa = ModelSummary()
