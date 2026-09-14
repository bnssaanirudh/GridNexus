"""
engine/app/rl/mappo_trainer.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From-scratch MAPPO (Multi-Agent PPO with Centralised Critic).

Implementation choice: from-scratch PyTorch rather than RLlib.
Rationale: RLlib adds ~1 GB of ray dependencies; our existing torch install
is sufficient. A hand-rolled implementation is also fully auditable and
requires no external config files.

Architecture:
  - Decentralised actors: one Actor MLP per agent (obs_dim → ACTION_DIM)
  - Centralised critic: one shared Critic MLP (n_agents * obs_dim → 1)
  - PPO clip objective with GAE(λ) advantage estimation

Metrics logged per episode:
  - policy_loss   (mean over agents and update epochs)
  - value_loss    (from the centralised critic)
  - mean_coalition_size    (fraction of episodes where ≥2 agents cooperated)
  - mean_surplus_captured  (mean per-agent cumulative surplus at episode end)
"""

from __future__ import annotations

import csv
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical

from app.rl.gridnexus_env import GridNexusEnv, OBS_DIM, ACTION_DIM

logger = logging.getLogger(__name__)

# ─── Hyper-parameters ─────────────────────────────────────────────────────────


@dataclass
class MAPPOConfig:
    """Training hyper-parameters."""
    n_agents: int = 5
    n_episodes: int = 200
    max_steps: int = 20
    lr_actor: float = 3e-4
    lr_critic: float = 1e-3
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_eps: float = 0.2
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    update_epochs: int = 4
    minibatch_size: int = 64
    hidden_dim: int = 64
    seed: int = 42
    artifact_dir: str = "artifacts/mappo"


# ─── Neural networks ──────────────────────────────────────────────────────────


class Actor(nn.Module):
    """Decentralised actor: maps local observation → action logits."""

    def __init__(self, obs_dim: int, action_dim: int, hidden_dim: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, action_dim),
        )

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        return self.net(obs)

    def get_dist(self, obs: torch.Tensor) -> Categorical:
        logits = self.forward(obs)
        return Categorical(logits=logits)


class CentralCritic(nn.Module):
    """Centralised critic: maps global state → value scalar."""

    def __init__(self, global_obs_dim: int, hidden_dim: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(global_obs_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, global_obs: torch.Tensor) -> torch.Tensor:
        return self.net(global_obs).squeeze(-1)


# ─── Rollout buffer ────────────────────────────────────────────────────────────


@dataclass
class RolloutBuffer:
    """Stores one episode's worth of transitions."""
    obs: list[dict[str, np.ndarray]] = field(default_factory=list)
    actions: list[dict[str, int]] = field(default_factory=list)
    log_probs: list[dict[str, float]] = field(default_factory=list)
    rewards: list[dict[str, float]] = field(default_factory=list)
    dones: list[bool] = field(default_factory=list)
    global_obs: list[np.ndarray] = field(default_factory=list)

    def clear(self) -> None:
        self.obs.clear()
        self.actions.clear()
        self.log_probs.clear()
        self.rewards.clear()
        self.dones.clear()
        self.global_obs.clear()

    def __len__(self) -> int:
        return len(self.rewards)


# ─── Trainer ──────────────────────────────────────────────────────────────────


class MAPPOTrainer:
    """
    Multi-Agent PPO trainer with centralised critic.

    Usage
    -----
    trainer = MAPPOTrainer(MAPPOConfig())
    metrics = trainer.train()
    trainer.save(Path("artifacts/mappo"))
    """

    def __init__(self, cfg: MAPPOConfig) -> None:
        self.cfg = cfg
        torch.manual_seed(cfg.seed)
        np.random.seed(cfg.seed)

        self.env = GridNexusEnv(
            n_agents=cfg.n_agents,
            max_steps=cfg.max_steps,
            seed=cfg.seed,
        )
        agents = self.env.possible_agents

        # One actor per agent
        self.actors: dict[str, Actor] = {
            ag: Actor(OBS_DIM, ACTION_DIM, cfg.hidden_dim) for ag in agents
        }
        # Single centralised critic
        global_obs_dim = self.env.state_space().shape[0]
        self.critic = CentralCritic(global_obs_dim, cfg.hidden_dim)

        self.actor_optims: dict[str, torch.optim.Adam] = {
            ag: torch.optim.Adam(self.actors[ag].parameters(), lr=cfg.lr_actor)
            for ag in agents
        }
        self.critic_optim = torch.optim.Adam(
            self.critic.parameters(), lr=cfg.lr_critic
        )

        self.buffer = RolloutBuffer()
        self.metrics: list[dict[str, float]] = []

    # ── Training loop ─────────────────────────────────────────────────────────

    def train(self) -> list[dict[str, float]]:
        """
        Run n_episodes of training.

        Returns
        -------
        list[dict]
            Per-episode metric dicts with keys:
            episode, policy_loss, value_loss,
            mean_coalition_size, mean_surplus_captured.
        """
        logger.info("Starting MAPPO training for %d episodes.", self.cfg.n_episodes)
        t0 = time.time()

        for ep in range(1, self.cfg.n_episodes + 1):
            ep_metrics = self._run_episode(ep)
            self.metrics.append(ep_metrics)

            if ep % 20 == 0 or ep == 1:
                logger.info(
                    "Ep %d/%d | policy_loss=%.4f | value_loss=%.4f | "
                    "coalition_size=%.2f | surplus=%.4f",
                    ep,
                    self.cfg.n_episodes,
                    ep_metrics["policy_loss"],
                    ep_metrics["value_loss"],
                    ep_metrics["mean_coalition_size"],
                    ep_metrics["mean_surplus_captured"],
                )

        elapsed = time.time() - t0
        logger.info("Training complete in %.1fs.", elapsed)
        return self.metrics

    def _run_episode(self, episode: int) -> dict[str, float]:
        """Collect one episode of experience and update networks."""
        self.buffer.clear()
        obs_dict, _ = self.env.reset()

        # Episode accumulators
        coalition_sizes: list[float] = []
        total_surpluses: list[float] = []

        while self.env.agents:
            global_obs = self.env.state()

            # Sample actions from each actor
            actions: dict[str, int] = {}
            log_probs: dict[str, float] = {}
            for ag in self.env.agents:
                obs_t = torch.FloatTensor(obs_dict[ag])
                dist = self.actors[ag].get_dist(obs_t.unsqueeze(0))
                act = dist.sample()
                actions[ag] = int(act.item())
                log_probs[ag] = float(dist.log_prob(act).item())

            next_obs, rewards, terminations, truncations, infos = self.env.step(actions)

            # Record coalition metrics from first agent's info
            first_info = next(iter(infos.values()), {})
            coalition_sizes.append(float(first_info.get("coalition_size", 0)))

            done = all(terminations.values())

            self.buffer.obs.append(obs_dict)
            self.buffer.actions.append(actions)
            self.buffer.log_probs.append(log_probs)
            self.buffer.rewards.append(rewards)
            self.buffer.dones.append(done)
            self.buffer.global_obs.append(global_obs)

            obs_dict = next_obs

        # Surplus captured = mean cumulative surplus across agents
        for ag in self.env.possible_agents:
            total_surpluses.append(self.env._cumulative_surplus.get(ag, 0.0))

        policy_loss, value_loss = self._update()

        return {
            "episode": float(episode),
            "policy_loss": policy_loss,
            "value_loss": value_loss,
            "mean_coalition_size": float(np.mean(coalition_sizes)),
            "mean_surplus_captured": float(np.mean(total_surpluses)),
        }

    # ── PPO update ────────────────────────────────────────────────────────────

    def _update(self) -> tuple[float, float]:
        """Compute GAE advantages and run PPO update epochs."""
        buf = self.buffer
        T = len(buf)
        agents = self.env.possible_agents

        # ── Compute returns and advantages via GAE ─────────────────────────
        # Bootstrap value at episode end = 0 (terminal)
        advantages: dict[str, list[float]] = {ag: [] for ag in agents}
        returns: dict[str, list[float]] = {ag: [] for ag in agents}

        for ag in agents:
            gae = 0.0
            ag_adv: list[float] = []
            ag_ret: list[float] = []

            # Use centralised critic for value estimates
            global_obs_tensors = torch.FloatTensor(
                np.stack(buf.global_obs)
            )
            with torch.no_grad():
                values = self.critic(global_obs_tensors).numpy()

            next_value = 0.0
            for t in reversed(range(T)):
                reward = buf.rewards[t].get(ag, 0.0)
                done = buf.dones[t]
                value = float(values[t])
                next_val = next_value if not done else 0.0
                delta = reward + self.cfg.gamma * next_val - value
                gae = delta + self.cfg.gamma * self.cfg.gae_lambda * (0 if done else gae)
                ag_adv.insert(0, gae)
                ag_ret.insert(0, gae + value)
                next_value = value

            advantages[ag] = ag_adv
            returns[ag] = ag_ret

        # ── Flatten data for minibatch updates ─────────────────────────────
        all_obs: dict[str, torch.Tensor] = {}
        all_acts: dict[str, torch.Tensor] = {}
        all_old_lp: dict[str, torch.Tensor] = {}
        all_adv: dict[str, torch.Tensor] = {}
        all_ret: dict[str, torch.Tensor] = {}

        for ag in agents:
            all_obs[ag] = torch.FloatTensor(
                np.stack([buf.obs[t].get(ag, np.zeros(OBS_DIM, dtype=np.float32))
                          for t in range(T)])
            )
            all_acts[ag] = torch.LongTensor(
                [buf.actions[t].get(ag, 1) for t in range(T)]
            )
            all_old_lp[ag] = torch.FloatTensor(
                [buf.log_probs[t].get(ag, 0.0) for t in range(T)]
            )
            adv_t = torch.FloatTensor(advantages[ag])
            # Normalise advantages per-agent
            adv_t = (adv_t - adv_t.mean()) / (adv_t.std() + 1e-8)
            all_adv[ag] = adv_t
            all_ret[ag] = torch.FloatTensor(returns[ag])

        global_obs_t = torch.FloatTensor(np.stack(buf.global_obs))

        total_policy_loss = 0.0
        total_value_loss = 0.0
        n_updates = 0

        for _ in range(self.cfg.update_epochs):
            idxs = np.random.permutation(T)
            for start in range(0, T, self.cfg.minibatch_size):
                mb = idxs[start: start + self.cfg.minibatch_size]
                if len(mb) == 0:
                    continue
                mb_t = torch.LongTensor(mb)

                # ── Critic update ──────────────────────────────────────────
                mb_global = global_obs_t[mb_t]
                mb_ret_mean = torch.stack(
                    [all_ret[ag][mb_t] for ag in agents]
                ).mean(dim=0)

                pred_values = self.critic(mb_global)
                value_loss = F.mse_loss(pred_values, mb_ret_mean)

                self.critic_optim.zero_grad()
                (self.cfg.value_coef * value_loss).backward()
                nn.utils.clip_grad_norm_(self.critic.parameters(), 0.5)
                self.critic_optim.step()

                # ── Actor updates (per-agent) ──────────────────────────────
                ep_policy_loss = 0.0
                for ag in agents:
                    mb_obs = all_obs[ag][mb_t]
                    mb_act = all_acts[ag][mb_t]
                    mb_old_lp = all_old_lp[ag][mb_t]
                    mb_adv = all_adv[ag][mb_t]

                    dist = self.actors[ag].get_dist(mb_obs)
                    new_lp = dist.log_prob(mb_act)
                    entropy = dist.entropy().mean()

                    ratio = torch.exp(new_lp - mb_old_lp)
                    surr1 = ratio * mb_adv
                    surr2 = torch.clamp(ratio, 1 - self.cfg.clip_eps, 1 + self.cfg.clip_eps) * mb_adv
                    actor_loss = -torch.min(surr1, surr2).mean()
                    loss = actor_loss - self.cfg.entropy_coef * entropy

                    self.actor_optims[ag].zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(self.actors[ag].parameters(), 0.5)
                    self.actor_optims[ag].step()
                    ep_policy_loss += actor_loss.item()

                total_policy_loss += ep_policy_loss / len(agents)
                total_value_loss += value_loss.item()
                n_updates += 1

        avg_pl = total_policy_loss / max(n_updates, 1)
        avg_vl = total_value_loss / max(n_updates, 1)
        return avg_pl, avg_vl

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, artifact_dir: Path) -> None:
        """
        Save actor checkpoints, metrics CSV, and training curve PNG.

        Parameters
        ----------
        artifact_dir : Path
            Directory to write artifacts into (created if absent).
        """
        artifact_dir.mkdir(parents=True, exist_ok=True)

        # Actor checkpoints
        for ag, actor in self.actors.items():
            ckpt_path = artifact_dir / f"actor_{ag}.pt"
            torch.save(actor.state_dict(), ckpt_path)
        torch.save(self.critic.state_dict(), artifact_dir / "critic.pt")
        logger.info("Saved checkpoints to %s", artifact_dir)

        # Metrics CSV
        csv_path = artifact_dir / "training_metrics.csv"
        if self.metrics:
            with open(csv_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=self.metrics[0].keys())
                writer.writeheader()
                writer.writerows(self.metrics)
        logger.info("Saved metrics CSV to %s", csv_path)

        # Static training curve plot
        self._plot_curves(artifact_dir)

    def _plot_curves(self, artifact_dir: Path) -> None:
        """Export static PNG training curves (no live TensorBoard required)."""
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            logger.warning("matplotlib not available; skipping plot export.")
            return

        if not self.metrics:
            return

        episodes = [m["episode"] for m in self.metrics]
        policy_losses = [m["policy_loss"] for m in self.metrics]
        value_losses = [m["value_loss"] for m in self.metrics]
        coalition_sizes = [m["mean_coalition_size"] for m in self.metrics]
        surpluses = [m["mean_surplus_captured"] for m in self.metrics]

        fig, axes = plt.subplots(2, 2, figsize=(12, 8))
        fig.suptitle("MAPPO Training – GridNexus (5 Agents, 200 Episodes)", fontsize=13)

        def smooth(vals: list[float], w: int = 10) -> list[float]:
            if len(vals) < w:
                return vals
            return [
                float(np.mean(vals[max(0, i - w): i + 1]))
                for i in range(len(vals))
            ]

        ax = axes[0, 0]
        ax.plot(episodes, policy_losses, alpha=0.3, color="steelblue")
        ax.plot(episodes, smooth(policy_losses), color="steelblue", lw=2)
        ax.set_title("Policy Loss")
        ax.set_xlabel("Episode")
        ax.set_ylabel("Loss")

        ax = axes[0, 1]
        ax.plot(episodes, value_losses, alpha=0.3, color="darkorange")
        ax.plot(episodes, smooth(value_losses), color="darkorange", lw=2)
        ax.set_title("Value Loss")
        ax.set_xlabel("Episode")
        ax.set_ylabel("Loss")

        ax = axes[1, 0]
        ax.plot(episodes, coalition_sizes, alpha=0.3, color="forestgreen")
        ax.plot(episodes, smooth(coalition_sizes), color="forestgreen", lw=2)
        ax.set_title("Mean Coalition Size")
        ax.set_xlabel("Episode")
        ax.set_ylabel("Agents in coalition")

        ax = axes[1, 1]
        ax.plot(episodes, surpluses, alpha=0.3, color="crimson")
        ax.plot(episodes, smooth(surpluses), color="crimson", lw=2)
        ax.set_title("Mean Surplus Captured")
        ax.set_xlabel("Episode")
        ax.set_ylabel("Cumulative surplus")

        plt.tight_layout()
        plot_path = artifact_dir / "training_curves.png"
        plt.savefig(plot_path, dpi=150)
        plt.close(fig)
        logger.info("Saved training curves to %s", plot_path)
