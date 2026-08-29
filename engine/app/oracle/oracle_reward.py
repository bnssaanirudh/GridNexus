"""engine/app/oracle/oracle_reward.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Oracle Reward Function for Pareto-Optimal Pooling .

Reward components
─────────────────
1. **Pooled-capacity delta** (+):
   Positive reward proportional to the increase in total pooled kWh relative
   to the pre-broadcast baseline.  Zero reward for no change; small penalty
   for a decrease.

2. **Pareto-improvement bonus** (+):
   Extra reward if the broadcast triggers a Pareto improvement — no agent is
   strictly worse off and at least one is strictly better off.

3. **Stability-risk penalty** (-):
   Negative reward proportional to the magnitude of the stability violation
   produced by calling verify_stability on the resulting coalition.  A stable
   result yields zero penalty.

4. **Fairness-guard penalty** (-):
   Negative reward if any agent's realised utility falls measurably below their
   counterfactual utility (what they would have received without the broadcast).
   Computed via `fairness_guard.compute_fairness_penalty`.

All components are clipped to [-1, 1] individually before summing, then the
total is clipped to [-3, 3].  Weights are documented below and also stored in
`OracleRewardConfig` so callers can tune them without code changes.

ASSUMPTION :
  We model agent utilities as (market_price - generation_cost) * contributed_kwh,
  where generation_cost is a *synthetic* aggregate proxy (mean cost estimated from
  the anonymized state's average_market_price).  Individual private costs are
  never observed; only the direction of change matters for the fairness guard.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import networkx as nx
import numpy as np

from app.oracle.anonymized_state import AnonymizedGridState
from app.oracle.fairness_guard import AgentOutcome, compute_fairness_penalty
from app.stability.stability_solver import StabilityResult, verify_stability


# ─── Reward config ────────────────────────────────────────────────────────────


@dataclass
class OracleRewardConfig:
    """Weights and thresholds for the Oracle reward components.

    All weight parameters are non-negative scalars.  Penalty weights are
    negated internally when computing the total.
    """

    # Weight on the pooled-capacity delta component [0, ∞)
    capacity_delta_weight: float = 1.0

    # Bonus for a confirmed Pareto improvement [0, ∞)
    pareto_bonus: float = 0.5

    # Weight on the stability-risk penalty [0, ∞)
    stability_penalty_weight: float = 1.5

    # Weight on the fairness-guard penalty [0, ∞)
    fairness_penalty_weight: float = 1.0

    # Normalisation baseline for pooled capacity (kWh); avoids huge raw values
    capacity_norm_kwh: float = 500.0


# ─── Reward breakdown ─────────────────────────────────────────────────────────


@dataclass
class OracleRewardBreakdown:
    """Individual reward components for auditability and curve plotting.

    Attributes
    ----------
    total : float
        Sum of all weighted components, clipped to [-3, 3].
    capacity_delta : float
        Normalised delta in pooled capacity (positive = more pooling).
    pareto_bonus : float
        Non-zero iff a Pareto improvement was detected.
    stability_penalty : float
        Non-negative penalty for stability violations.
    fairness_penalty : float
        Non-negative penalty for agents hurt below their counterfactual.
    is_pareto_improvement : bool
        True iff every agent is at least as well off and one is strictly better.
    fairness_violated : bool
        True iff at least one agent was harmed beyond the fairness threshold.
    stability_margin : float
        Raw margin from the LP solver (positive = stable).
    """

    total: float
    capacity_delta: float
    pareto_bonus: float
    stability_penalty: float
    fairness_penalty: float
    is_pareto_improvement: bool
    fairness_violated: bool
    stability_margin: float


# ─── Pareto-improvement check ─────────────────────────────────────────────────


def check_pareto_improvement(
    before_utilities: list[float],
    after_utilities: list[float],
    atol: float = 1e-6,
) -> bool:
    """Return True iff *after* is a Pareto improvement over *before*.

    A Pareto improvement requires:
      (a) No agent is strictly worse off: after[i] >= before[i] - atol ∀ i
      (b) At least one agent is strictly better off: after[j] > before[j] + atol

    Parameters
    ----------
    before_utilities : list[float]
        Per-agent utility values before the Oracle broadcast.
    after_utilities : list[float]
        Per-agent utility values after the Oracle broadcast.
    atol : float
        Absolute tolerance for floating-point comparisons.

    Returns
    -------
    bool
        True iff the transition is Pareto-improving.
    """
    if len(before_utilities) != len(after_utilities):
        raise ValueError(
            f"Utility vectors must have equal length; "
            f"got {len(before_utilities)} vs {len(after_utilities)}"
        )
    if not before_utilities:
        return False

    no_agent_worse = all(
        a >= b - atol for a, b in zip(after_utilities, before_utilities)
    )
    at_least_one_better = any(
        a > b + atol for a, b in zip(after_utilities, before_utilities)
    )
    return no_agent_worse and at_least_one_better


# ─── Stability-risk penalty ───────────────────────────────────────────────────


def compute_stability_penalty(
    result: StabilityResult,
    weight: float = 1.5,
) -> float:
    """Convert a StabilityResult into a non-negative penalty scalar.

    The penalty is proportional to the magnitude of the stability violation
    (negative margin).  A stable result (margin ≥ 0) yields zero penalty.

    Parameters
    ----------
    result : StabilityResult
        Output of verify_stability.
    weight : float
        Multiplier applied to the raw margin violation.

    Returns
    -------
    float
        Non-negative penalty, clipped to [0, 1].
    """
    raw = max(0.0, -result.margin)
    return float(np.clip(weight * raw, 0.0, 1.0))


# ─── Main reward function ─────────────────────────────────────────────────────


def compute_oracle_reward(
    *,
    state_before: AnonymizedGridState,
    state_after: AnonymizedGridState,
    agent_outcomes: list[AgentOutcome],
    stability_result: StabilityResult,
    cfg: OracleRewardConfig | None = None,
) -> OracleRewardBreakdown:
    """Compute the full Oracle reward for one broadcast step.

    Parameters
    ----------
    state_before : AnonymizedGridState
        Coalition state *before* the Oracle broadcast.
    state_after : AnonymizedGridState
        Coalition state *after* the Oracle broadcast was applied.
    agent_outcomes : list[AgentOutcome]
        Per-agent utility outcomes including counterfactuals.  Produced by
        `fairness_guard.build_agent_outcomes`.
    stability_result : StabilityResult
        Output of verify_stability on the resulting coalition.
    cfg : OracleRewardConfig | None
        Reward weights; defaults to OracleRewardConfig() if None.

    Returns
    -------
    OracleRewardBreakdown
        Fully decomposed reward breakdown.
    """
    if cfg is None:
        cfg = OracleRewardConfig()

    # ── 1. Pooled-capacity delta ───────────────────────────────────────────
    delta_kwh = state_after.total_pooled_capacity_kwh - state_before.total_pooled_capacity_kwh
    # Normalise so large absolute capacities don't dominate
    norm_delta = delta_kwh / max(cfg.capacity_norm_kwh, 1.0)
    capacity_component = float(np.clip(cfg.capacity_delta_weight * norm_delta, -1.0, 1.0))

    # ── 2. Pareto-improvement check ────────────────────────────────────────
    before_utils = [ao.utility_without_broadcast for ao in agent_outcomes]
    after_utils = [ao.utility_with_broadcast for ao in agent_outcomes]
    is_pareto = check_pareto_improvement(before_utils, after_utils)
    pareto_component = cfg.pareto_bonus if is_pareto else 0.0

    # ── 3. Stability-risk penalty ──────────────────────────────────────────
    stab_penalty = compute_stability_penalty(
        stability_result, weight=cfg.stability_penalty_weight
    )

    # ── 4. Fairness-guard penalty ──────────────────────────────────────────
    fair_penalty_raw, fairness_violated = compute_fairness_penalty(agent_outcomes)
    fair_penalty = float(np.clip(cfg.fairness_penalty_weight * fair_penalty_raw, 0.0, 1.0))

    # ── 5. Aggregate ───────────────────────────────────────────────────────
    total = capacity_component + pareto_component - stab_penalty - fair_penalty
    total = float(np.clip(total, -3.0, 3.0))

    return OracleRewardBreakdown(
        total=total,
        capacity_delta=norm_delta,
        pareto_bonus=pareto_component,
        stability_penalty=stab_penalty,
        fairness_penalty=fair_penalty,
        is_pareto_improvement=is_pareto,
        fairness_violated=fairness_violated,
        stability_margin=stability_result.margin,
    )


# ─── Lightweight simulation helpers ──────────────────────────────────────────


def simulate_state_transition(
    state_before: AnonymizedGridState,
    action: int,
    rng: np.random.Generator,
) -> AnonymizedGridState:
    """
    Simulate a state transition resulting from an Oracle broadcast.

    This is a *synthetic* model used for offline training.  In production,
    the resulting state would be observed from the real negotiation environment
    after the broadcast has been injected.

    ASSUMPTION : The broadcast's influence on pooled capacity is
    modelled as a stochastic function of the action and the current cooperation
    rate.  Action 0 (POOL_NOW) and action 1 (DEMAND_SURGE_SOON) are most
    effective at increasing pooling; action 4 (HOLD_STABLE) is neutral.  The
    effect is amplified when peer_cooperation_rate is low (headroom to grow).

    Parameters
    ----------
    state_before : AnonymizedGridState
        Pre-broadcast coalition state.
    action : int
        Oracle action index (0–4).
    rng : np.random.Generator
        Random number generator for stochastic simulation.

    Returns
    -------
    AnonymizedGridState
        Simulated post-broadcast state.
    """
    # Base capacity increase fraction depends on action
    action_capacity_gain = {
        0: 0.15,   # POOL_NOW: strong pooling signal
        1: 0.12,   # DEMAND_SURGE_SOON: pre-pool for demand
        2: 0.08,   # STABILITY_AT_RISK: moderate push
        3: 0.10,   # STORM_ALERT: emergency pooling
        4: 0.01,   # HOLD_STABLE: near-neutral
    }
    base_gain = action_capacity_gain.get(action, 0.05)

    # Headroom: low cooperation rate means more agents can be persuaded
    headroom = 1.0 - state_before.peer_cooperation_rate
    gain_fraction = base_gain * headroom + float(rng.normal(0, 0.02))
    gain_fraction = float(np.clip(gain_fraction, -0.05, 0.3))

    new_capacity = state_before.total_pooled_capacity_kwh * (1.0 + gain_fraction)
    new_capacity = float(np.clip(new_capacity, 0.0, 5000.0))

    # Cooperation rate shifts toward 1.0 proportionally to capacity gain
    new_coop_rate = min(1.0, state_before.peer_cooperation_rate + gain_fraction * 0.5)

    # Stability margin improves slightly when more agents cooperate
    new_margin = state_before.stability_margin + gain_fraction * 0.2
    new_margin = float(np.clip(new_margin, -1.0, 1.0))

    return AnonymizedGridState(
        total_pooled_capacity_kwh=new_capacity,
        participating_microgrid_count=min(
            state_before.participating_microgrid_count + max(0, int(gain_fraction * 5)),
            50,
        ),
        aggregate_demand_signal=state_before.aggregate_demand_signal,
        average_market_price=state_before.average_market_price,
        round_fraction=min(1.0, state_before.round_fraction + 0.05),
        stability_margin=new_margin,
        peer_cooperation_rate=new_coop_rate,
        exogenous_stress_index=state_before.exogenous_stress_index,
    )
