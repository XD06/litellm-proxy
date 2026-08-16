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
from pathlib import Path
from typing import Optional

from .cache import ModelCache
from .fetcher import ModelFetcher
from .index import ModelIndex

__all__ = ["ModelSummary", "aa"]


class ModelSummary:
    def __init__(self, cache_dir: str | Path = "./data/aa_cache"):
        self._cache_dir = Path(cache_dir)
        self._index = ModelIndex(self._cache_dir)
        self._cache = ModelCache(self._cache_dir)
        # 进程内标记索引是否已联网刷新过。旧内置索引（如 6 月的 500 模型）
        # 会漏掉新模型，且模糊匹配可能把新模型误配到旧模型（kimi-k3 -> kimi-k2），
        # 因此在首次"非精确命中"时联网刷新一次索引再重试。
        self._index_fresh = False

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
        async def resolve():
            return await asyncio.wait_for(
                self._get(name, proxy, refresh, connect_timeout_s, total_timeout_s),
                timeout=max(float(total_timeout_s), float(connect_timeout_s)),
            )

        return asyncio.run(resolve())

    async def _get(
        self,
        name: str,
        proxy: Optional[str] = None,
        refresh: bool = False,
        connect_timeout_s: float = 10.0,
        total_timeout_s: float = 30.0,
    ) -> dict:
        await self._ensure_index(proxy, connect_timeout_s, total_timeout_s)
        slug = self._index.resolve(name)

        # 本地索引未精确命中 → 可能是新模型或索引过期（模糊匹配可能假阳性，
        # 如 kimi-k3 被误配到 kimi-k2、不存在的变体被误配到基础模型），
        # 联网刷新索引后重试一次。
        if (not slug or not self._index.is_exact_resolve(name, slug)) and not self._index_fresh:
            try:
                await self._fetch_index(proxy, connect_timeout_s, total_timeout_s)
                self._index_fresh = True
            except Exception:
                pass  # 刷新失败：继续用旧索引，交由下方精确性判断兜底
            slug = self._index.resolve(name)

        # 无法精确命中 → 该模型不在 AA 上（或索引刷新失败）。宁可返回
        # Model not found + 建议，也不能用模糊匹配的 slug 去抓相似模型的
        # 数据（如 gemini-3.7-flash-high -> gemini-3-7-flash），也不能用
        # None slug 去请求 /models/None。
        if not slug or not self._index.is_exact_resolve(name, slug):
            suggestions = self._index.search(name, limit=3)
            return {
                "error": "Model not found",
                "query": name,
                "suggestion": suggestions[0] if suggestions else None,
            }

        if not refresh:
            cached = self._cache.get(slug)
            if cached:
                return {"model": slug, "summary": cached, "cached": True}

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
        return result

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
        self._index_fresh = True


# 全局单例 — 最简用法
aa = ModelSummary()
