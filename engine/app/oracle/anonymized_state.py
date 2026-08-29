"""engine/app/oracle/anonymized_state.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AnonymizedGridState: the ONLY object the Grid Oracle is permitted to observe.

Design contract (enforced via static-analysis test in test_oracle_boundary.py):
  - This module MUST NOT import anything from app.agents.microgrid_agent or
    app.agents.secret_field, because those modules carry private battery
    capacity and generation cost.
  - All fields are *aggregate* statistics derived from the coalition as a whole;
    no per-agent identifier or hidden field is present.

ASSUMPTION : The raw per-agent data is already aggregated by the
broker layer before being forwarded here. The engine/oracle layer only ever
receives this anonymized view, which means a compromised Oracle cannot
reconstruct any individual agent's hidden ledger even with full access to its
inference-time inputs.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class AnonymizedGridState(BaseModel):
    """
    Aggregate, anonymized snapshot of the coalition state.

    This is the sole observation input to the Oracle policy.  No per-agent
    identifiers, battery capacities, or generation costs are present.

    Attributes
    ----------
    total_pooled_capacity_kwh:
        Sum of all surplus energy voluntarily pooled by coalition members.
    participating_microgrid_count:
        Number of microgrids currently in the active coalition.
    aggregate_demand_signal:
        Normalised grid-level demand signal in [0, 1].
        0 = well below baseline; 1 = extreme peak demand.
    average_market_price:
        Current average clearing price across recent settlements ($/kWh).
    round_fraction:
        Elapsed negotiation rounds / total rounds (episode progress in [0, 1]).
    stability_margin:
        Farsighted coalitional stability margin from the LP solver.
        Positive = stable; negative = at risk.
    peer_cooperation_rate:
        Fraction of observed agents that chose COOPERATIVE last step.
    exogenous_stress_index:
        Aggregate exogenous stress level produced by the RAG pipeline
        (e.g. storm risk + regulatory pressure + demand spike) in [0, 1].
    """

    total_pooled_capacity_kwh: float = Field(
        ...,
        ge=0.0,
        description="Aggregate pooled surplus energy from the coalition (kWh).",
    )
    participating_microgrid_count: int = Field(
        ...,
        ge=0,
        description="Number of microgrids participating in the coalition.",
    )
    aggregate_demand_signal: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Normalised grid demand signal [0, 1].",
    )
    average_market_price: float = Field(
        ...,
        ge=0.0,
        description="Avg clearing price across recent settlements ($/kWh).",
    )
    round_fraction: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Episode progress: elapsed rounds / total rounds [0, 1].",
    )
    stability_margin: float = Field(
        ...,
        description="LP coalitional stability margin (positive = stable).",
    )
    peer_cooperation_rate: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Fraction of agents that were COOPERATIVE last step.",
    )
    exogenous_stress_index: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Aggregate exogenous stress [0, 1] from RAG pipeline.",
    )
    # staleness flag surfaced by the resilient connector layer.
    # When True, the exogenous_stress_index was served from last-known-good cache
    # because the circuit breaker was open; the Oracle down-weights it accordingly.
    exogenous_signal_stale: bool = Field(
        default=False,
        description="True if exogenous_stress_index was read from stale cache (circuit open).",
    )

    def to_obs_vector(self) -> list[float]:
        """Serialise state to a fixed-length float vector for policy inference.

        When ``exogenous_signal_stale`` is True , the
        ``exogenous_stress_index`` is down-weighted by 50 % so the Oracle
        favours the remaining fresh signals rather than acting on potentially
        outdated grid-stress information.
        """
        # Down-weight stale exogenous signals by a fixed factor.
        # ASSUMPTION : 0.5 is a conservative discount chosen so the
        # Oracle still reacts to severe stale signals (e.g. storm warnings from
        # hours ago) but with reduced confidence.
        STALE_WEIGHT: float = 0.5
        exogenous = self.exogenous_stress_index * (STALE_WEIGHT if self.exogenous_signal_stale else 1.0)
        return [
            self.total_pooled_capacity_kwh / 1000.0,  # normalise by 1 MWh
            float(self.participating_microgrid_count) / 100.0,  # normalise by 100
            self.aggregate_demand_signal,
            self.average_market_price / 1.0,  # already in $/kWh ≈ [0, 1]
            self.round_fraction,
            max(-1.0, min(1.0, self.stability_margin)),  # clamp to [-1, 1]
            self.peer_cooperation_rate,
            exogenous,  # stale-adjusted
        ]


# Length of the observation vector — used by inference.py
OBS_DIM: int = 8
