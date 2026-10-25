"""独立启动入口: python -m uvicorn main:app

Hardening defaults: loopback-only bind, no CORS, no /docs exposure. This
service can trigger outbound fetches (index refresh, per-model scrape), so
exposing it unauthenticated on a public interface turns it into an SSRF
surface. Opt in explicitly via environment variables when you need more:

    AA_HOST=0.0.0.0          bind address (default 127.0.0.1)
    AA_PORT=8000             bind port
    AA_API_KEY=secret        require X-API-Key on every endpoint (strongly
                             recommended whenever AA_HOST is not loopback)
    AA_CORS_ORIGINS=a,b      comma-separated allowed origins (default: none)
    AA_DOCS=1                enable /docs and /openapi.json (default: off)
"""
import os

from fastapi import FastAPI

from artificial_analysis_api.router import router

_docs = os.environ.get("AA_DOCS") == "1"
app = FastAPI(
    title="Artificial Analysis Model Summary API",
    docs_url="/docs" if _docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if _docs else None,
)
_cors = [origin.strip() for origin in os.environ.get("AA_CORS_ORIGINS", "").split(",") if origin.strip()]
if _cors:
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(CORSMiddleware, allow_origins=_cors, allow_methods=["GET"], allow_headers=["X-API-Key"])
app.include_router(router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("AA_HOST", "127.0.0.1"),
        port=int(os.environ.get("AA_PORT", "8000")),
        reload=False,
    )
