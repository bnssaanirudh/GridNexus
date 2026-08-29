"""engine/app/schemas/oracle.py
Pydantic request/response models for the /oracle/signal route.
"""

from pydantic import BaseModel, Field

from app.oracle.anonymized_state import AnonymizedGridState


class OracleSignalRequest(BaseModel):
    """Request body for POST /oracle/signal.

    The client provides an AnonymizedGridState; no per-agent identifiers or
    hidden fields (battery_capacity, generation_cost) are accepted.
    """

    state: AnonymizedGridState = Field(
        ...,
        description="Anonymized aggregate coalition state (no hidden agent fields).",
    )

    # Legacy field kept for backwards-compat with any existing callers that
    # pass state_vector directly.  When present, it is ignored in favour of
    # `state`.  Callers should migrate to the `state` field.
    state_vector: list[float] | None = Field(
        default=None,
        description="[DEPRECATED] Raw float state vector; use `state` instead.",
    )


class OracleSignalResponse(BaseModel):
    """Response body for POST /oracle/signal."""

    signal: str = Field(
        ...,
        description="Machine-readable signal label chosen by the Oracle policy.",
    )
    broadcast_text: str = Field(
        ...,
        description="Human-readable framed message for coalition broadcast.",
    )
    action_id: int = Field(
        ...,
        description="Integer action index selected by the Oracle actor.",
    )
    action_probs: dict[str, float] = Field(
        ...,
        description="Probability distribution over all Oracle actions.",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Probability mass on the chosen action (softmax confidence).",
    )
