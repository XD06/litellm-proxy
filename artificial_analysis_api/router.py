"""FastAPI router — 可挂载到已有项目"""
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from . import ModelSummary
router = APIRouter()
ms = ModelSummary()


@router.get("/api/model-summary/{model_slug:path}")
async def model_summary(
    model_slug: str,
    proxy: Optional[str] = Query(None, description="HTTP 代理，如 http://127.0.0.1:8014"),
    refresh: bool = Query(False, description="强制从 AA 实时拉取并更新缓存"),
):
    model_slug = model_slug.rstrip("/")
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
    result = await ms._list_models(proxy, refresh)
    return JSONResponse(content=result)


@router.get("/api/search")
async def search_models(
    q: str = Query(..., description="搜索关键词，如 claude"),
    proxy: Optional[str] = Query(None, description="HTTP 代理"),
):
    result = await ms._search(q, proxy)
    return JSONResponse(content=result)
