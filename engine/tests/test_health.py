"""Tests for the /health endpoint of the GridNexus engine."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture()
def async_client() -> AsyncClient:
    """Create an async HTTP client bound to the FastAPI app."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_health_returns_200(async_client: AsyncClient) -> None:
    """GET /health should return 200 with {"status": "ok"}."""
    async with async_client as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_content_type(async_client: AsyncClient) -> None:
    """GET /health should return application/json content type."""
    async with async_client as client:
        response = await client.get("/health")
    assert "application/json" in response.headers["content-type"]
