"""
engine/app/stability/separation_oracle.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Separation oracle for the Graph-Constrained Least-Core stability constraint-generation loop.

The oracle takes the current LP solution x* and a set of permissible
coalitions (from the planar-graph enumeration) and returns the
most-violated stability constraint, i.e. the deviating coalition T that
achieves the minimum slack:

    slack(T) = Σᵢ∈T xᵢ* − v(T)

where v(T) is the characteristic function of T.

See docs/research/TOPOLOGY_AWARE_SEPARATION_ORACLE.md for the full mathematical formulation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import networkx as nx

@dataclass(frozen=True)
class OracleResult:
    """Result of a single separation-oracle call."""
    most_violated_coalition: frozenset[Any] | None
    min_slack: float
    all_slacks: dict[frozenset[Any], float]


def separation_oracle(
    x_star: dict[Any, float],
    permissible: list[frozenset[Any]],
    char_fn: dict[frozenset[Any], float],
    epsilon: float = 1e-6,
) -> OracleResult:
    """Find the most-violated Graph-Constrained Least-Core stability constraint."""
    all_slacks: dict[frozenset[Any], float] = {}

    for T in permissible:
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
from app.stability.value_model import CoalitionValueModel, VPPValueModel, AdditiveValueModel

def build_characteristic_function(
    agents: list[Any],
    profiles: dict[Any, Any],
    permissible: list[frozenset[Any]],
    value_model: CoalitionValueModel | None = None,
) -> dict[frozenset[Any], float]:
    if value_model is None:
        is_legacy_surplus = any(isinstance(v, (int, float)) for v in profiles.values())
        if is_legacy_surplus or not profiles:
            value_model = AdditiveValueModel(surplus_map=profiles)
        else:
            value_model = VPPValueModel()
        
    result: dict[frozenset[Any], float] = {}
    for T in permissible:
        result[T] = value_model.evaluate(T, profiles)
    return result

def topology_aware_separation_oracle(
    x_star: dict[Any, float],
    graph: nx.Graph,
    profiles: dict[Any, Any],
    value_model: CoalitionValueModel,
    char_fn_cache: dict[frozenset[Any], float],
    epsilon: float = 1e-6,
    max_depth: int = 5,
    max_seeds: int = 10
) -> OracleResult:
    """
    Heuristic separation oracle using network topology to prune search.
    Expands greedily from nodes with highest individual deficit.
    """
    all_slacks: dict[frozenset[Any], float] = {}

    def get_v(T: frozenset[Any]) -> float:
        if T not in char_fn_cache:
            char_fn_cache[T] = value_model.evaluate(T, profiles)
        return char_fn_cache[T]

    # 1. Seed selection: Calculate individual slacks
    singletons = [(n, sum(x_star.get(i, 0.0) for i in [n]) - get_v(frozenset([n]))) for n in graph.nodes]
    # Sort ascending by slack (lowest slack = most unhappy)
    singletons.sort(key=lambda x: x[1])
    
    seeds = [n for n, s in singletons[:max_seeds]]
    
    # 2. Greedy Expansion
    for seed in seeds:
        current_T = frozenset([seed])
        current_slack = sum(x_star.get(i, 0.0) for i in current_T) - get_v(current_T)
        all_slacks[current_T] = current_slack
        
        for _ in range(max_depth):
            # Find neighbors of current_T
            neighbors = set()
            for node in current_T:
                for nbr in graph.neighbors(node):
                    if nbr not in current_T:
                        neighbors.add(nbr)
                        
            best_candidate = None
            best_gain = 0.0
            best_new_slack = current_slack
            best_new_T = current_T
            
            for nbr in neighbors:
                new_T = current_T | frozenset([nbr])
                new_slack = sum(x_star.get(i, 0.0) for i in new_T) - get_v(new_T)
                all_slacks[new_T] = new_slack
                gain = current_slack - new_slack
                
                if gain > best_gain:
                    best_gain = gain
                    best_candidate = nbr
                    best_new_slack = new_slack
                    best_new_T = new_T
                    
            if best_candidate is None:
                break # No improving neighbor found
                
            current_T = best_new_T
            current_slack = best_new_slack
            
    if not all_slacks:
        return OracleResult(
            most_violated_coalition=None,
            min_slack=float("inf"),
            all_slacks=all_slacks,
        )

    most_violated = min(all_slacks, key=lambda t: all_slacks[t])
    min_slack = all_slacks[most_violated]

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
