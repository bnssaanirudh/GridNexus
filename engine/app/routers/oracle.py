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
