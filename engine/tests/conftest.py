import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from app.models import Base
from app.deps import engine

@pytest.fixture(autouse=True, scope="session")
async def setup_test_db():
    # Setup test DB tables for all tests
    # Using the async engine from app.deps
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
