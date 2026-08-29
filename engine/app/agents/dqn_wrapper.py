"""
engine/app/agents/dqn_wrapper.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DQN Wrapper to safeguard LangChain LLM Negotiators.

This module gates the LLM's proposed semantic actions using a trained PyTorch
Deep Q-Network, preventing hallucinations or mathematically dominated bidding strategies.
"""

from enum import IntEnum
import random
import logging
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


class NegotiationAction(IntEnum):
    """Discrete action space for the negotiation."""
    ACCEPT = 0
    COUNTER_OFFER = 1
    WALK_AWAY = 2


class DQNNetwork(nn.Module):
    """Simple Multi-Layer Perceptron for Q-value estimation."""

    def __init__(self, state_dim: int, action_dim: int):
        super().__init__()
        self.fc1 = nn.Linear(state_dim, 64)
        self.fc2 = nn.Linear(64, 64)
        self.out = nn.Linear(64, action_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        return self.out(x)


class DQNWrapper:
    """Safeguards an LLM's proposed actions using a DQN."""

    def __init__(self, state_dim: int = 8, action_dim: int = 3, threshold: float = 2.0, mode: str = "INFERENCE"):
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.threshold = threshold  # Override threshold margin
        self.mode = mode.upper()
        
        self.q_network = DQNNetwork(state_dim, action_dim)
        self.optimizer = torch.optim.Adam(self.q_network.parameters(), lr=1e-3)
        
        if self.mode == "INFERENCE":
            self.epsilon = 0.0
            self.q_network.eval()
        else:
            self.epsilon = 1.0  # Exploration rate for training
            self.q_network.train()
            
        self.checkpoint_hash: str | None = None

    def encode_state(self, state_dict: dict[str, Any]) -> torch.Tensor:
        """Encodes the negotiation context into a fixed-size state tensor."""
        features = [
            float(state_dict.get("capacity", 0.0)),
            float(state_dict.get("offer_price", 0.0)),
            float(state_dict.get("offer_requested_kwh", 0.0)),
            float(state_dict.get("round_number", 0.0)),
        ]
        embedding = state_dict.get("opponent_history_embedding", [0.0] * 4)
        
        if len(embedding) != 4:
            raise ValueError("opponent_history_embedding must be exactly length 4.")
            
        features.extend(embedding)
        return torch.tensor(features, dtype=torch.float32)

    def select_action(self, state_tensor: torch.Tensor) -> NegotiationAction:
        """Action selection."""
        if self.mode == "TRAINING" and random.random() < self.epsilon:
            return NegotiationAction(random.randint(0, self.action_dim - 1))
            
        with torch.no_grad():
            q_values = self.q_network(state_tensor.unsqueeze(0))
            action_idx = torch.argmax(q_values, dim=1).item()
            return NegotiationAction(action_idx)

    def gate_llm_action(self, state_dict: dict[str, Any], llm_action: NegotiationAction) -> tuple[NegotiationAction, bool, float, float]:
        """Gates the LLM's proposed action.
        
        If the Q-value of the LLM's action is significantly worse than the best Q-value
        (by `self.threshold`), we override the LLM and take the DQN's best action.
        
        Returns:
            Tuple of (Final Action, overridden boolean, best_q, llm_q)
        """
        state_tensor = self.encode_state(state_dict)
        
        with torch.no_grad():
            q_values = self.q_network(state_tensor.unsqueeze(0)).squeeze(0)
            
        best_action_idx = torch.argmax(q_values).item()
        best_q = q_values[best_action_idx].item()
        llm_q = q_values[llm_action.value].item()
        
        if (best_q - llm_q) > self.threshold:
            logger.warning(
                f"DQN Override! LLM proposed {llm_action.name} (Q={llm_q:.2f}), "
                f"but DQN best is {NegotiationAction(best_action_idx).name} (Q={best_q:.2f})."
            )
            return NegotiationAction(best_action_idx), True, best_q, llm_q
            
        return llm_action, False, best_q, llm_q

    def save_checkpoint(self, path: str) -> None:
        """Save the model weights to disk."""
        torch.save(self.q_network.state_dict(), path)

    def load_checkpoint(self, path: str) -> None:
        """Load model weights from disk and compute hash."""
        import os, hashlib
        if not os.path.exists(path):
            raise FileNotFoundError(f"DQN checkpoint not found at {path}")
            
        self.q_network.load_state_dict(torch.load(path, weights_only=True))
        if self.mode == "INFERENCE":
            self.q_network.eval()
            
        # Compute SHA-256
        h = hashlib.sha256()
        with open(path, 'rb') as f:
            h.update(f.read())
        self.checkpoint_hash = h.hexdigest()

    def train_step(self, state_dict: dict[str, Any], action: NegotiationAction, reward: float, next_state_dict: dict[str, Any] | None, done: bool, gamma: float = 0.99) -> float:
        """Performs a single online Q-learning update step."""
        if self.mode != "TRAINING":
            raise RuntimeError("Cannot perform train_step while not in TRAINING mode.")
            
        self.q_network.train()
        
        state_tensor = self.encode_state(state_dict)
        q_values = self.q_network(state_tensor.unsqueeze(0))
        q_val = q_values[0, action.value]
        
        if done or next_state_dict is None:
            target = torch.tensor(reward, dtype=torch.float32)
        else:
            with torch.no_grad():
                next_state_tensor = self.encode_state(next_state_dict)
                next_q_values = self.q_network(next_state_tensor.unsqueeze(0))
                target = torch.tensor(reward + gamma * torch.max(next_q_values).item(), dtype=torch.float32)
                
        loss = F.mse_loss(q_val, target)
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        return loss.item()
