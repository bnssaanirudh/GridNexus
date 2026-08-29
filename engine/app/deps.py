import os

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://gridnexus:gridnexus_dev@localhost:5432/gridnexus")
# If postgresql:// is passed without asyncpg (e.g. from broker .env), replace it
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

engine = create_async_engine(DATABASE_URL, echo=False)
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
