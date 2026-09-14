"""
engine/tests/test_reward_fn.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tests for the Profit-Linked Reward Function and Temperature Policy.
"""

import os
import random
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from app.rl.reward_fn import compute_reward, RewardBreakdown
from app.rl.temperature_policy import TemperaturePolicy
from app.stability.stability_solver import StabilityResult
from app.qre.calibration import get_calibrated_lambda


def test_compute_reward_surplus_only():
    # Only surplus, margin > 0 (stable), 0 fallback
    sr = StabilityResult(
        status="EXACT_STABLE",
        margin=5.0,
        binding_constraints=[],
        deviating_coalition=None,
        rounds=1,
        converged=True
    )
    reward = compute_reward(trade_outcome=10.0, stability_result=sr, fallback_rate=0.0)
    assert reward.total == 10.0
    assert reward.surplus == 10.0
    assert reward.stability_penalty == 0.0
    assert reward.reasoning_deficit_penalty == 0.0


def test_compute_reward_unstable_penalty():
    # Margin < 0 (unstable)
    sr = StabilityResult(
        status="BLOCKING_COALITION_FOUND",
        margin=-3.0,
        binding_constraints=[],
        deviating_coalition=None,
        rounds=1,
        converged=True
    )
    reward = compute_reward(trade_outcome=10.0, stability_result=sr, fallback_rate=0.0)
    assert reward.total == 7.0  # 10 - 3 - 0
    assert reward.stability_penalty == 3.0


def test_compute_reward_fallback_penalty():
    # Fallback rate > 0
    sr = StabilityResult(
        status="EXACT_STABLE",
        margin=2.0,
        binding_constraints=[],
        deviating_coalition=None,
        rounds=1,
        converged=True
    )
    reward = compute_reward(trade_outcome=10.0, stability_result=sr, fallback_rate=0.5)
    assert reward.total == 9.5  # 10 - 0 - 0.5 (weight 1.0)
    assert reward.reasoning_deficit_penalty == 0.5


def test_compute_reward_all_penalties():
    sr = StabilityResult(
        status="BLOCKING_COALITION_FOUND",
        margin=-2.5,
        binding_constraints=[],
        deviating_coalition=None,
        rounds=1,
        converged=True
    )
    reward = compute_reward(trade_outcome=10.0, stability_result=sr, fallback_rate=1.0)
    assert reward.total == 6.5  # 10 - 2.5 - 1.0
    assert reward.stability_penalty == 2.5
    assert reward.reasoning_deficit_penalty == 1.0


def test_closed_loop_simulation():
    """
    Runs a closed-loop simulation over 300 rounds for several agents.
    Verifies that temperature doesn't oscillate unboundedly and converges.
    Also verifies QRE lambda consistency.
    """
    n_agents = 5
    n_rounds = 300
    
    # Initialize agents with TemperaturePolicy
    agents = {f"agent_{i}": TemperaturePolicy(window_size=10, low_threshold=2.0, high_threshold=8.0, step=0.1) for i in range(n_agents)}
    
    trajectories = {ag: [] for ag in agents}
    
    for rnd in range(n_rounds):
        for ag, policy in agents.items():
            # Simulate a reward
            # To test the policy, let's make the reward a function of the temperature
            # If temp is high (exploring), reward tends to be average.
            # Let's say reward = 10 - 5 * abs(policy.temperature - 1.0) + noise
            reward = 10 - 5 * abs(policy.temperature - 1.0) + random.uniform(-1, 1)
            
            # If the agent is doing well (reward > 8), it will exploit (temp drops)
            # If temp drops too much (say < 0.5), reward drops, so it increases temp
            
            # Update policy
            new_temp, new_lambda = policy.update_temperature(reward)
            trajectories[ag].append(new_temp)
            
            # Verify consistency
            assert np.isclose(new_lambda, get_calibrated_lambda(new_temp)), "QRE Lambda consistency failed"
            
    # Convergence check (last 50 rounds)
    converged_count = 0
    for ag, traj in trajectories.items():
        final_window = traj[-50:]
        variance = np.var(final_window)
        # Bounded variance check
        if variance < 0.1:  # Should be relatively stable
            converged_count += 1
            
    assert converged_count >= 0.8 * n_agents, f"Only {converged_count}/{n_agents} agents converged"
    
    # Generate Plot
    os.makedirs("artifacts", exist_ok=True)
    plt.figure(figsize=(10, 6))
    for ag, traj in trajectories.items():
        plt.plot(traj, label=ag, alpha=0.7)
    
    plt.title("Temperature Trajectories over 300 Rounds")
    plt.xlabel("Round")
    plt.ylabel("Temperature")
    plt.legend()
    plt.grid(True)
    plt.savefig("artifacts/temperature_trajectories.png")
    plt.close()
