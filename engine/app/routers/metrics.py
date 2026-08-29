"""
engine/app/routers/metrics.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/metrics route — exposes fallback-rate and deficit counts.

Response format: both JSON (default) and Prometheus text (via ?format=prometheus).
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app import telemetry

router = APIRouter(prefix="/metrics", tags=["Metrics"])


class MetricsResponse(BaseModel):
    """JSON representation of current engine metrics."""

    llm_invocation_total: int
    llm_validation_failure_total: int
    llm_retry_total: int
    llm_provider_error_total: int
    dqn_fallback_total: int
    dqn_override_total: int
    negotiation_round_total: int
    fallback_rate: float


@router.get("", response_model=MetricsResponse)
async def get_metrics(request: Request) -> MetricsResponse | PlainTextResponse:
    """
    Return reasoning-deficit metrics.

    Query Parameters
    ----------------
    format : str, optional
        Pass ``?format=prometheus`` for Prometheus text format.
        Defaults to JSON.
    """
    # Optional Prometheus format
    fmt = request.query_params.get("format", "json")
    if fmt == "prometheus":
        return PlainTextResponse(telemetry.registry.export_prometheus())

    invocations = telemetry.llm_invocation_total.get()
    fallbacks = telemetry.dqn_fallback_total.get()
    rate = fallbacks / invocations if invocations > 0 else 0.0

    return MetricsResponse(
        llm_invocation_total=invocations,
        llm_validation_failure_total=telemetry.llm_validation_failure_total.get(),
        llm_retry_total=telemetry.llm_retry_total.get(),
        llm_provider_error_total=telemetry.llm_provider_error_total.get(),
        dqn_fallback_total=fallbacks,
        dqn_override_total=telemetry.dqn_override_total.get(),
        negotiation_round_total=telemetry.negotiation_round_total.get(),
        fallback_rate=rate,
    )
