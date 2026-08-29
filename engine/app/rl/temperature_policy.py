"""
engine/app/rl/temperature_policy.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dynamic Temperature Adjustment Policy for LLM Negotiators.

Adjusts an agent's LLM temperature up (for exploration) or down (for exploitation)
based on a rolling window of its profit-linked rewards. Also re-calibrates the
QRE lambda parameter to match the new temperature.
"""

import collections
import logging
from app.qre.calibration import get_calibrated_lambda

logger = logging.getLogger(__name__)


class TemperaturePolicy:
    def __init__(
        self,
        window_size: int = 10,
        low_threshold: float = 0.2,
        high_threshold: float = 1.0,
        step: float = 0.05,
        min_temp: float = 0.1,
        max_temp: float = 2.0,
        hysteresis_factor: float = 0.5
    ):
        self.window_size = window_size
        self.history = collections.deque(maxlen=window_size)
        self.temperature = 1.0
        self.qre_lambda = get_calibrated_lambda(self.temperature)
        self.low_threshold = low_threshold
        self.high_threshold = high_threshold
        self.step = step
        self.min_temp = min_temp
        self.max_temp = max_temp
        
        # Hysteresis to prevent bounded oscillation
        # If we reverse direction, we dampen the step size.
        self.trend = 0  # 1 for increasing, -1 for decreasing, 0 for stable
        self.hysteresis_factor = hysteresis_factor

    def update_temperature(self, reward: float) -> tuple[float, float]:
        """
        Adds a reward to the rolling window and potentially updates the temperature.

        Returns:
            Tuple of (new_temperature, new_qre_lambda)
        """
        self.history.append(reward)

        if len(self.history) < self.window_size:
            return self.temperature, self.qre_lambda

        mean_reward = sum(self.history) / len(self.history)
        
        if mean_reward < self.low_threshold:
            # Low reward -> Increase temperature (Explore)
            current_step = self.step
            if self.trend == -1:
                # Reversing direction
                current_step *= self.hysteresis_factor
                
            new_temp = min(self.max_temp, self.temperature + current_step)
            if new_temp > self.temperature:
                self.trend = 1
                self.temperature = new_temp
                self.qre_lambda = get_calibrated_lambda(self.temperature)
                logger.info(f"Low reward ({mean_reward:.2f}). Increasing temperature to {self.temperature:.2f} (lambda={self.qre_lambda:.2f})")
                
        elif mean_reward > self.high_threshold:
            # High reward -> Decrease temperature (Exploit)
            current_step = self.step
            if self.trend == 1:
                # Reversing direction
                current_step *= self.hysteresis_factor
                
            new_temp = max(self.min_temp, self.temperature - current_step)
            if new_temp < self.temperature:
                self.trend = -1
                self.temperature = new_temp
                self.qre_lambda = get_calibrated_lambda(self.temperature)
                logger.info(f"High reward ({mean_reward:.2f}). Decreasing temperature to {self.temperature:.2f} (lambda={self.qre_lambda:.2f})")
        else:
            self.trend = 0
            
        return self.temperature, self.qre_lambda
