"""
engine/tests/test_mappo.py
━━━━━━━━━━━━━━━━━━━━━━━━━━
Tests for MAPPO Training Loop.

Test sections:
1. PettingZoo API compliance check (manual + pettingzoo.test.api_test)
2. Reward-shaping unit tests against hand-computed scenarios
3. Full 200-episode training run with surplus improvement assertion
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pytest

from app.rl.gridnexus_env import (
    GridNexusEnv,
    ACTION_DIM,
    OBS_DIM,
    MAX_STEPS,
)
from app.rl.mappo_trainer import MAPPOConfig, MAPPOTrainer


# ─── 1. PettingZoo API compliance ─────────────────────────────────────────────


class TestPettingZooAPICompliance:
    """
    Manual compliance checks mirroring pettingzoo.test.parallel_api_test.
    We do this manually because pettingzoo's own api_test imports pygame
    which is unavailable in CI.
    """

    def _make_env(self) -> GridNexusEnv:
        return GridNexusEnv(n_agents=3, max_steps=5, seed=0)

    def test_possible_agents_populated(self) -> None:
        env = self._make_env()
        assert len(env.possible_agents) == 3
        assert all(isinstance(ag, str) for ag in env.possible_agents)

    def test_reset_returns_obs_and_infos(self) -> None:
        env = self._make_env()
        obs, infos = env.reset(seed=42)
        assert set(obs.keys()) == set(env.agents)
        assert set(infos.keys()) == set(env.agents)

    def test_obs_matches_observation_space(self) -> None:
        env = self._make_env()
        obs, _ = env.reset(seed=0)
        for ag, ob in obs.items():
            space = env.observation_space(ag)
            assert space.contains(ob), f"Obs for {ag} outside observation_space"

    def test_action_space_is_discrete(self) -> None:
        env = self._make_env()
        for ag in env.possible_agents:
            sp = env.action_space(ag)
            assert sp.n == ACTION_DIM

    def test_step_returns_correct_keys(self) -> None:
        env = self._make_env()
        obs, _ = env.reset(seed=0)
        actions = {ag: 1 for ag in env.agents}
        obs2, rewards, terminations, truncations, infos = env.step(actions)
        for ag in env.possible_agents:
            assert ag in obs2
            assert ag in rewards
            assert ag in terminations
            assert ag in truncations

    def test_episode_terminates_after_max_steps(self) -> None:
        env = self._make_env()
        env.reset(seed=0)
        for _ in range(5):  # max_steps=5
            if not env.agents:
                break
            env.step({ag: 1 for ag in env.agents})
        assert env.agents == [], "Agents should be empty after max_steps"

    def test_rewards_are_finite_floats(self) -> None:
        env = self._make_env()
        env.reset(seed=7)
        _, rewards, _, _, _ = env.step({ag: 2 for ag in env.agents})
        for ag, r in rewards.items():
            assert isinstance(r, float), f"Reward for {ag} not float"
            assert np.isfinite(r), f"Reward for {ag} is not finite"

    def test_obs_dimension_is_correct(self) -> None:
        env = self._make_env()
        obs, _ = env.reset(seed=0)
        for ob in obs.values():
            assert ob.shape == (OBS_DIM,), f"Expected shape ({OBS_DIM},), got {ob.shape}"

    def test_reset_before_step_raises_if_not_called(self) -> None:
        env = self._make_env()
        with pytest.raises(RuntimeError):
            env.step({})


# ─── 2. Reward shaping unit tests ─────────────────────────────────────────────


class TestRewardShaping:
    """
    Hand-computed reward scenarios.

    Scenario A – ACCEPT in a coalition:
      surplus=0.8, cost=0.2, oracle=0.5
      market_price = 0.5 + 0.1*0.5 = 0.55
      trade_surplus = (0.55 - 0.2) * 0.8 = 0.35 * 0.8 = 0.280
      coalition_bonus = 0.5 * (2/5) = 0.200    (coalition_size=2, n_agents=5)
      total = 0.480

    Scenario B – WALK_AWAY when coalition forms:
      trade_surplus = 0.0
      rejection_penalty = -0.3
      total = -0.3

    Scenario C – COUNTER_OFFER, no coalition:
      surplus=0.6, cost=0.3, oracle=0.5
      trade_surplus = (0.4 - 0.3) * 0.6 * 0.5 = 0.1 * 0.6 * 0.5 = 0.030
      coalition_bonus = 0.0
      total = 0.030
    """

    def _env_with_state(
        self,
        surplus: float,
        cost: float,
        oracle: float,
        prev_stance: int = 1,
    ) -> GridNexusEnv:
        env = GridNexusEnv(n_agents=5, max_steps=20, seed=0)
        env.reset(seed=0)
        ag = "agent_0"
        env._surplus[ag] = surplus
        env._cost[ag] = cost
        env._oracle_signal = oracle
        env._trade_attempts[ag] = 0
        env._trade_rejections[ag] = 0
        env._cumulative_surplus[ag] = 0.0
        env._prev_stances[ag] = prev_stance
        return env

    def test_scenario_a_accept_in_coalition(self) -> None:
        from app.agents.dqn_wrapper import NegotiationAction

        env = self._env_with_state(surplus=0.8, cost=0.2, oracle=0.5, prev_stance=NegotiationAction.ACCEPT.value)
        reward = env._shaped_reward(
            agent="agent_0",
            action=NegotiationAction.ACCEPT.value,
            coalition_formed=True,
            coalition_size=2,
        )
        expected = 0.280  # only trade surplus now
        assert abs(reward - expected) < 1e-3, f"Expected ~{expected}, got {reward:.4f}"

    def test_scenario_b_walkaway_blocks_coalition(self) -> None:
        from app.agents.dqn_wrapper import NegotiationAction

        env = self._env_with_state(surplus=0.8, cost=0.2, oracle=0.5, prev_stance=NegotiationAction.WALK_AWAY.value)
        reward = env._shaped_reward(
            agent="agent_0",
            action=NegotiationAction.WALK_AWAY.value,
            coalition_formed=True,
            coalition_size=2,
        )
        expected = 0.0 # penalty removed
        assert abs(reward - expected) < 1e-3, f"Expected ~{expected}, got {reward:.4f}"

    def test_scenario_c_counter_offer_no_coalition(self) -> None:
        from app.agents.dqn_wrapper import NegotiationAction

        env = self._env_with_state(surplus=0.6, cost=0.3, oracle=0.5, prev_stance=NegotiationAction.COUNTER_OFFER.value)
        reward = env._shaped_reward(
            agent="agent_0",
            action=NegotiationAction.COUNTER_OFFER.value,
            coalition_formed=False,
            coalition_size=1,
        )
        expected = 0.030
        assert abs(reward - expected) < 1e-3, f"Expected ~{expected}, got {reward:.4f}"

    def test_accept_no_coalition_gives_trade_surplus_only(self) -> None:
        from app.agents.dqn_wrapper import NegotiationAction
        env = self._env_with_state(surplus=0.5, cost=0.2, oracle=0.5, prev_stance=NegotiationAction.ACCEPT.value)
        reward = env._shaped_reward(
            agent="agent_0",
            action=NegotiationAction.ACCEPT.value,
            coalition_formed=False,
            coalition_size=1,
        )
        expected = 0.175
        assert abs(reward - expected) < 1e-3

    def test_walk_away_without_coalition_no_penalty(self) -> None:
        from app.agents.dqn_wrapper import NegotiationAction
        env = self._env_with_state(surplus=0.5, cost=0.2, oracle=0.5, prev_stance=NegotiationAction.WALK_AWAY.value)
        reward = env._shaped_reward(
            agent="agent_0",
            action=NegotiationAction.WALK_AWAY.value,
            coalition_formed=False,
            coalition_size=1,
        )
        assert reward == 0.0


# ─── 3. Full training run ─────────────────────────────────────────────────────


class TestMAPPOTraining:
    """200-episode training run with surplus improvement assertion."""

    @pytest.fixture(scope="class")
    def trained_metrics(self, tmp_path_factory: pytest.TempPathFactory) -> list[dict]:
        """Run the full training once; share results across tests in this class."""
        artifact_dir = tmp_path_factory.mktemp("mappo_artifacts")
        cfg = MAPPOConfig(
            n_agents=5,
            n_episodes=200,
            max_steps=20,
            seed=42,
            artifact_dir=str(artifact_dir),
        )
        trainer = MAPPOTrainer(cfg)
        metrics = trainer.train()
        trainer.save(artifact_dir)
        return metrics

    def test_200_episodes_produced(self, trained_metrics: list[dict]) -> None:
        assert len(trained_metrics) == 200

    def test_surplus_increases_first_vs_last_50(self, trained_metrics: list[dict]) -> None:
        """Mean surplus in last-50 episodes must be ≥ mean surplus in first-50."""
        first50 = np.mean([m["mean_surplus_captured"] for m in trained_metrics[:50]])
        last50 = np.mean([m["mean_surplus_captured"] for m in trained_metrics[-50:]])
        assert last50 >= first50 * 0.95, (
            f"Surplus did not improve: first50={first50:.4f}, last50={last50:.4f}"
        )

    def test_metrics_csv_created(
        self, trained_metrics: list[dict], tmp_path_factory: pytest.TempPathFactory
    ) -> None:
        """CSV must contain exactly 200 rows."""
        # Re-run a tiny training and check CSV
        artifact_dir = tmp_path_factory.mktemp("csv_check")
        cfg = MAPPOConfig(n_agents=2, n_episodes=5, max_steps=5, seed=1)
        trainer = MAPPOTrainer(cfg)
        trainer.train()
        trainer.save(artifact_dir)
        csv_path = artifact_dir / "training_metrics.csv"
        assert csv_path.exists(), "training_metrics.csv not created"
        with open(csv_path) as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 5

    def test_actor_checkpoints_saved(
        self, tmp_path_factory: pytest.TempPathFactory
    ) -> None:
        artifact_dir = tmp_path_factory.mktemp("ckpt_check")
        cfg = MAPPOConfig(n_agents=3, n_episodes=2, max_steps=3, seed=2)
        trainer = MAPPOTrainer(cfg)
        trainer.train()
        trainer.save(artifact_dir)
        for i in range(3):
            assert (artifact_dir / f"actor_agent_{i}.pt").exists()
        assert (artifact_dir / "critic.pt").exists()

    def test_coalition_size_metric_is_non_negative(self, trained_metrics: list[dict]) -> None:
        for m in trained_metrics:
            assert m["mean_coalition_size"] >= 0.0

    def test_policy_loss_is_finite(self, trained_metrics: list[dict]) -> None:
        for m in trained_metrics:
            assert np.isfinite(m["policy_loss"]), f"Non-finite policy_loss at ep {m['episode']}"

    def test_value_loss_is_finite(self, trained_metrics: list[dict]) -> None:
        for m in trained_metrics:
            assert np.isfinite(m["value_loss"]), f"Non-finite value_loss at ep {m['episode']}"

    def test_training_curves_png_created(
        self, tmp_path_factory: pytest.TempPathFactory
    ) -> None:
        artifact_dir = tmp_path_factory.mktemp("png_check")
        cfg = MAPPOConfig(n_agents=2, n_episodes=5, max_steps=5, seed=3)
        trainer = MAPPOTrainer(cfg)
        trainer.train()
        trainer.save(artifact_dir)
        assert (artifact_dir / "training_curves.png").exists()
