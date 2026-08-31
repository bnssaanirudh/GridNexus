from fastapi import FastAPI, Response
from pydantic import BaseModel
import os

from app.deps import check_db_health, check_redis_health
from app.logging_middleware import RequestIdMiddleware, logger
from app.routers import agents, auth, data_sources, grid, metrics, negotiate, oracle, qre, stability

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="GridNexus Layer 1 - Engine",
    description="Mathematical & AI core for Virtual Power Plants",
    version="0.1.0"
)

# ---------------------------------------------------------------------------
# CORS — controlled via CORS_ORIGINS env var (comma-separated list of origins).
# Empty or absent → no cross-origin access (production default).
# Example: CORS_ORIGINS="https://app.example.com,https://admin.example.com"
# ---------------------------------------------------------------------------
_raw_origins = os.environ.get("CORS_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,   # empty list = deny all cross-origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request ID middleware and structlog
app.add_middleware(RequestIdMiddleware)

app.include_router(agents.router)
app.include_router(negotiate.router)
app.include_router(stability.router)
app.include_router(oracle.router)
app.include_router(qre.router)
app.include_router(metrics.router)
app.include_router(grid.router)
app.include_router(auth.router)
app.include_router(data_sources.router)

class HealthResponse(BaseModel):
    status: str

class ReadyResponse(BaseModel):
    status: str
    db: str
    redis: str

@app.get("/health", response_model=HealthResponse)
async def health_check():
    logger.info("health_check_called")
    return HealthResponse(status="ok")

@app.get("/ready", response_model=ReadyResponse)
async def ready_check(response: Response):
    logger.info("ready_check_called")
    db_ok = await check_db_health()
    redis_ok = await check_redis_health()

    status_code = 200 if db_ok and redis_ok else 503
    response.status_code = status_code

    return ReadyResponse(
        status="ok" if status_code == 200 else "error",
        db="up" if db_ok else "down",
        redis="up" if redis_ok else "down"
    )
