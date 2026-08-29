"""
engine/app/stability/value_model.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coalition Value Models for Virtual Power Plants.

Two models are provided:

  AdditiveValueModel  — Additive characteristic function (sum of individual
                         surpluses). Used ONLY as a baseline/test fixture.
                         Additive TU games always have a non-empty core
                         (when IR constraints are met), so they are not
                         meaningful stability tests on their own.

  VPPValueModel       — Non-additive, physically informed model (research default).
                         Captures buyer-seller matching, congestion penalties,
                         and portfolio diversity bonuses.
"""

from abc import ABC, abstractmethod
from typing import Any
from app.schemas.stability import AgentProfile, SellerProfile, BuyerProfile


class CoalitionValueModel(ABC):
    @abstractmethod
    def evaluate(self, coalition: frozenset[Any], profiles: dict[Any, AgentProfile]) -> float:
        """Computes the characteristic function v(C)."""
        pass

    @property
    def version(self) -> str:
        return "1.0"


class AdditiveValueModel(CoalitionValueModel):
    """
    BASELINE ONLY — Additive characteristic function.

    v(S) = Σᵢ∈S surplus_map[i]

    This is provided strictly as a test fixture and research baseline.
    Additive TU games always satisfy the core non-emptiness condition when
    individual rationality bounds are at most the individual surpluses, so
    they should never be used to claim non-trivial stability results.

    Parameters
    ----------
    surplus_map:
        Maps agent id → individual surplus value.
        Agents not in the map default to 1.0.
    default_surplus:
        Fallback value for agents missing from surplus_map. Default: 1.0.
    """

    def __init__(
        self,
        surplus_map: dict[Any, float] | None = None,
        default_surplus: float = 1.0,
    ) -> None:
        self._surplus_map: dict[Any, float] = surplus_map or {}
        self._default_surplus = default_surplus

    def evaluate(self, coalition: frozenset[Any], profiles: dict[Any, AgentProfile]) -> float:
        if not coalition:
            return 0.0
        return sum(
            self._surplus_map.get(agent, self._default_surplus)
            for agent in coalition
        )

    @property
    def version(self) -> str:
        return "additive-1.0"


class VPPValueModel(CoalitionValueModel):
    """
    Research-grade non-additive coalition value model for Virtual Power Plants.

    Value components:
    - Base Trade Value: Economic surplus from matching buyers to sellers via
      merit-order dispatch (cheapest sellers, highest-value buyers first).
    - Diversity Benefit: Super-additive bonus for pooling multiple flexible assets
      (each additional seller adds reliability value to the VPP).
    - Congestion Penalty: Sub-additive penalty when internal trade volume exceeds
      the coalition's internal network capacity threshold.

    Parameters
    ----------
    congestion_threshold:
        Maximum kWh that can be traded internally without congestion (default: 100 kWh).
    congestion_penalty_rate:
        Penalty per kWh of congestion (default: 0.5 $/kWh).
    diversity_bonus_per_seller:
        Super-additive bonus per additional seller beyond the first (default: 2.0 $).
    """

    def __init__(
        self,
        congestion_threshold: float = 100.0,
        congestion_penalty_rate: float = 0.5,
        diversity_bonus_per_seller: float = 2.0,
    ) -> None:
        self.congestion_threshold = congestion_threshold
        self.congestion_penalty_rate = congestion_penalty_rate
        self.diversity_bonus_per_seller = diversity_bonus_per_seller

    def evaluate(self, coalition: frozenset[Any], profiles: dict[Any, AgentProfile]) -> float:
        if not coalition:
            return 0.0

        sellers = []
        buyers = []

        for agent_id in coalition:
            profile = profiles.get(agent_id)
            if isinstance(profile, SellerProfile):
                sellers.append(profile)
            elif isinstance(profile, BuyerProfile):
                buyers.append(profile)
            else:
                # Default to a mock seller if not provided — only for structural
                # graph tests. Research experiments must provide real profiles.
                sellers.append(SellerProfile(generation_cost=5.0, available_capacity=10.0))

        total_capacity = sum(s.available_capacity for s in sellers)
        total_demand = sum(b.demand for b in buyers)

        # Energy matched inside the coalition
        matched_energy = min(total_capacity, total_demand)

        # Merit-order dispatch: cheapest generators, highest-value buyers first
        sellers_sorted = sorted(
            sellers,
            key=lambda s: s.generation_cost + s.degradation_cost + s.opportunity_cost,
        )
        buyers_sorted = sorted(buyers, key=lambda b: b.energy_value, reverse=True)

        surplus = 0.0
        remaining_energy = matched_energy

        # Accumulate buyer value
        for b in buyers_sorted:
            if remaining_energy <= 0:
                break
            allocation = min(b.demand, remaining_energy)
            surplus += allocation * b.energy_value
            remaining_energy -= allocation

        # Subtract seller costs
        remaining_energy = matched_energy
        for s in sellers_sorted:
            if remaining_energy <= 0:
                break
            allocation = min(s.available_capacity, remaining_energy)
            cost = s.generation_cost + s.degradation_cost + s.opportunity_cost
            surplus -= allocation * cost
            remaining_energy -= allocation

        # Diversity benefit (super-additive)
        if len(sellers) > 1:
            surplus += (len(sellers) - 1) * self.diversity_bonus_per_seller

        # Congestion penalty (sub-additive)
        if matched_energy > self.congestion_threshold:
            excess = matched_energy - self.congestion_threshold
            surplus -= excess * self.congestion_penalty_rate

        # Base fallback for purely synthetic structural tests where no demand/capacity is given.
        # This is explicitly documented as a test-only path; research experiments must
        # have real profiles that produce non-zero matched_energy.
        if matched_energy == 0 and surplus == 0:
            surplus = sum(
                profiles[a].outside_option for a in coalition if a in profiles
            )

        return surplus

    @property
    def version(self) -> str:
        return "vpp-1.0"
