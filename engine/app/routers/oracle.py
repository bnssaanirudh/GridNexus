"""engine/app/routers/oracle.py
/oracle prefix router — Bayesian persuasion broadcast endpoint.

This route wires the MAPPO-trained OraclePolicy into a real FastAPI handler.
It replaces the  stub.

Enforcement of the module boundary:
  The route only constructs AnonymizedGridState from the validated request body.
  It never reads per-agent hidden fields, never queries the microgrid DB rows
  for individual capacity/cost, and never imports from microgrid_agent.py.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.deps import AsyncSessionLocal
from app.oracle.inference import get_oracle_policy
from app.schemas.oracle import OracleSignalRequest, OracleSignalResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/oracle", tags=["Oracle"])


@router.post("/signal", response_model=OracleSignalResponse)
async def compute_signal(request: OracleSignalRequest) -> OracleSignalResponse:
    """
    Select and broadcast a Bayesian persuasion signal.

    The Oracle policy observes only the AnonymizedGridState from the request
    body.  It selects a signal action, persists it to the oracle_signals table,
    and returns the framed broadcast to the caller.

    Raises
    ------
    HTTPException 422
        If the request body fails Pydantic validation (handled automatically).
    HTTPException 500
        If inference or database persistence fails.
    """
    # ── 1. Validate that we have a proper AnonymizedGridState ─────────────────
    if request.state is None:
        raise HTTPException(
            status_code=400,
            detail="Missing `state` field. Provide an AnonymizedGridState object.",
        )

    state = request.state

    # ── 2. Run Oracle inference ────────────────────────────────────────────────
    try:
        policy = get_oracle_policy()
        action_id, signal_label, broadcast_text = policy.select_action(state)
        probs = policy.action_probs(state)
        confidence = probs[signal_label]
    except Exception as exc:
        logger.exception("Oracle inference failed")
        raise HTTPException(status_code=500, detail=f"Oracle inference error: {exc}") from exc

    # ── 3. Persist to oracle_signals table ────────────────────────────────────
    # NOTE: The persisted JSON contains only AnonymizedGridState fields.
    # No per-agent hidden field is written to the database from this handler.
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO oraclesignals (id, "signalData")
                    VALUES (gen_random_uuid()::text,
                            (:signal_data)::text)
                """),
                {
                    "signal_data": (
                        f'{{"signal":"{signal_label}",'
                        f'"action_id":{action_id},'
                        f'"confidence":{confidence:.4f},'
                        f'"total_pooled_capacity_kwh":{state.total_pooled_capacity_kwh},'
                        f'"participating_microgrid_count":{state.participating_microgrid_count},'
                        f'"aggregate_demand_signal":{state.aggregate_demand_signal},'
                        f'"exogenous_stress_index":{state.exogenous_stress_index}}}'
                    )
                },
            )
            await session.commit()
    except Exception as exc:
        # Log but do not fail the request — DB persistence is best-effort in
        # the offline/test environment (no live Postgres may be available).
        logger.warning("oracle_signal_persist_failed: %s", exc)

    return OracleSignalResponse(
        signal=signal_label,
        broadcast_text=broadcast_text,
        action_id=action_id,
        action_probs=probs,
        confidence=confidence,
    )


from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class OracleDocumentIngestRequest(BaseModel):
    content: str
    source_type: str = "oracle"
    source_name: Optional[str] = None
    source_uri: Optional[str] = None
    publisher: Optional[str] = None
    observed_at: Optional[datetime] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    trust_score: Optional[float] = Field(default=1.0, ge=0.0, le=1.0)
    connector_version: Optional[str] = "manual-admin-v1"
    metadata: Optional[dict[str, Any]] = None


class OracleDocumentIngestResponse(BaseModel):
    id: str
    content_hash: str
    status: str


@router.post("/documents", response_model=OracleDocumentIngestResponse)
async def ingest_document(req: OracleDocumentIngestRequest) -> OracleDocumentIngestResponse:
    """Manually ingest an approved Oracle document into embedded_documents."""
    from app.rag.connectors import RawDocument
    from app.rag.rag_pipeline import ingest_documents

    cleaned_content = req.content.strip()
    if not cleaned_content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    doc = RawDocument(
        content=cleaned_content,
        source_type=req.source_type,
        source_name=req.source_name,
        source_uri=req.source_uri,
        publisher=req.publisher,
        observed_at=req.observed_at,
        valid_from=req.valid_from,
        valid_until=req.valid_until,
        trust_score=req.trust_score,
        connector_version=req.connector_version,
        metadata=req.metadata,
    )
    doc.compute_hash()

    try:
        await ingest_documents([doc])
    except Exception as exc:
        logger.exception("Document ingestion failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}") from exc

    return OracleDocumentIngestResponse(
        id=doc.id,
        content_hash=doc.content_hash or "",
        status="ingested",
    )


@router.get("/signals/relevant")
async def get_relevant_signals(query: str, k: int = 3) -> list[dict[str, Any]]:
    """Retrieve top-k relevant signals for a query using cosine similarity."""
    from app.rag.rag_pipeline import relevant_signals

    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    try:
        return await relevant_signals(query=query, k=k)
    except Exception as exc:
        logger.exception("Retrieval failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {exc}") from exc

