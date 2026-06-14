"""独立启动入口: python -m uvicorn main:app"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from artificial_analysis_api.router import router

app = FastAPI(title="Artificial Analysis Model Summary API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
