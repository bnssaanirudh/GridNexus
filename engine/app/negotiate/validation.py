"""
engine/app/negotiate/validation.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Strict Pydantic schema for an LLM-proposed negotiation offer, plus a
validation function that raises a ``ValidationError`` (with a human-readable
error message suitable for passing straight back to the LLM as an
error-correction prompt) whenever the output is malformed or economically
nonsensical.

Design decisions (docs/ASSUMPTIONS.md §):
- ``OfferProposal`` is the single source of truth for what the LLM must
  return. It is kept intentionally narrow so the retry prompt is precise.
- Grid-limit constants (MAX_KWH, MAX_PRICE_PER_KWH) are module-level
  values; production code should load them from configuration / environment.
- ``validate_offer`` returns a clean ``OfferProposal`` on success so callers
  never touch the raw dict directly.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

# ─── Grid-level constants ─────────────────────────────────────────────────────

MAX_KWH: float = 10_000.0
"""Maximum kWh a single agent can offer in one round."""

MAX_PRICE_PER_KWH: float = 1_000.0
"""Upper bound on price per kWh (sanity cap, not a market ceiling)."""

MIN_PRICE_PER_KWH: float = 0.0
"""Floor: price cannot be negative."""


# ─── Schema ───────────────────────────────────────────────────────────────────


class OfferProposal(BaseModel):
    """
    Strict schema for a single LLM-proposed negotiation offer.

    All fields are required; extra keys are forbidden so the LLM cannot
    silently embed garbage in unknown fields.
    """

    action: str = Field(
        ...,
        description="One of: ACCEPT, COUNTER_OFFER, WALK_AWAY",
    )
    price_per_kwh: float = Field(
        ...,
        description="Offered price per kWh. Must be ≥ 0 and ≤ MAX_PRICE_PER_KWH.",
        allow_inf_nan=False
    )
    requested_kwh: float = Field(
        ...,
        description="Energy volume offered / requested. Must be > 0 and ≤ MAX_KWH.",
        allow_inf_nan=False
    )
    rationale: str = Field(
        "",
        description="Optional free-text explanation from the LLM (not validated).",
        max_length=500
    )

    model_config = {"extra": "forbid"}

    # ── Field-level validators ────────────────────────────────────────────────

    @field_validator("action")
    @classmethod
    def action_must_be_valid(cls, v: str) -> str:
        allowed = {"ACCEPT", "COUNTER_OFFER", "WALK_AWAY"}
        if v not in allowed:
            raise ValueError(
                f"'action' must be one of {sorted(allowed)}, got {v!r}."
            )
        return v

    @field_validator("price_per_kwh")
    @classmethod
    def price_non_negative(cls, v: float) -> float:
        if v < MIN_PRICE_PER_KWH:
            raise ValueError(
                f"'price_per_kwh' must be ≥ {MIN_PRICE_PER_KWH}, got {v}."
            )
        if v > MAX_PRICE_PER_KWH:
            raise ValueError(
                f"'price_per_kwh' must be ≤ {MAX_PRICE_PER_KWH}, got {v}."
            )
        return v

    @field_validator("requested_kwh")
    @classmethod
    def kwh_within_grid_limits(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(
                f"'requested_kwh' must be > 0, got {v}."
            )
        if v > MAX_KWH:
            raise ValueError(
                f"'requested_kwh' must be ≤ {MAX_KWH} (grid limit), got {v}."
            )
        return v

    # ── Cross-field validator ─────────────────────────────────────────────────

    @model_validator(mode="after")
    def counter_offer_requires_nonzero_price(self) -> "OfferProposal":
        """
        A COUNTER_OFFER with a zero price is economically nonsensical —
        it would mean the agent is offering to give energy away for free.
        """
        if self.action == "COUNTER_OFFER" and self.price_per_kwh == 0.0:
            raise ValueError(
                "'price_per_kwh' must be > 0 when action is COUNTER_OFFER; "
                "a zero-price counter-offer is economically invalid."
            )
        return self


# ─── Validation function ──────────────────────────────────────────────────────


class OfferValidationError(Exception):
    """
    Raised by ``validate_offer`` when the LLM output is malformed or
    economically nonsensical.

    Attributes
    ----------
    raw_output : str
        The original string the LLM returned.
    error_detail : str
        Human-readable explanation suitable for an error-correction prompt.
    """

    def __init__(self, raw_output: str, error_detail: str) -> None:
        self.raw_output = raw_output
        self.error_detail = error_detail
        super().__init__(error_detail)


def validate_offer(
    raw_output: str,
    capacity: float | None = None,
    cost: float | None = None,
    current_offer_price: float | None = None,
    current_requested_kwh: float | None = None
) -> OfferProposal:
    """
    Parse and validate a raw LLM string as an ``OfferProposal``.

    Steps
    -----
    1. Attempt JSON parse → ``OfferValidationError`` on syntax error.
    2. Validate against ``OfferProposal`` schema → ``OfferValidationError``
       with field-level detail on constraint violations.
    3. Perform economic semantic checks (capacity, reservation price).

    Parameters
    ----------
    raw_output : str
        The raw string returned by the LLM.

    Returns
    -------
    OfferProposal
        A validated, clean offer ready for use by the negotiation engine.

    Raises
    ------
    OfferValidationError
        If parsing or validation fails for any reason.
    """
    # ── Step 1: JSON parse ───────────────────────────────────────────────────
    try:
        data: Any = json.loads(raw_output)
    except json.JSONDecodeError as exc:
        raise OfferValidationError(
            raw_output=raw_output,
            error_detail=(
                f"Your response is not valid JSON. JSON parse error: {exc.msg} "
                f"at line {exc.lineno}, column {exc.colno}. "
                "Please return a single valid JSON object with keys: "
                "action, price_per_kwh, requested_kwh, rationale."
            ),
        ) from exc

    if not isinstance(data, dict):
        raise OfferValidationError(
            raw_output=raw_output,
            error_detail=(
                "Your response must be a JSON object (dict), "
                f"but you returned a {type(data).__name__}."
            ),
        )

    # ── Step 2: Pydantic validation ──────────────────────────────────────────
    from pydantic import ValidationError as PydanticValidationError

    try:
        proposal = OfferProposal(**data)
    except PydanticValidationError as exc:
        # Flatten all errors into a readable list
        messages = "; ".join(
            f"{' → '.join(str(l) for l in e['loc'])}: {e['msg']}"
            for e in exc.errors()
        )
        raise OfferValidationError(
            raw_output=raw_output,
            error_detail=(
                f"Offer validation failed with {exc.error_count()} error(s): "
                f"{messages}. Please fix these issues and return the corrected JSON."
            ),
        ) from exc

    # ── Step 3: Economic semantic checks ─────────────────────────────────────
    if proposal.action == "ACCEPT":
        if current_offer_price is None or current_requested_kwh is None:
            raise OfferValidationError(
                raw_output=raw_output,
                error_detail="You cannot ACCEPT when there is no current offer to accept."
            )
        if proposal.price_per_kwh != current_offer_price or proposal.requested_kwh != current_requested_kwh:
            raise OfferValidationError(
                raw_output=raw_output,
                error_detail=(
                    "If action is ACCEPT, price_per_kwh and requested_kwh must match the "
                    f"opponent's offer exactly ({current_offer_price} at {current_requested_kwh} kWh)."
                )
            )

    from app.negotiate.safety import SafetyValidator, SafetyViolation
    try:
        SafetyValidator.validate(
            offer=proposal,
            capacity=capacity if capacity is not None else float("inf"),
            cost=cost if cost is not None else 0.0,
            round_number=1, # We can pass round_number in retry later, but for now we just skip round validation here
        )
    except SafetyViolation as e:
        raise OfferValidationError(
            raw_output=raw_output,
            error_detail=str(e)
        )

    return proposal
