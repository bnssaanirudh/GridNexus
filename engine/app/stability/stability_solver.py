"""
engine/app/stability/stability_solver.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Core stability and Least-Core solver using constraint generation.

Algorithm summary
─────────────────
1.  Enumerate all permissible deviating coalitions T ⊆ S.
2.  Build the characteristic function v(T) using CoalitionValueModel.
3.  Iteratively:
    a.  Solve the Least-Core LP.
    b.  Call the separation oracle to find the most-violated constraint.
    c.  If a violation exists (slack < -ε), add that constraint and repeat.
    d.  If no violation exists, the coalition is STABLE (or we found least-core).
4.  Return StabilityResult.

Least-Core LP formulation
──────────────
Variables:  x ∈ ℝⁿ (payoffs), ε ∈ ℝ (core relaxation)

Minimise:   ε

Subject to:
  Σᵢ xᵢ  = v(S)           [efficiency]
  xᵢ     ≥ out_i   ∀ i    [individual rationality]
  Σᵢ∈T xᵢ + ε ≥ v(T) ∀ active T  [stability]
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import networkx as nx
import numpy as np
from scipy.optimize import linprog

from app.graph.planar_graph import permissible_coalitions
from app.stability.separation_oracle import (
    OracleResult,
    build_characteristic_function,
    separation_oracle,
)
from app.stability.value_model import CoalitionValueModel, VPPValueModel
from app.schemas.stability import AgentProfile

MAX_ITER_DEFAULT: int = 100
EPSILON: float = 1e-6

@dataclass
class BindingConstraint:
    coalition: list[Any]
    slack: float

@dataclass
class StabilityResult:
    status: str
    margin: float
    epsilon_star: float = 0.0
    allocation: dict[Any, float] = field(default_factory=dict)
    outside_options: dict[Any, float] = field(default_factory=dict)
    binding_constraints: list[BindingConstraint] = field(default_factory=list)
    deviating_coalition: list[Any] | None = None
    rounds: int = 0
    converged: bool = True
    solve_time_ms: float = 0.0


def verify_stability(
    coalition: list[Any],
    graph: nx.Graph,
    profiles: dict[Any, AgentProfile] | None = None,
    value_model: CoalitionValueModel | None = None,
    max_iter: int = MAX_ITER_DEFAULT,
    max_deviation_size: int | None = None,
    surplus_map: dict[Any, float] | None = None,
) -> StabilityResult:
    """Check core stability of a coalition using Least-Core LP."""
    t_start = time.perf_counter()

    if len(coalition) == 0:
        raise ValueError("Coalition must be non-empty")

    # By-pass removed to allow topology aware oracle to handle N > 50
        
    profiles = profiles or {}
    
    if surplus_map is not None:
        from app.stability.value_model import AdditiveValueModel
        value_model = AdditiveValueModel(surplus_map=surplus_map)
    else:
        value_model = value_model or VPPValueModel()
    
    # 1 member -> trivially stable
    if len(coalition) == 1:
        agent = coalition[0]
        v_S = value_model.evaluate(frozenset([agent]), profiles)
        out_opt = profiles[agent].outside_option if agent in profiles else 0.0
        return StabilityResult(
            status="EXACT_STABLE",
            margin=float("inf"),
            epsilon_star=0.0,
            allocation={agent: v_S},
            outside_options={agent: out_opt},
            rounds=0,
            converged=True,
            solve_time_ms=0.0,
        )

    n = len(coalition)
    agent_index: dict[Any, int] = {agent: i for i, agent in enumerate(coalition)}
    
    # Pre-calculate outside options
    outside_options = {
        agent: profiles[agent].outside_option if agent in profiles else 0.0 
        for agent in coalition
    }
    
    v_S = value_model.evaluate(frozenset(coalition), profiles)

    char_fn: dict[frozenset[Any], float] = {}

    S_frozen = frozenset(coalition)
    
    use_exact = n <= 12
    if use_exact:
        k = max_deviation_size if max_deviation_size is not None else n - 1
        subgraph = graph.subgraph(coalition)
        deviations_raw = permissible_coalitions(subgraph, k=k)
        deviations = [d for d in deviations_raw if d != S_frozen]
        char_fn = build_characteristic_function(coalition, profiles, deviations, value_model)
    else:
        deviations = []

    # ── Least-Core LP ────────────────────────────────────────────────
    # Variables: x[0..n-1] = payoffs, x[n] = epsilon
    # Minimise: epsilon
    c = np.zeros(n + 1)
    c[n] = 1.0 

    # Equality: Σ xᵢ = v(S)
    A_eq = np.ones((1, n + 1))
    A_eq[0, n] = 0.0
    b_eq = np.array([v_S])

    # Bounds: xᵢ ≥ out_i, epsilon is unbounded
    bounds = [(outside_options[coalition[i]], None) for i in range(n)]
    bounds.append((None, None))

    active_rows: list[np.ndarray] = [] 
    active_rhs: list[float] = []

    # Add singletons to bound epsilon initially
    for i, a in enumerate(coalition):
        row = np.zeros(n + 1)
        row[i] = -1.0
        row[n] = -1.0
        active_rows.append(row)
        
        S_a = frozenset([a])
        if S_a not in char_fn:
            char_fn[S_a] = value_model.evaluate(S_a, profiles)
            
        active_rhs.append(-char_fn[S_a])

    rounds = 0
    converged = False
    
    # Initial fallback allocation (proportional to outside options if possible)
    out_sum = sum(outside_options.values())
    if out_sum > 0:
        x_star_dict = {a: v_S * (outside_options[a] / out_sum) for a in coalition}
    else:
        x_star_dict = {a: v_S / n for a in coalition}
        
    final_oracle: OracleResult | None = None
    epsilon_star = 0.0

    for _ in range(max_iter):
        rounds += 1

        if active_rows:
            A_ub = np.vstack(active_rows)
            b_ub = np.array(active_rhs)
        else:
            A_ub = np.zeros((0, n + 1))
            b_ub = np.zeros(0)

        result = linprog(
            c,
            A_ub=A_ub if len(A_ub) > 0 else None,
            b_ub=b_ub if len(b_ub) > 0 else None,
            A_eq=A_eq,
            b_eq=b_eq,
            bounds=bounds,
            method="highs",
        )

        if result.status == 2:
            # Infeasible (e.g. v(S) is not even enough to cover outside options)
            converged = True
            solve_time_ms = (time.perf_counter() - t_start) * 1000
            return StabilityResult(
                status="BLOCKING_COALITION_FOUND",
                margin=-float("inf"),
                epsilon_star=float("inf"),
                allocation={},
                outside_options=outside_options,
                deviating_coalition=None,
                rounds=rounds,
                converged=converged,
                solve_time_ms=solve_time_ms,
            )

        if result.status not in (0, 1):
            converged = False
            break

        x_arr = result.x
        x_star_dict = {agent: float(x_arr[agent_index[agent]]) for agent in coalition}
        epsilon_star = float(x_arr[n])

        # Run separation oracle on x_star (epsilon is NOT added to x_star during check)
        if use_exact:
            oracle_result = separation_oracle(x_star_dict, deviations, char_fn, EPSILON)
        else:
            from app.stability.separation_oracle import topology_aware_separation_oracle
            oracle_result = topology_aware_separation_oracle(
                x_star_dict, graph.subgraph(coalition), profiles, value_model, char_fn, EPSILON
            )
        
        final_oracle = oracle_result

        # The oracle finds slack without epsilon: slack(T) = Σxᵢ - v(T)
        # If the most violated constraint has a slack worse than -epsilon_star, add it.
        # i.e., if Σxᵢ < v(T) - epsilon_star - tolerance
        if oracle_result.most_violated_coalition is None or (oracle_result.min_slack >= -epsilon_star - EPSILON):
            converged = True
            break

        # Add constraint: -Σᵢ∈T xᵢ - ε ≤ -v(T)
        T_star = oracle_result.most_violated_coalition
        row = np.zeros(n + 1)
        for i in T_star:
            row[agent_index[i]] = -1.0
        row[n] = -1.0  # -epsilon
        
        active_rows.append(row)
        active_rhs.append(-char_fn[T_star])
    else:
        converged = False

    solve_time_ms = (time.perf_counter() - t_start) * 1000

    if final_oracle is None:
        min_slack = 0.0
        binding = []
        worst_T = None
    else:
        min_slack = min(final_oracle.all_slacks.values()) if final_oracle.all_slacks else 0.0
        binding = [
            BindingConstraint(coalition=sorted(T), slack=s)
            for T, s in final_oracle.all_slacks.items()
            if abs(s + epsilon_star) <= EPSILON * 100
        ]
        worst_T = min(final_oracle.all_slacks, key=lambda t: final_oracle.all_slacks[t]) if final_oracle.all_slacks else None

    # is_stable if epsilon_star <= 0 (the core is non-empty)
    # Note: if it's strictly > EPSILON, then it's unstable.
    if epsilon_star <= EPSILON and converged:
        status = "EXACT_STABLE"
    elif epsilon_star > EPSILON and converged:
        status = "BLOCKING_COALITION_FOUND"
    elif epsilon_star <= EPSILON and not converged:
        status = "HEURISTIC_NO_VIOLATION_FOUND"
    else:
        status = "UNVERIFIED"

    return StabilityResult(
        status=status,
        margin=round(min_slack, 8),
        epsilon_star=round(epsilon_star, 8),
        allocation=x_star_dict,
        outside_options=outside_options,
        binding_constraints=binding,
        deviating_coalition=sorted(worst_T) if (worst_T and status == "BLOCKING_COALITION_FOUND") else None,
        rounds=rounds,
        converged=converged,
        solve_time_ms=solve_time_ms,
    )
