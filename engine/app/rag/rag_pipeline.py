"""RAG pipeline: embedding, ingestion, and retrieval for exogenous signals.

Uses sentence-transformers (all-MiniLM-L6-v2) to produce 384-d vectors and
stores/queries them in PostgreSQL via the pgvector extension.

Design note: The embedding model is lazy-loaded on first use so that importing
this module during test collection does not trigger a model download or any
heavy I/O, keeping pytest startup fast.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List

from sqlalchemy import text

from app.deps import AsyncSessionLocal
from app.rag.connectors import RawDocument

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Lazy model loader
# ---------------------------------------------------------------------------
_embedding_model: "SentenceTransformer | None" = None

_EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
_EMBEDDING_MODEL_VERSION = "1.1.0"
EMBEDDING_DIM = 384


def get_embedding_model() -> "SentenceTransformer":
    """Return the singleton SentenceTransformer, loading it on first call."""
    global _embedding_model
    if _embedding_model is None:
        import os
        from sentence_transformers import SentenceTransformer  # noqa: PLC0415
        # Ensure we only load from local cache if pre-bundled, prevent runtime downloads if configured
        local_only = os.getenv("RAG_LOCAL_MODELS_ONLY", "false").lower() == "true"
        _embedding_model = SentenceTransformer(_EMBEDDING_MODEL_NAME, local_files_only=local_only)
    return _embedding_model


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

async def ingest_documents(docs: List[RawDocument]) -> None:
    """
    Embed a batch of RawDocuments and persist them to `embedded_documents`.

    Args:
        docs: List of RawDocument instances to embed and store.
    """
    if not docs:
        return

    model = get_embedding_model()
    texts = [doc.content for doc in docs]
    embeddings = model.encode(texts)

    async with AsyncSessionLocal() as session:
        for doc, emb in zip(docs, embeddings):
            # deduplication by contentHash
            if doc.content_hash:
                check_query = text('SELECT id FROM embedded_documents WHERE "contentHash" = :h LIMIT 1')
                res = await session.execute(check_query, {"h": doc.content_hash})
                if res.fetchone():
                    continue

            # pgvector expects the vector as a bracketed comma-separated string
            vector_str = "[" + ",".join(map(str, emb.tolist())) + "]"
            
            import json

            query = text("""
                INSERT INTO embedded_documents (
                    id, "sourceType", "sourceName", "sourceUri", "publisher", 
                    content, "contentHash", "observedAt", "validFrom", "validUntil",
                    "trustScore", "connectorVersion", "embeddingModel", "embeddingModelVersion",
                    "embeddingDimension", metadata, embedding, "ingestedAt"
                )
                VALUES (
                    :id, :source_type, :source_name, :source_uri, :publisher,
                    :content, :content_hash, :observed_at, :valid_from, :valid_until,
                    :trust_score, :connector_version, :embedding_model, :embedding_model_version,
                    :embedding_dim, :metadata, :embedding::vector, :ingested_at
                )
            """)
            await session.execute(
                query,
                {
                    "id": doc.id,
                    "source_type": doc.source_type,
                    "source_name": getattr(doc, "source_name", None),
                    "source_uri": getattr(doc, "source_uri", None),
                    "publisher": getattr(doc, "publisher", None),
                    "content": doc.content,
                    "content_hash": getattr(doc, "content_hash", None),
                    "observed_at": getattr(doc, "observed_at", None),
                    "valid_from": getattr(doc, "valid_from", None),
                    "valid_until": getattr(doc, "valid_until", None),
                    "trust_score": getattr(doc, "trust_score", None),
                    "connector_version": getattr(doc, "connector_version", None),
                    "embedding_model": _EMBEDDING_MODEL_NAME,
                    "embedding_model_version": _EMBEDDING_MODEL_VERSION,
                    "embedding_dim": EMBEDDING_DIM,
                    "metadata": json.dumps(doc.metadata) if getattr(doc, "metadata", None) else None,
                    "embedding": vector_str,
                    "ingested_at": doc.ingested_at,
                },
            )
        await session.commit()


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

async def relevant_signals(query: str, k: int = 3) -> List[Dict[str, Any]]:
    """
    Retrieve the top-k most relevant exogenous signals for a query string using
    cosine similarity (pgvector <=> operator) against stored embeddings.

    Args:
        query: Natural-language query string.
        k:     Number of results to return (default 3).

    Returns:
        List of dicts with keys: id, source_type, content, distance.
    """
    model = get_embedding_model()
    query_emb = model.encode(query)
    vector_str = "[" + ",".join(map(str, query_emb.tolist())) + "]"

    async with AsyncSessionLocal() as session:
        sql = text("""
            SELECT id, "sourceType", "sourceName", content, "trustScore", "ingestedAt",
                   (embedding <=> :query_vector::vector) AS distance
            FROM embedded_documents
            WHERE ("validUntil" IS NULL OR "validUntil" > NOW())
            ORDER BY distance ASC, "trustScore" DESC NULLS LAST
            LIMIT :limit
        """)

        result = await session.execute(sql, {"query_vector": vector_str, "limit": k * 2})
        rows = result.fetchall()
        
        # In-memory deduplication of similar content if needed, but db deduplication handles exact matches
        final_docs = []
        for row in rows:
            final_docs.append({
                "id": row.id,
                "source_type": getattr(row, "sourceType", ""),
                "source_name": getattr(row, "sourceName", ""),
                "trust_score": float(getattr(row, "trustScore", 0) or 0),
                "content": row.content,
                "distance": float(row.distance),
            })
            if len(final_docs) >= k:
                break
                
        # Audit record
        if final_docs:
            audit_sql = text("""
                INSERT INTO retrieved_context_audits (id, query, "documentIds", "similarityScore", ranking, "modelVersion", timestamp)
                VALUES (gen_random_uuid(), :query, :doc_ids, :score, :ranking, :model_version, NOW())
            """)
            await session.execute(audit_sql, {
                "query": query,
                "doc_ids": [d["id"] for d in final_docs],
                "score": final_docs[0]["distance"],
                "ranking": 1,
                "model_version": _EMBEDDING_MODEL_VERSION
            })
            await session.commit()

        return final_docs
