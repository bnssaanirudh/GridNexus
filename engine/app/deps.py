import os

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./gridnexus.db")
# If postgresql:// is passed without asyncpg (e.g. from broker .env), replace it
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# For SQLite, we don't want echo, but we also don't need pool sizes that conflict with aiosqlite
engine_kwargs = {"echo": False}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(DATABASE_URL, **engine_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def check_db_health():
    try:
        async with engine.begin() as conn:
            from sqlalchemy import text
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        import structlog
        logger = structlog.get_logger()
        logger.error("db_health_check_failed", error=str(e))
        return False

async def check_redis_health():
    try:
        r = redis.from_url(REDIS_URL)
        await r.ping()
        await r.aclose()
        return True
    except Exception as e:
        import structlog
        logger = structlog.get_logger()
        logger.error("redis_health_check_failed", error=str(e))
        return False
