"""Tests for the RAG pipeline (embedding, ingestion, retrieval, caching).

All tests mock the database session and Redis so no live infrastructure is
required. The embedding model is loaded lazily via get_embedding_model(), so
pytest collection is fast and safe even in CI.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.rag.connectors import WeatherConnector, GridLoadConnector, RegulatoryConnector, RawDocument
from app.rag.cache import _cache, cached_with_ttl
from app.rag.rag_pipeline import (
    ingest_documents,
    relevant_signals,
    get_embedding_model,
    EMBEDDING_DIM,
)


# ---------------------------------------------------------
# Test 1: Embedding dimensionality & storage SQL shape
# ---------------------------------------------------------
@pytest.mark.asyncio
async def test_embedding_dimensionality_and_storage():
    """
    Verifies that sentence-transformers produce EMBEDDING_DIM (384) vectors
    and that ingest_documents correctly formats them for pgvector storage.
    """
    doc = RawDocument(source_type="weather", content="Just a normal day.")

    model = get_embedding_model()
    emb = model.encode([doc.content])[0]
    assert len(emb) == EMBEDDING_DIM, f"Expected {EMBEDDING_DIM}-d vector, got {len(emb)}"

    # Mock the database session
    mock_session = AsyncMock()
    mock_session_maker = MagicMock()
    mock_session_maker.__aenter__.return_value = mock_session

    with patch("app.rag.rag_pipeline.AsyncSessionLocal", return_value=mock_session_maker):
        await ingest_documents([doc])

        # Verify the raw SQL execution for storage
        assert mock_session.execute.call_count == 1
        call_args = mock_session.execute.call_args[0]
        sql_query = call_args[0].text
        params = call_args[1]

        # Verify pgvector syntax is used in the query
        assert "embedding::vector" in sql_query
        assert "INSERT INTO embedded_documents" in sql_query

        # Verify the vector was converted to the correct Postgres array string format
        assert params["id"] == doc.id
        assert isinstance(params["embedding"], str)
        assert params["embedding"].startswith("[") and params["embedding"].endswith("]")
        assert len(params["embedding"].split(",")) == EMBEDDING_DIM


# ---------------------------------------------------------
# Test 2: Storm scenario retrieval
# ---------------------------------------------------------
@pytest.mark.asyncio
async def test_retrieval_storm_scenario():
    """
    Scripted 'storm approaching' scenario. Injects a synthetic weather document
    alongside regulatory noise, asserting the storm document surfaces in top-3.
    """
    from scipy.spatial.distance import cosine

    storm_doc = RawDocument(
        source_type="weather",
        content="URGENT: Severe storm approaching from the coast.",
    )
    noise_docs = [
        RawDocument(source_type="regulatory", content="FERC Order 2222: Distributed Energy Resources..."),
        RawDocument(source_type="grid_load", content="Current ISO baseline demand: 45,000 MW."),
        RawDocument(source_type="regulatory", content="Noise ordinance: Microgrid generator sound levels..."),
    ]
    all_docs = [storm_doc] + noise_docs

    model = get_embedding_model()
    query_emb = model.encode("storm approach")
    doc_embs = model.encode([d.content for d in all_docs])

    # Calculate cosine distance manually (mirrors pgvector <=> behaviour)
    distances = [cosine(query_emb, doc_emb) for doc_emb in doc_embs]
    results = sorted(zip(all_docs, distances), key=lambda x: x[1])
    top_3 = results[:3]

    class MockRow:
        def __init__(self, d: RawDocument, dist: float) -> None:
            self.id = d.id
            self.sourceType = d.source_type
            self.content = d.content
            self.distance = dist

    mock_rows = [MockRow(doc, dist) for doc, dist in top_3]

    mock_result = MagicMock()
    mock_result.fetchall.return_value = mock_rows

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session_maker = MagicMock()
    mock_session_maker.__aenter__.return_value = mock_session

    with patch("app.rag.rag_pipeline.AsyncSessionLocal", return_value=mock_session_maker):
        signals = await relevant_signals("storm approach", k=3)

        top_ids = [s["id"] for s in signals]
        assert storm_doc.id in top_ids, "Storm document not found in top-3 results"
        assert signals[0]["id"] == storm_doc.id, "Storm document not ranked first"


# ---------------------------------------------------------
# Test 3: TTL cache hit rate
# ---------------------------------------------------------
@pytest.mark.asyncio
async def test_cache_hit_rate():
    """
    Issues the same query 10 times and asserts the cache hit rate >= 70%.
    Redis is replaced with an in-memory dict to avoid infrastructure deps.
    """
    mock_external_api = AsyncMock(return_value=[RawDocument(source_type="test", content="data")])

    @cached_with_ttl(source_type="test_source", ttl_seconds=60)
    async def fetch_data(query: str):
        return await mock_external_api(query)

    in_memory_cache: dict = {}

    async def mock_get(key: str):
        return in_memory_cache.get(key)

    async def mock_set(key: str, value, ttl: int):
        in_memory_cache[key] = value

    with (
        patch.object(_cache, "get", side_effect=mock_get),
        patch.object(_cache, "set", side_effect=mock_set),
    ):
        for _ in range(10):
            await fetch_data(query="same_query")

        # External API called exactly once; 9 of 10 hits served from cache → 90%
        assert mock_external_api.call_count == 1
        hit_rate = (10 - mock_external_api.call_count) / 10.0
        assert hit_rate >= 0.70
