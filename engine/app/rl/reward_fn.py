"""
engine/app/rl/reward_fn.py
━━━━━━━━━━━━━━━━━━━━━━━━━━
Profit-Linked Reward Function for DQN Wrapper.

Combines trade surplus, stability risks (from LP solver), and reasoning deficit
penalties (fallback rates) into a single reward signal.
"""

from pydantic import BaseModel
from app.stability.stability_solver import StabilityResult


class RewardBreakdown(BaseModel):
    """Individually logged reward components for auditability."""
    total: float
    surplus: float
    stability_penalty: float
    reasoning_deficit_penalty: float


def compute_reward(
    trade_outcome: float,
    stability_result: StabilityResult,
    fallback_rate: float
) -> RewardBreakdown:
    """
    Computes the profit-linked reward.

    Reward = surplus - stability_penalty - reasoning_deficit_penalty

    Args:
        trade_outcome: Realized trade surplus (profit).
        stability_result: The result from the Farsighted Coalitional Stability LP solver.
        fallback_rate: The ratio of DQN fallback usage to total LLM invocation rounds.

    Returns:
        RewardBreakdown containing the total reward and its individual components.
    """
    # Stability penalty: Penalize if margin is negative (unstable). We take max(0, -margin).
    stability_penalty = max(0.0, -stability_result.margin)
    
    # Reasoning deficit penalty: Proportional to the fallback rate. 
    reasoning_deficit_penalty = fallback_rate * 1.0
    
    total = trade_outcome - stability_penalty - reasoning_deficit_penalty
    
    return RewardBreakdown(
        total=total,
        surplus=trade_outcome,
        stability_penalty=stability_penalty,
        reasoning_deficit_penalty=reasoning_deficit_penalty
    )
