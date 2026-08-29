"""
engine/app/agents/replay_buffer.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Experience replay ring buffer for Deep Q-Network training.
"""

import random
from collections import deque
from typing import Any


class ReplayBuffer:
    """Experience replay ring buffer.
    
    Stores transitions: (state, action, reward, next_state, done).
    """

    def __init__(self, capacity: int = 10000):
        self.capacity = capacity
        self.buffer: deque[tuple[Any, int, float, Any, bool]] = deque(maxlen=capacity)

    def push(self, state: Any, action: int, reward: float, next_state: Any, done: bool) -> None:
        """Add a new experience to the buffer."""
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size: int) -> list[tuple[Any, int, float, Any, bool]]:
        """Sample a batch of experiences uniformly at random."""
        return random.sample(self.buffer, min(batch_size, len(self.buffer)))

    def __len__(self) -> int:
        return len(self.buffer)
