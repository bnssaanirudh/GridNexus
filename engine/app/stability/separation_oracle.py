"""
engine/app/stability/separation_oracle.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Separation oracle for the farsighted-stability constraint-generation loop.

The oracle takes the current LP solution x* and a set of permissible
coalitions (from 's planar-graph enumeration) and returns the
most-violated stability constraint, i.e. the deviating coalition T that
achieves the minimum slack:

    slack(T) = Σᵢ∈T xᵢ* − v(T)

where v(T) is the characteristic function of T.

See docs/stability_math.md for the full mathematical formulation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class OracleResult:
    """Result of a single separation-oracle call.

    Attributes
    ----------
    most_violated_coalition:
        The permissible deviating coalition T* with the smallest slack.
        ``None`` if no violated constraint exists (LP is stable).
    min_slack:
        The slack value of T*: positive means feasible, negative means violated.
    all_slacks:
        Dict mapping each checked coalition (as frozenset) to its slack.
        Included for diagnostics and test assertions.
    """

    most_violated_coalition: frozenset[Any] | None
    min_slack: float
    all_slacks: dict[frozenset[Any], float]


def separation_oracle(
    x_star: dict[Any, float],
    permissible: list[frozenset[Any]],
    char_fn: dict[frozenset[Any], float],
    epsilon: float = 1e-6,
) -> OracleResult:
    """Find the most-violated farsighted-stability constraint.

    For every permissible coalition T in ``permissible``, computes:

        slack(T) = Σᵢ∈T x_star[i] − char_fn[T]

    and returns the T with minimum slack.

    Parameters
    ----------
    x_star:
        Current LP solution: maps agent id → allocated payoff.
    permissible:
        List of permissible coalitions (frozensets) from the planar graph.
        Produced by ``permissible_coalitions(graph, k)``.
    char_fn:
        Characteristic function: maps frozenset(T) → v(T) (surplus of T).
    epsilon:
        Numerical tolerance: a constraint is considered violated only if
        slack < -epsilon.

    Returns
    -------
    OracleResult
        Contains the most-violated coalition (or None), its slack, and all slacks.
    """
    all_slacks: dict[frozenset[Any], float] = {}

    for T in permissible:
        # Σᵢ∈T xᵢ* − v(T)
        payoff_sum = sum(x_star.get(i, 0.0) for i in T)
        vT = char_fn.get(T, 0.0)
        all_slacks[T] = payoff_sum - vT

    if not all_slacks:
        return OracleResult(
            most_violated_coalition=None,
            min_slack=float("inf"),
            all_slacks=all_slacks,
        )

    most_violated = min(all_slacks, key=lambda t: all_slacks[t])
    min_slack = all_slacks[most_violated]

    # Only report as violated if below tolerance
    if min_slack >= -epsilon:
        return OracleResult(
            most_violated_coalition=None,
            min_slack=min_slack,
            all_slacks=all_slacks,
        )

    return OracleResult(
        most_violated_coalition=most_violated,
        min_slack=min_slack,
        all_slacks=all_slacks,
    )


from app.schemas.stability import AgentProfile
from app.stability.value_model import CoalitionValueModel, VPPValueModel

def build_characteristic_function(
    agents: list[Any],
    profiles: dict[Any, AgentProfile],
    permissible: list[frozenset[Any]],
    value_model: CoalitionValueModel | None = None,
) -> dict[frozenset[Any], float]:
    """Build the characteristic function v(T) for all permissible coalitions.

    Uses a non-additive CoalitionValueModel (e.g. VPPValueModel) to calculate
    surplus taking into account congestion, losses, and matching.

    Parameters
    ----------
    agents:
        List of agent IDs in the proposed coalition S.
    profiles:
        Maps agent id → AgentProfile (Seller/Buyer economics).
    permissible:
        List of permissible deviating coalitions to compute v for.
    value_model:
        An instance of CoalitionValueModel. Defaults to VPPValueModel if None.

    Returns
    -------
    dict
        Maps frozenset(T) → v(T) for all T in permissible.
    """
    if value_model is None:
        value_model = VPPValueModel()
        
    result: dict[frozenset[Any], float] = {}
    for T in permissible:
        result[T] = value_model.evaluate(T, profiles)
    return result
