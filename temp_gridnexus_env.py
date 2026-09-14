"""
engine/app/rl/gridnexus_env.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PettingZoo ParallelEnv implementing the GridNexus multi-agent negotiation
environment.

Design decisions (recorded in docs/ASSUMPTIONS.md §):
- Parallel API (all agents act simultaneously) is used instead of AEC
  because MAPPO's centralised critic requires all agents' observations at
  every timestep.
- Oracle signal is a placeholder scalar [0, 1] representing grid-stress.
   will replace this with a real LangChain-based oracle call.
- The episode ends after MAX_STEPS rounds.
- MAPPO now chooses genuine negotiation actions (ACCEPT, COUNTER_OFFER, WALK_AWAY, JOIN, LEAVE).
- Rewards are strictly utility-driven (trade surplus) with no arbitrary bonuses.
- **Privacy Update (MAPPO)**: The `state()` method now masks private cost/surplus curves to ensure the centralized critic is privacy-preserving.
"""

from __future__ import annotations

import functools
import os
from typing import Any

import numpy as np
import gymnasium
from gymnasium import spaces
from pettingzoo import ParallelEnv

from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction
from app.data.india_spectral_tmy import IndiaSpectralTMYDataset
from app.oracle.llm_oracle import fetch_weather_and_predict_stress
from app.rl.forecasting import get_forecast_error




# ─── Constants ────────────────────────────────────────────────────────────────

MAX_STEPS: int = 20
"""Maximum negotiation rounds per episode."""

OBS_DIM: int = 10
"""
Observation vector layout (per agent):
  [0]  own_surplus          – normalised available surplus  [0, 1]
  [1]  own_cost             – normalised generation cost    [0, 1]
  [2]  round_frac           – current_round / MAX_STEPS     [0, 1]
  [3]  oracle_signal        – placeholder grid-stress       [0, 1]
  [4]  coalition_size_frac  – (agents in coalition-1)/N     [0, 1]
  [5]  peer_coop_rate       – fraction of peers cooperative last step [0,1]
  [6]  peer_aggr_rate       – fraction of peers aggressive last step  [0,1]
  [7]  own_prev_stance      – one-hot-like: 0=aggressive, 0.5=neutral, 1=coop
  [8]  own_cumulative_surplus – cumulative surplus captured so far     [0, ∞]
  [9]  rejection_rate       – own trade rejection fraction so far      [0, 1]
"""

ACTION_DIM: int = 5
"""Genuine Negotiation Actions:
0 = ACCEPT
1 = COUNTER_OFFER
2 = WALK_AWAY
3 = JOIN (coalition)
4 = LEAVE (coalition)
"""

# ─── Environment ──────────────────────────────────────────────────────────────


class GridNexusEnv(ParallelEnv):
    """
    PettingZoo ParallelEnv for GridNexus multi-agent power negotiation.

    Each agent represents a microgrid prosumer with private surplus and cost.
    Agents simultaneously choose a negotiation stance each round; a coalition
    forms when ≥2 agents cooperate in the same step.

    Parameters
    ----------
    n_agents : int
        Number of microgrid agents (default 5).
    max_steps : int
        Episode horizon in negotiation rounds (default 20).
    seed : int | None
        RNG seed for reproducibility.
    """

    metadata: dict[str, Any] = {"name": "gridnexus_v0", "render_modes": []}

    def __init__(
        self,
        n_agents: int = 5,
        max_steps: int = MAX_STEPS,
        seed: int | None = None,
    ) -> None:
        super().__init__()
        self.n_agents = n_agents
        self.max_steps = max_steps
        self._rng = np.random.default_rng(seed)

        self.possible_agents: list[str] = [f"agent_{i}" for i in range(n_agents)]
        self.agents: list[str] = []

        # Per-agent DQN wrappers are removed as MAPPO now acts directly.

        # Private per-agent parameters (re-sampled each reset)
        self._surplus: dict[str, float] = {}
        self._cost: dict[str, float] = {}

        # Episode state
        self._step: int = 0
        self._prev_stances: dict[str, int] = {}
        self._cumulative_surplus: dict[str, float] = {}
        self._trade_attempts: dict[str, int] = {}
        self._trade_rejections: dict[str, int] = {}
        self._oracle_signal: float = 0.5
        self._india_tmy = IndiaSpectralTMYDataset()
        self._tmy_latitude = float(os.getenv("INDIA_TMY_LATITUDE", "20.5937"))
        self._tmy_longitude = float(os.getenv("INDIA_TMY_LONGITUDE", "78.9629"))

    # ── Spaces ────────────────────────────────────────────────────────────────

    @functools.lru_cache(maxsize=None)
    def observation_space(self, agent: str) -> spaces.Box:
        """Continuous observation space of shape (OBS_DIM,)."""
        low = np.zeros(OBS_DIM, dtype=np.float32)
        high = np.ones(OBS_DIM, dtype=np.float32)
        high[8] = np.inf   # cumulative surplus is unbounded
        return spaces.Box(low=low, high=high, dtype=np.float32)

    @functools.lru_cache(maxsize=None)
    def state_space(self) -> spaces.Box:
        """Global state space for Centralized Critic (masked for privacy)."""
        # State dimension: (round_frac, oracle_signal, coalition_size_frac) + n_agents * (action)
        dim = 3 + self.n_agents
        return spaces.Box(low=0.0, high=1.0, shape=(dim,), dtype=np.float32)

    @functools.lru_cache(maxsize=None)
    def action_space(self, agent: str) -> spaces.Discrete:
        """Discrete negotiation actions."""
        return spaces.Discrete(ACTION_DIM)

    # ── Reset ─────────────────────────────────────────────────────────────────

    def reset(
        self,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[dict[str, np.ndarray], dict[str, dict]]:
        """Reset the environment to a fresh episode."""
        if seed is not None:
            self._rng = np.random.default_rng(seed)

        self.agents = list(self.possible_agents)
        self._step = 0
        
        # Real-time RAG Oracle Integration
        if self._india_tmy.available:
            tmy_hour = int(self._rng.integers(0, self._india_tmy.HOURS_PER_YEAR))
            tmy_sample = self._india_tmy.sample(
                tmy_hour, self._tmy_latitude, self._tmy_longitude
            )
            if tmy_sample.air_temperature_c > 0:
                temp = tmy_sample.air_temperature_c
                cloud = tmy_sample.diffuse_fraction * 100
            else:
                temp = float(self._rng.uniform(15, 35))
                cloud = float(self._rng.uniform(0, 100))
        else:
            temp = float(self._rng.uniform(15, 35))
            cloud = float(self._rng.uniform(0, 100))
        oracle_pred = fetch_weather_and_predict_stress(temp, cloud)
        self._oracle_signal = float(oracle_pred.get("stress_index", 0.5))

        # Re-sample private parameters
        for ag in self.agents:
            self._surplus[ag] = float(self._rng.uniform(0.3, 1.0))
            self._cost[ag] = float(self._rng.uniform(0.1, 0.5))
            self._prev_stances[ag] = 1  # start neutral
            self._cumulative_surplus[ag] = 0.0
            self._trade_attempts[ag] = 0
            self._trade_rejections[ag] = 0

        obs = {ag: self._observe(ag) for ag in self.agents}
        infos: dict[str, dict] = {ag: {} for ag in self.agents}
        return obs, infos

    # ── Step ──────────────────────────────────────────────────────────────────

    def step(
        self, actions: dict[str, int]
    ) -> tuple[
        dict[str, np.ndarray],
        dict[str, float],
        dict[str, bool],
        dict[str, bool],
        dict[str, dict],
    ]:
        """
        Advance the environment one negotiation round.

        For each agent the chosen action is a direct negotiation strategy.
        A coalition forms when ≥2 agents are in JOIN state.
        Reward is shaped strictly by trade surplus captured.
        """
        if not self.agents:
            raise RuntimeError("Call reset() before step().")

        self._step += 1

        # ── 1. Apply actions ──────────────────────────────────────────────
        for ag in self.agents:
            action = int(actions.get(ag, 1))
            self._prev_stances[ag] = action # track their action instead of stance

        # ── 2. Determine coalition ────────────────────────────────────────
        joined_agents = [
            ag for ag, action in self._prev_stances.items() if action == 3 or action == 0 # JOIN or ACCEPT
        ]
        coalition_formed = len(joined_agents) >= 2
        coalition_size = len(joined_agents) if coalition_formed else 0

        # ── 3. Compute rewards ────────────────────────────────────────────
        rewards: dict[str, float] = {}
        physical_costs: dict[str, float] = {}
        stability_costs: dict[str, float] = {}
        for ag in self.agents:
            action = int(actions.get(ag, 1))
            reward, p_cost, s_cost = self._shaped_reward(
                ag, action, coalition_formed, coalition_size
            )
            rewards[ag] = reward
            physical_costs[ag] = p_cost
            stability_costs[ag] = s_cost

        # ── 4. Termination ────────────────────────────────────────────────
        done = self._step >= self.max_steps
        terminations = {ag: done for ag in self.agents}
        truncations = {ag: False for ag in self.agents}

        if done:
            self.agents = []

        # ── 5. Observations & infos ───────────────────────────────────────
        obs = {ag: self._observe(ag) for ag in (
            self.agents if self.agents else list(self.possible_agents)
        )}
        infos: dict[str, dict] = {
            ag: {
                "coalition_formed": coalition_formed,
                "coalition_size": coalition_size,
                "action": int(actions.get(ag, 1)),
                "physical_cost": physical_costs.get(ag, 0.0),
                "stability_cost": stability_costs.get(ag, 0.0),
            }
            for ag in obs
        }
        return obs, rewards, terminations, truncations, infos

    # ── Private helpers ───────────────────────────────────────────────────────

    def _shaped_reward(
        self,
        agent: str,
        action: int,
        coalition_formed: bool,
        coalition_size: int,
    ) -> tuple[float, float, float]:
        """
        Utility-driven reward shaping:
        - Trade surplus: reward for ACCEPT relative to own surplus and cost.
        - Switching costs applied when action changes from previous.
        - Grid constraints and blocking coalition penalties via oracle.
        """
        surplus = self._surplus[agent]
        cost = self._cost[agent]
        
        switching_cost = 0.05 if self._prev_stances.get(agent, 1) != action else 0.0
        blocking_penalty = 0.5 if (self._oracle_signal > 0.8 and coalition_formed) else 0.0

        # Base trade surplus
        if action == 0: # ACCEPT
            market_price = 0.5 + 0.1 * self._oracle_signal
            trade_surplus = max(0.0, (market_price - cost) * surplus)
            self._cumulative_surplus[agent] += trade_surplus
            self._trade_attempts[agent] += 1
        elif action == 1: # COUNTER_OFFER
            trade_surplus = max(0.0, (0.4 - cost) * surplus * 0.5)
            self._trade_attempts[agent] += 1
        else:  # WALK_AWAY, JOIN, LEAVE
            trade_surplus = 0.0
            if action == 2: # WALK_AWAY
                self._trade_rejections[agent] += 1

        # Simulate physical safety cost (e.g. overvoltage/thermal limit risk)
        physical_cost = 0.2 if (action == 0 and self._oracle_signal > 0.7) else 0.0
        
        # Simulate coalition instability cost (e.g. epsilon-core excess)
        stability_cost = blocking_penalty

        reward = float(trade_surplus - switching_cost - physical_cost - stability_cost)
        return reward, physical_cost, stability_cost

    def _observe(self, agent: str) -> np.ndarray:
        """Construct the observation vector for *agent*."""
        other_stances = [
            self._prev_stances[ag]
            for ag in self.possible_agents
            if ag != agent
        ]
        n_peers = max(len(other_stances), 1)
        peer_coop_rate = sum(1 for s in other_stances if s == 3 or s == 0) / n_peers
        peer_aggr_rate = sum(1 for s in other_stances if s == 2 or s == 4) / n_peers

        coalition_agents_count = sum(
            1 for s in self._prev_stances.values() if s == 3 or s == 0
        )
        coalition_formed = coalition_agents_count >= 2
        coalition_size_frac = (
            (coalition_agents_count - 1) / max(self.n_agents - 1, 1)
            if coalition_formed
            else 0.0
        )

        attempts = max(self._trade_attempts[agent], 1)
        rejection_rate = self._trade_rejections[agent] / attempts

        # Inject forecasting error noise to observed surplus and cost
        forecast_surplus = get_forecast_error(self._surplus[agent], std_dev=0.05)
        forecast_cost = get_forecast_error(self._cost[agent], std_dev=0.05)

        obs = np.array([
            forecast_surplus,                              # [0]
            forecast_cost,                                 # [1]
            self._step / self.max_steps,                   # [2]
            self._oracle_signal,                           # [3]
            coalition_size_frac,                           # [4]
            peer_coop_rate,                                # [5]
            peer_aggr_rate,                                # [6]
            self._prev_stances[agent] / 4.0,               # [7] Normalized action space 0-4
            self._cumulative_surplus[agent],               # [8]
            rejection_rate,                                # [9]
        ], dtype=np.float32)

        return obs

    def state(self) -> np.ndarray:
        """
        Global state for Centralized Critic.
        Strictly masks private parameters (surplus, cost) to guarantee data privacy.
        """
        coalition_agents_count = sum(1 for s in self._prev_stances.values() if s in [0, 3])
        coalition_size_frac = (coalition_agents_count) / max(self.n_agents, 1)
        
        global_features = [
            self._step / self.max_steps,
            self._oracle_signal,
            coalition_size_frac
        ]
        
        public_actions = [self._prev_stances.get(ag, 1) / 4.0 for ag in self.possible_agents]
        
        return np.array(global_features + public_actions, dtype=np.float32)

    def render(self) -> None:
        """No-op renderer; use TensorBoard metrics instead."""
        pass
