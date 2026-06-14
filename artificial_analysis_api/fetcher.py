"""HTTP 请求封装（代理 + UA 轮换 + 抖动）"""
import asyncio
import random
from typing import Optional

import httpx

from .parser import parse_json_ld_datasets, build_summary

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

AA_BASE = "https://artificialanalysis.ai"


class ModelFetcher:
    def __init__(self, proxy: Optional[str] = None):
        self._proxy = proxy

    def _client(self) -> httpx.AsyncClient:
        transport = httpx.AsyncHTTPTransport(proxy=self._proxy) if self._proxy else None
        headers = {**HEADERS, "User-Agent": random.choice(USER_AGENTS)}
        return httpx.AsyncClient(transport=transport, follow_redirects=True, timeout=30)

    async def fetch_html(self, slug: str) -> tuple[str, str]:
        url = f"{AA_BASE}/models/{slug}"
        async with self._client() as client:
            await asyncio.sleep(random.uniform(0.3, 1.2))
            resp = await client.get(url, headers={"User-Agent": random.choice(USER_AGENTS), **HEADERS})
            resp.raise_for_status()
            return resp.text, str(resp.url)

    async def fetch_and_parse(self, slug: str) -> dict:
        html, final_url = await self.fetch_html(slug)
        datasets = parse_json_ld_datasets(html)
        summary = build_summary(datasets, slug, html)
        if not summary:
            raise RuntimeError("No summary data extracted. AA page structure may have changed.")
        return {"model": slug, "summary": summary, "source_url": final_url}

    async def fetch_index_html(self) -> str:
        async with self._client() as client:
            await asyncio.sleep(random.uniform(0.3, 1.0))
            resp = await client.get(f"{AA_BASE}/models", headers={"User-Agent": random.choice(USER_AGENTS), **HEADERS})
            resp.raise_for_status()
            return resp.text
