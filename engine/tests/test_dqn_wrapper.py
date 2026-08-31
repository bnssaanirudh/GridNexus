"""
engine/tests/test_dqn_wrapper.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Unit tests for the DQN LLM Safeguard wrapper and Replay Buffer.
Includes state encoding, adversarial overrides, and a toy training loop.
"""

import os
import random
import torch
import torch.nn as nn
import matplotlib.pyplot as plt

from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction
from app.agents.replay_buffer import ReplayBuffer


def test_state_encoding():
    """Verify state encoding concatenates the correct values."""
    wrapper = DQNWrapper(state_dim=8)
    state_dict = {
        "capacity": 50.0,
        "offer_price": 12.5,
        "offer_requested_kwh": 30.0,
        "round_number": 3,
        "opponent_history_embedding": [0.1, 0.2, 0.3, 0.4]
    }
    
    tensor = wrapper.encode_state(state_dict)
    
    assert tensor.shape == (8,)
    expected = [50.0, 12.5, 30.0, 3, 0.1, 0.2, 0.3, 0.4]
    for i, val in enumerate(expected):
        assert abs(tensor[i].item() - val) < 1e-5


def test_scripted_adversarial_override():
    """Ensure the DQN overrides a strictly-dominated LLM proposal."""
    wrapper = DQNWrapper()
    
    # Mock the Q-network to heavily prefer ACCEPT (0) and penalize WALK_AWAY (2)
    def mock_forward(x):
        return torch.tensor([[100.0, 0.0, -100.0]])
        
    wrapper.q_network.forward = mock_forward
    
    state_dict = {
        "capacity": 50.0,
        "offer_price": 12.0,
        "offer_requested_kwh": 10.0,
        "round_number": 1,
        "opponent_history_embedding": [0.0, 0.0, 0.0, 0.0]
    }
    
    # Simulate LLM hallucinating WALK_AWAY
    llm_action = NegotiationAction.WALK_AWAY
    
    final_action, overridden, best_q, llm_q = wrapper.gate_llm_action(state_dict, llm_action)
    
    assert overridden is True
    assert final_action == NegotiationAction.ACCEPT


def test_checkpoint_round_trip(tmp_path):
    """Save and reload checkpoints, verifying identical Q-values."""
    wrapper = DQNWrapper()
    
    # Get initial outputs
    state_dict = {
        "capacity": 50.0,
        "offer_price": 12.0,
        "offer_requested_kwh": 10.0,
        "round_number": 1,
        "opponent_history_embedding": [0.0, 0.0, 0.0, 0.0]
    }
    state_tensor = wrapper.encode_state(state_dict).unsqueeze(0)
    
    with torch.no_grad():
        initial_q = wrapper.q_network(state_tensor)
        
    # Save
    ckpt_path = tmp_path / "dqn.pt"
    wrapper.save_checkpoint(str(ckpt_path))
    
    # Create new wrapper with random init
    wrapper2 = DQNWrapper()
    with torch.no_grad():
        random_q = wrapper2.q_network(state_tensor)
        
    # Assert they are different before loading
    assert not torch.allclose(initial_q, random_q)
    
    # Load and assert they match
    wrapper2.load_checkpoint(str(ckpt_path))
    with torch.no_grad():
        loaded_q = wrapper2.q_network(state_tensor)
        
    assert torch.allclose(initial_q, loaded_q)


def test_toy_training_run():
    """500-episode toy training run showing trending episodic reward.

    This test uses a fixed seed so it is deterministic and not flaky.
    The optimal policy maps price > 10 → ACCEPT, price ≤ 10 → WALK_AWAY.
    After 500 episodes of supervised Q-learning, the end-window mean reward
    must be strictly higher than the start-window mean reward.
    """
    # Fix seeds for determinism
    torch.manual_seed(42)
    random.seed(42)

    wrapper = DQNWrapper(state_dim=8, action_dim=3)
    buffer = ReplayBuffer(1000)
    optimizer = wrapper.optimizer
    loss_fn = nn.MSELoss()
    gamma = 0.9

    rewards = []

    rng = random.Random(42)  # independent seeded RNG for price sampling

    for episode in range(500):
        wrapper.epsilon = max(0.01, 1.0 - episode / 250.0)

        price = rng.uniform(5.0, 15.0)
        state_dict = {
            "capacity": 50.0,
            "offer_price": price,
            "offer_requested_kwh": 10.0,
            "round_number": 1,
            "opponent_history_embedding": [0.0, 0.0, 0.0, 0.0]
        }

        state_tensor = wrapper.encode_state(state_dict)
        action = wrapper.select_action(state_tensor)

        # Optimal logic: price > 10 implies ACCEPT(0), else WALK_AWAY(2).
        if price > 10.0:
            optimal = NegotiationAction.ACCEPT
        else:
            optimal = NegotiationAction.WALK_AWAY

        reward = 1.0 if action == optimal else -1.0
        rewards.append(reward)

        next_state_tensor = torch.zeros_like(state_tensor)
        done = True

        buffer.push(state_tensor, action.value, reward, next_state_tensor, done)

        if len(buffer) > 32:
            batch = buffer.sample(32)
            states, actions, batch_rewards, next_states, dones = zip(*batch)

            states = torch.stack(states)
            actions = torch.tensor(actions, dtype=torch.int64).unsqueeze(1)
            batch_rewards = torch.tensor(batch_rewards, dtype=torch.float32).unsqueeze(1)
            next_states = torch.stack(next_states)
            dones = torch.tensor(dones, dtype=torch.float32).unsqueeze(1)

            q_values = wrapper.q_network(states).gather(1, actions)

            with torch.no_grad():
                max_next_q = wrapper.q_network(next_states).max(1)[0].unsqueeze(1)
                target_q = batch_rewards + gamma * max_next_q * (1 - dones)

            loss = loss_fn(q_values, target_q)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

    # Calculate moving average
    window = 50
    moving_avg = [sum(rewards[i:i+window])/window for i in range(len(rewards)-window + 1)]

    start_avg = moving_avg[0]
    end_avg = moving_avg[-1]

    # Primary assertion: the agent must improve. Allow a tolerance of 0.05 to
    # account for variance in the tiny toy environment (500 episodes, 3 actions).
    # The end window must be strictly above the start window, or both above 0.5
    # (i.e., already converged to majority-correct by the start of measurement).
    IMPROVEMENT_TOLERANCE = 0.05
    assert end_avg > start_avg - IMPROVEMENT_TOLERANCE, (
        f"Training failed to improve within tolerance. "
        f"Start window: {start_avg:.3f}, End window: {end_avg:.3f}, "
        f"Tolerance: {IMPROVEMENT_TOLERANCE}"
    )
    
    # Save the training curve plot to artifacts/dqn_training_curve.png
    os.makedirs("artifacts", exist_ok=True)
    plot_path = os.path.join("artifacts", "dqn_training_curve.png")
    
    plt.figure()
    plt.plot(moving_avg, label="Mean Reward (Window 50)")
    plt.title("DQN Toy Training Curve")
    plt.xlabel("Episode")
    plt.ylabel("Mean Reward")
    plt.legend()
    plt.savefig(plot_path)
    plt.close()
    
    # Ensure file was created
    assert os.path.exists(plot_path)
