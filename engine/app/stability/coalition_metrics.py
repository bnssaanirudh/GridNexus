"""
engine/app/stability/coalition_metrics.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prompt 7 — Scientifically meaningful coalition-instability metrics.

Implements:

    Coalition excess:    e(C, x) = v(C) - Σᵢ∈C xᵢ
    Maximum excess:      ε_coal = max_C e(C, x)
    Blocking coalition:  The C that achieves ε_coal

Exposes a structured result with:
    maximum_excess          : ε_coal value
    blocking_coalition      : Coalition achieving ε_coal, or None
    num_candidates_checked  : Number of coalitions evaluated
    verification_mode       : 'EXACT' or 'HEURISTIC'
    epsilon_tolerance       : Tolerance used to classify blocking
    runtime_ms              : Wall-clock computation time

SCIENTIFIC PROPERTIES
─────────────────────
- ε_coal ≤ 0 ↔ allocation x is in the core (exact case, N ≤ 12).
- For large N the separation oracle finds a LOWER BOUND on ε_coal.
  The label HEURISTIC_LOWER_BOUND is used; never EXACT_STABLE.
- Tests on hand-calculable cooperative games are included below in
  engine/tests/test_coalition_metrics.py.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Literal

import networkx as nx

from app.stability.value_model import CoalitionValueModel, VPPValueModel
from app.schemas.stability import AgentProfile
from app.graph.planar_graph import permissible_coalitions


# ─── Result type ──────────────────────────────────────────────────────────────


@dataclass
class CoalitionExcessResult:
    """Result of coalition excess computation.

    Attributes
    ----------
    maximum_excess         ε_coal = max_C [v(C) - Σᵢ∈C xᵢ].
                           Positive means C has incentive to deviate.
                           Negative means the allocation is in the core (exact case).
    blocking_coalition     The coalition achieving maximum_excess, or None.
    num_candidates_checked Number of candidate coalitions evaluated.
    verification_mode      'EXACT' for exhaustive search (N ≤ 12),
                           'HEURISTIC' for oracle-based approximate search.
    epsilon_tolerance      Tolerance for declaring an allocation blocking-stable.
    runtime_ms             Wall-clock computation time in milliseconds.
    all_excesses           Dict mapping coalition (frozenset) to excess value.
                           Populated for EXACT mode; may be partial for HEURISTIC.
    """

    maximum_excess: float
    blocking_coalition: frozenset[Any] | None
    num_candidates_checked: int
    verification_mode: Literal["EXACT", "HEURISTIC"]
    epsilon_tolerance: float
    runtime_ms: float
    all_excesses: dict[frozenset, float] = field(default_factory=dict)

    @property
    def is_blocking_stable(self) -> bool:
        """True iff maximum_excess ≤ ε_tolerance (allocation in core or ε-core)."""
        return self.maximum_excess <= self.epsilon_tolerance

    @property
    def status_label(self) -> str:
        """Human-readable status aligned with StabilityResult.status semantics."""
        if self.verification_mode == "EXACT":
            return "EXACT_STABLE" if self.is_blocking_stable else "BLOCKING_COALITION_FOUND"
        else:
            # Heuristic can only confirm violation, never stability
            if not self.is_blocking_stable:
                return "BLOCKING_COALITION_FOUND"
            return "HEURISTIC_NO_VIOLATION_FOUND"


# ─── Core computation ─────────────────────────────────────────────────────────


def compute_coalition_excess(
    allocation: dict[Any, float],
    graph: nx.Graph,
    profiles: dict[Any, AgentProfile] | None = None,
    value_model: CoalitionValueModel | None = None,
    epsilon_tolerance: float = 1e-6,
    max_deviation_size: int | None = None,
) -> CoalitionExcessResult:
    """Compute coalition excess for a given allocation.

    Parameters
    ----------
    allocation        Dict mapping agent_id → payoff xᵢ.
    graph             NetworkX graph of agent topology.
    profiles          Economic profiles (used by value_model).
    value_model       Characteristic function implementation.
    epsilon_tolerance Tolerance for declaring blocking stability.
    max_deviation_size
                      For exact search, restrict deviating coalitions to at
                      most this size (default: |S| - 1).

    Returns
    -------
    CoalitionExcessResult
    """
    t_start = time.perf_counter()
    coalition = list(allocation.keys())
    n = len(coalition)

    if n == 0:
        raise ValueError("Allocation must be non-empty.")

    profiles = profiles or {}
    value_model = value_model or VPPValueModel()

    S_frozen = frozenset(coalition)
    use_exact = n <= 12

    # ── Build candidate deviating coalitions ─────────────────────────────────
    if use_exact:
        if n == 1:
            deviations = []
        else:
            k = max_deviation_size if max_deviation_size is not None else n - 1
            subgraph = graph.subgraph(coalition)
            deviations = [d for d in permissible_coalitions(subgraph, k=k) if d != S_frozen]
    else:
        # Heuristic: use separation oracle result from stability_solver
        from app.stability.separation_oracle import topology_aware_separation_oracle
        oracle_result = topology_aware_separation_oracle(
            x_star=allocation,
            subgraph=graph.subgraph(coalition),
            profiles=profiles,
            value_model=value_model,
            char_fn={},
            tol=epsilon_tolerance,
        )
        runtime_ms = (time.perf_counter() - t_start) * 1000
        max_excess = -oracle_result.min_slack if oracle_result.min_slack is not None else 0.0
        blocking = oracle_result.most_violated_coalition
        n_checked = oracle_result.num_checked if hasattr(oracle_result, "num_checked") else len(oracle_result.all_slacks)
        return CoalitionExcessResult(
            maximum_excess=max_excess,
            blocking_coalition=frozenset(blocking) if blocking else None,
            num_candidates_checked=n_checked,
            verification_mode="HEURISTIC",
            epsilon_tolerance=epsilon_tolerance,
            runtime_ms=runtime_ms,
            all_excesses={frozenset(T): -s for T, s in oracle_result.all_slacks.items()},
        )

    # ── Exact computation over all deviating coalitions ───────────────────────
    all_excesses: dict[frozenset, float] = {}
    max_excess = -float("inf")
    blocking_coalition: frozenset | None = None

    for dev in deviations:
        coalition_sum = sum(allocation.get(a, 0.0) for a in dev)
        v_dev = value_model.evaluate(frozenset(dev), profiles)
        excess = v_dev - coalition_sum
        all_excesses[frozenset(dev)] = excess
        if excess > max_excess:
            max_excess = excess
            blocking_coalition = frozenset(dev)

    # If no deviations were found (singleton or full coalition only)
    if max_excess == -float("inf"):
        max_excess = 0.0
        blocking_coalition = None

    runtime_ms = (time.perf_counter() - t_start) * 1000

    return CoalitionExcessResult(
        maximum_excess=max_excess,
        blocking_coalition=blocking_coalition,
        num_candidates_checked=len(deviations),
        verification_mode="EXACT",
        epsilon_tolerance=epsilon_tolerance,
        runtime_ms=runtime_ms,
        all_excesses=all_excesses,
    )


# ─── Convenience shim ─────────────────────────────────────────────────────────


def epsilon_coal_from_stability_result(stability_result: Any) -> float:
    """Extract epsilon_coal from a StabilityResult.

    Uses the epsilon_star field (the Least-Core LP's optimal epsilon).
    Positive epsilon_star indicates the core is empty and epsilon_star is
    the minimum coalition excess required to stabilize.

    This is not the same as max_C e(C,x): epsilon_star is the optimal
    relaxation; the actual blocking excess may be larger in intermediate
    LP iterations.
    """
    return getattr(stability_result, "epsilon_star", 0.0)
