"""FastAPI router — 可挂载到已有项目

These endpoints trigger outbound fetches (index refresh, per-model scrape),
so when the service is reachable by anyone other than the owner, set
AA_API_KEY to require X-API-Key on every call.
"""
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse

from . import ModelSummary

_API_KEY = os.environ.get("AA_API_KEY", "").strip()


def _require_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    if not _API_KEY:
        return
    supplied = (x_api_key or "").strip()
    if not supplied or not secrets.compare_digest(supplied, _API_KEY):
        raise HTTPException(status_code=401, detail="missing or invalid X-API-Key")


def _validated_proxy(proxy: Optional[str]) -> Optional[str]:
    # The proxy param routes our own AA fetches through a proxy of the
    # caller's choosing; restrict it to http(s) so it cannot smuggle
    # unexpected schemes into the HTTP client.
    if not proxy:
        return None
    text = proxy.strip()
    if not (text.startswith("http://") or text.startswith("https://")):
        raise HTTPException(status_code=400, detail="proxy must be an http:// or https:// URL")
    return text


router = APIRouter(dependencies=[Depends(_require_api_key)])
ms = ModelSummary()


@router.get("/api/model-summary/{model_slug:path}")
async def model_summary(
    model_slug: str,
    proxy: Optional[str] = Query(None, description="HTTP 代理，如 http://127.0.0.1:8014"),
    refresh: bool = Query(False, description="强制从 AA 实时拉取并更新缓存"),
):
    model_slug = model_slug.rstrip("/")
    proxy = _validated_proxy(proxy)
    result = await ms._get(model_slug, proxy, refresh)
    if "error" in result:
        status = 404 if "not found" in result.get("error", "") else 502
        return JSONResponse(status_code=status, content=result)
    return JSONResponse(content=result)


@router.get("/api/models")
async def list_models(
    proxy: Optional[str] = Query(None, description="HTTP 代理"),
    refresh: bool = Query(False, description="重新从 AA 拉取模型索引"),
):
    proxy = _validated_proxy(proxy)
    result = await ms._list_models(proxy, refresh)
    return JSONResponse(content=result)


@router.get("/api/search")
async def search_models(
    q: str = Query(..., description="搜索关键词，如 claude"),
    proxy: Optional[str] = Query(None, description="HTTP 代理"),
):
    proxy = _validated_proxy(proxy)
    result = await ms._search(q, proxy)
    return JSONResponse(content=result)
