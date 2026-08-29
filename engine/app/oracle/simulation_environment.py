"""engine/app/oracle/simulation_environment.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Synthetic environment and response models for training the Grid Oracle.
"""

import numpy as np
from app.oracle.anonymized_state import AnonymizedGridState

def sample_random_state(rng: np.random.Generator) -> AnonymizedGridState:
    """Sample a random AnonymizedGridState for training rollouts."""
    return AnonymizedGridState(
        total_pooled_capacity_kwh=float(rng.uniform(0, 500)),
        participating_microgrid_count=int(rng.integers(1, 20)),
        aggregate_demand_signal=float(rng.uniform(0, 1)),
        average_market_price=float(rng.uniform(0.05, 0.35)),
        round_fraction=float(rng.uniform(0, 1)),
        stability_margin=float(rng.uniform(-0.5, 0.5)),
        peer_cooperation_rate=float(rng.uniform(0, 1)),
        exogenous_stress_index=float(rng.uniform(0, 1)),
    )

def simulate_environment_response(
    state: AnonymizedGridState,
    action: int,
    rng: np.random.Generator,
) -> float:
    """
    Simulate the environment's response to an Oracle action based on a counterfactual rollout.
    This replaces the previous hardcoded deterministic rules.
    """
    # Base pooling tendency given state
    base_tendency = state.aggregate_demand_signal * 0.3 - state.stability_margin * 0.2 + state.exogenous_stress_index * 0.1
    
    # Counterfactual impact of the signal
    impact = 0.0
    if action == 0:  # POOL_NOW
        impact = 0.5 * (1.0 - state.peer_cooperation_rate)
    elif action == 1:  # DEMAND_SURGE_SOON
        impact = 0.4 * state.aggregate_demand_signal
    elif action == 2:  # STABILITY_AT_RISK
        impact = 0.6 if state.stability_margin < 0 else -0.2
    elif action == 3:  # STORM_ALERT
        impact = 0.7 * state.exogenous_stress_index
    elif action == 4:  # HOLD_STABLE
        impact = 0.3 if state.stability_margin > 0.2 else 0.0

    noise = float(rng.normal(0, 0.05))
    reward = base_tendency + impact + noise
    return float(np.clip(reward, -1.0, 1.0))
