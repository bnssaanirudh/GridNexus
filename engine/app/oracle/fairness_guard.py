"""engine/app/oracle/fairness_guard.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fairness guard for the Oracle's Bayesian persuasion policy.

Rationale
─────────
A Bayesian persuasion mechanism can, in principle, manipulate agents against
their own interests (e.g. persuade a microgrid to pool surplus at a price that
is below its true generation cost).  The fairness guard detects this by
computing a *counterfactual utility*: the utility the agent would have received
if the Oracle had stayed silent (broadcast HOLD_STABLE, action 4).

An agent is *harmed* if:
    realised_utility < counterfactual_utility - FAIRNESS_THRESHOLD

The overall penalty is the mean harm across all harmed agents, normalised to
[0, 1].

ASSUMPTION :
  Agent utility is modelled as:
      u(agent) = (market_price - estimated_cost) * contributed_kwh

  Since individual generation costs are private (never revealed to the Oracle),
  we estimate cost as a *scalar fraction* of market_price derived from the
  anonymized state.  Specifically:
      estimated_cost = average_market_price * COST_FRACTION_ESTIMATE

  This is a deliberate approximation: the guard is not meant to be exact —
  it is meant to catch *systematic* Oracle manipulation (where many agents are
  harmed by large margins), not noisy individual variation.

  COST_FRACTION_ESTIMATE = 0.6 means we assume the typical generation cost is
  60% of the clearing price, leaving a 40% margin.  This is consistent with
  typical values observed in the MAPPO training environment.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


# ─── Constants ────────────────────────────────────────────────────────────────

FAIRNESS_THRESHOLD: float = 0.05
"""Minimum utility drop (absolute, normalised) to count as a fairness violation."""

COST_FRACTION_ESTIMATE: float = 0.6
"""Estimated ratio of generation cost to market price (used for counterfactual)."""


# ─── Data types ───────────────────────────────────────────────────────────────


@dataclass
class AgentOutcome:
    """Per-agent utility before and after the Oracle broadcast.

    Attributes
    ----------
    agent_id : str
        Opaque identifier for this agent (may be a simple integer string).
    contributed_kwh : float
        Energy contributed by this agent to the coalition post-broadcast.
    contributed_kwh_counterfactual : float
        Energy the agent would have contributed absent the broadcast.
    market_price : float
        Clearing price at which energy was settled ($/kWh).
    estimated_cost : float
        Estimated generation cost ($/kWh).  Computed from market_price and
        COST_FRACTION_ESTIMATE; never sourced from a hidden field.
    utility_with_broadcast : float
        Realised utility: (market_price - estimated_cost) * contributed_kwh.
    utility_without_broadcast : float
        Counterfactual utility: (market_price - estimated_cost) *
        contributed_kwh_counterfactual.
    harm : float
        Max(0, utility_without_broadcast - utility_with_broadcast - threshold).
        Zero when the agent is not harmed beyond the threshold.
    """

    agent_id: str
    contributed_kwh: float
    contributed_kwh_counterfactual: float
    market_price: float
    estimated_cost: float
    utility_with_broadcast: float
    utility_without_broadcast: float
    harm: float = 0.0


# ─── Builder ─────────────────────────────────────────────────────────────────


def build_agent_outcomes(
    *,
    n_agents: int,
    kwh_with_broadcast: list[float],
    kwh_counterfactual: list[float],
    market_price: float,
    rng: np.random.Generator | None = None,
) -> list[AgentOutcome]:
    """Construct AgentOutcome records from aggregate oracle simulation data.

    Parameters
    ----------
    n_agents : int
        Number of agents in the coalition.
    kwh_with_broadcast : list[float]
        Per-agent energy contribution after the Oracle broadcast.
    kwh_counterfactual : list[float]
        Per-agent energy contribution without the Oracle broadcast.
    market_price : float
        Current clearing price ($/kWh).
    rng : np.random.Generator | None
        Optional RNG for adding small noise to estimated costs (default: no noise).

    Returns
    -------
    list[AgentOutcome]
        One record per agent, with utilities and harm pre-computed.
    """
    if len(kwh_with_broadcast) != n_agents or len(kwh_counterfactual) != n_agents:
        raise ValueError(
            f"kwh arrays must each have length {n_agents}; "
            f"got {len(kwh_with_broadcast)} and {len(kwh_counterfactual)}"
        )

    estimated_cost_base = market_price * COST_FRACTION_ESTIMATE

    outcomes: list[AgentOutcome] = []
    for i in range(n_agents):
        # Add small agent-specific cost heterogeneity (±10%)
        noise = float(rng.uniform(-0.1, 0.1)) if rng is not None else 0.0
        est_cost = estimated_cost_base * (1.0 + noise)
        margin = market_price - est_cost

        kwh_w = float(kwh_with_broadcast[i])
        kwh_c = float(kwh_counterfactual[i])

        u_with = margin * kwh_w
        u_without = margin * kwh_c

        harm = max(0.0, u_without - u_with - FAIRNESS_THRESHOLD)

        outcomes.append(
            AgentOutcome(
                agent_id=str(i),
                contributed_kwh=kwh_w,
                contributed_kwh_counterfactual=kwh_c,
                market_price=market_price,
                estimated_cost=est_cost,
                utility_with_broadcast=u_with,
                utility_without_broadcast=u_without,
                harm=harm,
            )
        )
    return outcomes


# ─── Penalty computation ──────────────────────────────────────────────────────


def compute_fairness_penalty(
    agent_outcomes: list[AgentOutcome],
) -> tuple[float, bool]:
    """Compute the aggregate fairness-guard penalty.

    Parameters
    ----------
    agent_outcomes : list[AgentOutcome]
        Per-agent outcome records (as returned by build_agent_outcomes).

    Returns
    -------
    penalty : float
        Mean harm across all agents, normalised to [0, 1].
        Zero when no agent is harmed.
    fairness_violated : bool
        True iff at least one agent has harm > 0.
    """
    if not agent_outcomes:
        return 0.0, False

    harms = [ao.harm for ao in agent_outcomes]
    mean_harm = float(np.mean(harms))
    fairness_violated = any(h > 0.0 for h in harms)

    # Normalise: divide by a representative utility scale so the penalty
    # is in [0, 1] for typical market prices (~$0.20/kWh × ~50 kWh each)
    # → normalisation constant = 0.20 * 0.4 * 50 = 4.0 $/step
    NORM_SCALE = 4.0
    penalty = float(np.clip(mean_harm / NORM_SCALE, 0.0, 1.0))

    return penalty, fairness_violated


def fairness_violation_rate(episode_outcomes: list[list[AgentOutcome]]) -> float:
    """Compute the fraction of steps in an episode where fairness was violated.

    Parameters
    ----------
    episode_outcomes : list[list[AgentOutcome]]
        One inner list per timestep, each containing per-agent outcomes.

    Returns
    -------
    float
        Fraction in [0, 1] of steps where at least one agent was harmed.
    """
    if not episode_outcomes:
        return 0.0
    violated = sum(
        1 for step in episode_outcomes
        if any(ao.harm > 0.0 for ao in step)
    )
    return violated / len(episode_outcomes)
