"""
engine/app/negotiate/safety.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deterministic Safety Validator for Negotiation Outputs.

Provides a hard-constraint filter *before* the DQN preference evaluation.
"""

import logging
from typing import Any
from app.negotiate.validation import OfferProposal

logger = logging.getLogger(__name__)

class SafetyViolation(Exception):
    """Raised when an offer violates deterministic safety constraints."""
    pass

class SafetyValidator:
    """
    Applies deterministic physical and economic constraints to an LLM's offer.
    """
    
    @classmethod
    def validate(
        cls,
        offer: OfferProposal,
        capacity: float,
        cost: float,
        round_number: int,
    ) -> None:
        """
        Validates the offer against hard constraints.
        Raises SafetyViolation if constraints are violated.
        """
        if offer.requested_kwh > capacity:
            logger.error(f"Safety Violation: Offer requested {offer.requested_kwh} kWh but capacity is only {capacity} kWh.")
            raise SafetyViolation("Proposed energy exceeds available capacity.")
            
        if offer.action != "WALK_AWAY" and offer.price_per_kwh < cost:
            logger.error(f"Safety Violation: Offer price {offer.price_per_kwh} is below marginal cost {cost}.")
            raise SafetyViolation("Proposed price is below marginal cost.")
            
        if round_number > 10:
            # Enforce max rounds as a hard safety check as well
            raise SafetyViolation("Negotiation has exceeded maximum allowed rounds.")
