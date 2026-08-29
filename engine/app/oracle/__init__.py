"""engine/app/oracle/__init__.py
Public API of the oracle package.
"""
from app.oracle.anonymized_state import AnonymizedGridState
from app.oracle.inference import OraclePolicy
from app.oracle.oracle_reward import (
    OracleRewardBreakdown,
    OracleRewardConfig,
    check_pareto_improvement,
    compute_oracle_reward,
)
from app.oracle.fairness_guard import (
    AgentOutcome,
    build_agent_outcomes,
    compute_fairness_penalty,
)

__all__ = [
    "AnonymizedGridState",
    "OraclePolicy",
    "OracleRewardBreakdown",
    "OracleRewardConfig",
    "check_pareto_improvement",
    "compute_oracle_reward",
    "AgentOutcome",
    "build_agent_outcomes",
    "compute_fairness_penalty",
]
