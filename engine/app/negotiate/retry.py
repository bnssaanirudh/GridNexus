"""
engine/app/negotiate/retry.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Retry-with-error-correction loop + DQN fallback for LLM-driven negotiation.

Responsibility
--------------
1. Call an LLM callable (any ``Callable[[str], str]`` — real or mock).
2. Validate the output against ``OfferProposal``.
3. On failure, construct an error-correction prompt and retry up to
   ``MAX_RETRIES`` times.
4. If all retries are exhausted, fall back to the DQN wrapper's last
   known-good action and record a ``ReasoningDeficit`` entry in the
   in-process registry (which the /metrics route exposes and tests read).

The ``ReasoningDeficit`` dataclass mirrors the ``reasoning_deficits`` DB table
defined in broker/prisma/schema.prisma. Writing to the actual PostgreSQL table
is handled by the broker layer; the engine records to its in-process registry
so the /metrics route can expose the fallback rate without a DB round-trip.

Design decisions: see docs/ASSUMPTIONS.md §.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction
from app.negotiate.validation import OfferProposal, OfferValidationError, validate_offer

logger = logging.getLogger(__name__)

# ─── Configuration ─────────────────────────────────────────────────────────────

MAX_RETRIES: int = 3
"""Maximum number of LLM attempts before falling back to the DQN."""


# ─── In-process deficit registry ──────────────────────────────────────────────


@dataclass
class ReasoningDeficit:
    """
    Mirrors the ``reasoning_deficits`` Prisma model.

    Fields
    ------
    id                Unique event ID (UUID4).
    agent_id          Agent that triggered the deficit.
    negotiation_id    Negotiation session identifier.
    round             Round number within the session.
    raw_llm_output    The last raw string the LLM returned.
    validation_error  The final validation error message.
    fallback_used     True when the DQN fallback was invoked.
    timestamp         UTC timestamp of the event.
    """

    id: str
    agent_id: str
    negotiation_id: str
    round: int
    raw_llm_output: str
    validation_error: str
    fallback_used: bool
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class DeficitRegistry:
    """
    Thread-safe in-process store for ``ReasoningDeficit`` records.

    This is intentionally a simple list; the broker's PostgreSQL table is the
    durable store. The registry exists so the engine's /metrics route can serve
    fallback-rate data without a DB query, and so unit tests can inspect events
    without needing Postgres.
    """

    def __init__(self) -> None:
        self._deficits: list[ReasoningDeficit] = []

    def record(self, deficit: ReasoningDeficit) -> None:
        """Append a deficit record."""
        self._deficits.append(deficit)
        logger.warning(
            "reasoning_deficit_recorded",
            extra={
                "agent_id": deficit.agent_id,
                "negotiation_id": deficit.negotiation_id,
                "round": deficit.round,
                "fallback_used": deficit.fallback_used,
                "validation_error": deficit.validation_error,
            },
        )

    def all(self) -> list[ReasoningDeficit]:
        """Return all recorded deficits (newest last)."""
        return list(self._deficits)

    def fallback_count(self) -> int:
        """Number of events where the DQN fallback was used."""
        return sum(1 for d in self._deficits if d.fallback_used)

    def total_count(self) -> int:
        """Total number of deficit events (partial retries + full fallbacks)."""
        return len(self._deficits)

    def fallback_rate(self) -> float:
        """
        Ratio of fallback events to total LLM invocation rounds.

        Returns 0.0 when no rounds have been attempted.
        """
        total = self.total_count()
        return self.fallback_count() / total if total > 0 else 0.0

    def reset(self) -> None:
        """Clear all records. Used in tests to isolate state."""
        self._deficits.clear()


# Module-level singleton used by the /metrics route and the retry loop.
_registry: DeficitRegistry = DeficitRegistry()


def get_registry() -> DeficitRegistry:
    """Return the module-level ``DeficitRegistry`` singleton."""
    return _registry


# ─── Retry loop ───────────────────────────────────────────────────────────────


def _build_correction_prompt(
    original_prompt: str,
    raw_output: str,
    error_detail: str,
    attempt: int,
) -> str:
    """
    Construct an error-correction prompt to send back to the LLM.

    Parameters
    ----------
    original_prompt : str
        The original negotiation prompt.
    raw_output : str
        The LLM's malformed response.
    error_detail : str
        Human-readable description of what went wrong.
    attempt : int
        Which retry this is (1-indexed).
    """
    return (
        f"[Retry attempt {attempt}/{MAX_RETRIES}]\n\n"
        f"Your previous response was invalid. Here is what went wrong:\n"
        f"{error_detail}\n\n"
        f"Your invalid response was:\n{raw_output}\n\n"
        "Please correct the error and respond ONLY with a valid JSON object "
        "with these exact keys:\n"
        '  "action":        one of "ACCEPT", "COUNTER_OFFER", "WALK_AWAY"\n'
        '  "price_per_kwh": a positive number ≤ 1000\n'
        '  "requested_kwh": a positive number ≤ 10000\n'
        '  "rationale":     a short explanation string (optional)\n\n'
        f"Original task:\n{original_prompt}"
    )


def negotiate_with_retry(
    *,
    llm_call: Callable[[str], str],
    prompt: str,
    agent_id: str,
    negotiation_id: str,
    round_number: int,
    dqn_wrapper: DQNWrapper,
    dqn_state_dict: dict[str, Any],
    registry: DeficitRegistry | None = None,
) -> tuple[OfferProposal | None, NegotiationAction, bool, float, float]:
    """
    Call the LLM with up to ``MAX_RETRIES`` attempts, falling back to the DQN.

    Parameters
    ----------
    llm_call : Callable[[str], str]
        A callable that takes a prompt string and returns the LLM's raw response.
        Must be synchronous; wrap async callers with ``asyncio.run`` if needed.
    prompt : str
        The initial negotiation prompt.
    agent_id : str
        Identifier of the agent making the offer.
    negotiation_id : str
        Identifier of the negotiation session.
    round_number : int
        Current round of the session.
    dqn_wrapper : DQNWrapper
        The agent's DQN wrapper used for fallback action selection.
    dqn_state_dict : dict
        State dict passed to ``dqn_wrapper.encode_state`` for fallback action.
    registry : DeficitRegistry | None
        Override the module-level registry (useful in tests for isolation).

    Returns
    -------
    offer : OfferProposal | None
        The validated offer on success; ``None`` if all retries failed (fallback).
    action : NegotiationAction
        The DQN's fallback action (always returned; mirrors the offer's action
        on success so callers have a consistent type).
    fallback_used : bool
        ``True`` if the DQN fallback was invoked (either all retries failed or DQN overrode the valid LLM output).
    best_q : float
        Best Q-value according to DQN.
    llm_q : float
        Q-value of the LLM's selected action (or best_q if fallback).
    """
    reg = registry if registry is not None else _registry
    current_prompt = prompt
    last_raw: str = ""
    last_error: str = ""

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            raw = llm_call(current_prompt)
            last_raw = raw
            
            # Pass economic context so validate_offer can perform Step 3 checks
            offer = validate_offer(
                raw,
                capacity=dqn_state_dict.get("capacity"),
                cost=dqn_state_dict.get("cost"),
                current_offer_price=dqn_state_dict.get("offer_price"),
                current_requested_kwh=dqn_state_dict.get("offer_requested_kwh")
            )

            # Success — validate through DQN gate
            action_map: dict[str, NegotiationAction] = {
                "ACCEPT": NegotiationAction.ACCEPT,
                "COUNTER_OFFER": NegotiationAction.COUNTER_OFFER,
                "WALK_AWAY": NegotiationAction.WALK_AWAY,
            }
            llm_action = action_map[offer.action]
            
            # The DQN explicitly gates the LLM's action
            final_action, overridden, best_q, llm_q = dqn_wrapper.gate_llm_action(dqn_state_dict, llm_action)
            
            if overridden:
                from app import telemetry
                telemetry.dqn_override_total.inc()
                logger.warning("negotiate_offer_overridden", extra={"agent_id": agent_id, "negotiation_id": negotiation_id})
                
            logger.info(
                "negotiate_offer_accepted",
                extra={
                    "agent_id": agent_id,
                    "negotiation_id": negotiation_id,
                    "round": round_number,
                    "attempt": attempt,
                    "action": offer.action,
                    "overridden": overridden,
                },
            )
            return offer, final_action, overridden, best_q, llm_q

        except OfferValidationError as exc:
            from app import telemetry
            telemetry.llm_validation_failure_total.inc()
            if attempt < MAX_RETRIES:
                telemetry.llm_retry_total.inc()
                
            last_raw = exc.raw_output
            last_error = exc.error_detail
            logger.warning(
                "negotiate_offer_invalid",
                extra={
                    "agent_id": agent_id,
                    "negotiation_id": negotiation_id,
                    "round": round_number,
                    "attempt": attempt,
                    "error": last_error,
                },
            )

            if attempt < MAX_RETRIES:
                # Build correction prompt for the next attempt
                current_prompt = _build_correction_prompt(
                    original_prompt=prompt,
                    raw_output=last_raw,
                    error_detail=last_error,
                    attempt=attempt,
                )

    # ── All retries exhausted → DQN fallback ─────────────────────────────────
    logger.error(
        "negotiate_all_retries_failed_dqn_fallback",
        extra={
            "agent_id": agent_id,
            "negotiation_id": negotiation_id,
            "round": round_number,
            "last_error": last_error,
        },
    )

    state_tensor = dqn_wrapper.encode_state(dqn_state_dict)
    fallback_action = dqn_wrapper.select_action(state_tensor)

    # Compute Q values to log the fallback margin
    import torch
    with torch.no_grad():
        q_values = dqn_wrapper.q_network(state_tensor.unsqueeze(0)).squeeze(0)
        best_q = torch.max(q_values).item()

    deficit = ReasoningDeficit(
        id=str(uuid.uuid4()),
        agent_id=agent_id,
        negotiation_id=negotiation_id,
        round=round_number,
        raw_llm_output=last_raw,
        validation_error=last_error,
        fallback_used=True,
    )
    reg.record(deficit)
    
    from app import telemetry
    telemetry.dqn_fallback_total.inc()

    return None, fallback_action, True, best_q, best_q
