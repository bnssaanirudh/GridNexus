"""
engine/app/agents/microgrid_agent.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MicrogridAgent wrapping a LangChain agent.

This class explicitly models a self-interested prosumer. It keeps
the battery capacity and baseline generation cost private using the
custom SecretFloat, ensuring these fields structurally cannot leak
into public API responses.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.secret_field import SecretFloat


class MicrogridAgent(BaseModel):
    """A self-interested prosumer agent wrapper."""

    agent_id: str
    battery_capacity_kwh: SecretFloat
    baseline_generation_cost: SecretFloat
    negotiation_history: list[str] = Field(default_factory=list)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def utility(self, offer: dict[str, float]) -> float:
        """Compute the agent's utility for a given trade offer.

        Formula:
        If the grid requests more power than the battery capacity, the agent
        cannot fulfill it and receives a utility of -inf.
        Otherwise, utility = (price_per_kwh - baseline_generation_cost) * requested_kwh.

        Args:
            offer: A dictionary containing 'price_per_kwh' and 'requested_kwh'.
                   'requested_kwh' represents the power the grid wants the agent to supply.

        Returns:
            Computed utility as a float.
        """
        price = offer.get("price_per_kwh", 0.0)
        requested = offer.get("requested_kwh", 0.0)
        
        capacity = self.battery_capacity_kwh.get_secret_value()
        cost = self.baseline_generation_cost.get_secret_value()

        if requested > capacity:
            return float("-inf")
            
        return (price - cost) * requested

    # We keep the agent class to encapsulate private secrets used in tests.
    # The actual negotiation logic has been moved to the Orchestrator Pipeline (LLM + DQN).
