"""
engine/app/rl/ippo_trainer.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Independent PPO (IPPO) baseline.

Unlike MAPPO, IPPO uses a completely decentralised approach where each agent
learns its own policy and its own value function, relying only on its local
observation without any access to the global masked state.
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
from app.rl.mappo_trainer import Actor

logger = logging.getLogger(__name__)

# ─── Hyper-parameters ─────────────────────────────────────────────────────────

@dataclass
class IPPOConfig:
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
    artifact_dir: str = "artifacts/ippo"


# ─── Neural networks ──────────────────────────────────────────────────────────

class LocalCritic(nn.Module):
    """Decentralised critic: maps local obs → value scalar."""
    def __init__(self, obs_dim: int, hidden_dim: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        return self.net(obs).squeeze(-1)


# ─── Rollout buffer ────────────────────────────────────────────────────────────

@dataclass
class RolloutBuffer:
    obs: list[dict[str, np.ndarray]] = field(default_factory=list)
    actions: list[dict[str, int]] = field(default_factory=list)
    log_probs: list[dict[str, float]] = field(default_factory=list)
    rewards: list[dict[str, float]] = field(default_factory=list)
    dones: list[bool] = field(default_factory=list)

    def clear(self) -> None:
        self.obs.clear()
        self.actions.clear()
        self.log_probs.clear()
        self.rewards.clear()
        self.dones.clear()

    def __len__(self) -> int:
        return len(self.rewards)


# ─── Trainer ──────────────────────────────────────────────────────────────────

class IPPOTrainer:
    def __init__(self, cfg: IPPOConfig) -> None:
        self.cfg = cfg
        torch.manual_seed(cfg.seed)
        np.random.seed(cfg.seed)

        self.env = GridNexusEnv(
            n_agents=cfg.n_agents,
            max_steps=cfg.max_steps,
            seed=cfg.seed,
        )
        agents = self.env.possible_agents

        self.actors: dict[str, Actor] = {
            ag: Actor(OBS_DIM, ACTION_DIM, cfg.hidden_dim) for ag in agents
        }
        self.critics: dict[str, LocalCritic] = {
            ag: LocalCritic(OBS_DIM, cfg.hidden_dim) for ag in agents
        }

        self.actor_optims: dict[str, torch.optim.Adam] = {
            ag: torch.optim.Adam(self.actors[ag].parameters(), lr=cfg.lr_actor) for ag in agents
        }
        self.critic_optims: dict[str, torch.optim.Adam] = {
            ag: torch.optim.Adam(self.critics[ag].parameters(), lr=cfg.lr_critic) for ag in agents
        }

        self.buffer = RolloutBuffer()
        self.metrics: list[dict[str, float]] = []

    def train(self) -> list[dict[str, float]]:
        logger.info("Starting IPPO training for %d episodes.", self.cfg.n_episodes)
        t0 = time.time()

        for ep in range(1, self.cfg.n_episodes + 1):
            ep_metrics = self._run_episode(ep)
            self.metrics.append(ep_metrics)

            if ep % 20 == 0 or ep == 1:
                logger.info(
                    "Ep %d/%d | policy_loss=%.4f | value_loss=%.4f | coalition_size=%.2f | surplus=%.4f",
                    ep, self.cfg.n_episodes, ep_metrics["policy_loss"], ep_metrics["value_loss"],
                    ep_metrics["mean_coalition_size"], ep_metrics["mean_surplus_captured"],
                )

        elapsed = time.time() - t0
        logger.info("Training complete in %.1fs.", elapsed)
        return self.metrics

    def _run_episode(self, episode: int) -> dict[str, float]:
        self.buffer.clear()
        obs_dict, _ = self.env.reset()
        coalition_sizes: list[float] = []
        total_surpluses: list[float] = []

        while self.env.agents:
            actions: dict[str, int] = {}
            log_probs: dict[str, float] = {}
            for ag in self.env.agents:
                obs_t = torch.FloatTensor(obs_dict[ag])
                dist = self.actors[ag].get_dist(obs_t.unsqueeze(0))
                act = dist.sample()
                actions[ag] = int(act.item())
                log_probs[ag] = float(dist.log_prob(act).item())

            next_obs, rewards, terminations, truncations, infos = self.env.step(actions)
            first_info = next(iter(infos.values()), {})
            coalition_sizes.append(float(first_info.get("coalition_size", 0)))
            done = all(terminations.values())

            self.buffer.obs.append(obs_dict)
            self.buffer.actions.append(actions)
            self.buffer.log_probs.append(log_probs)
            self.buffer.rewards.append(rewards)
            self.buffer.dones.append(done)
            obs_dict = next_obs

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

    def _update(self) -> tuple[float, float]:
        buf = self.buffer
        T = len(buf)
        agents = self.env.possible_agents

        advantages: dict[str, list[float]] = {ag: [] for ag in agents}
        returns: dict[str, list[float]] = {ag: [] for ag in agents}

        total_policy_loss = 0.0
        total_value_loss = 0.0
        n_updates = 0

        for ag in agents:
            obs_tensors = torch.FloatTensor(np.stack([buf.obs[t].get(ag, np.zeros(OBS_DIM, dtype=np.float32)) for t in range(T)]))
            with torch.no_grad():
                values = self.critics[ag](obs_tensors).numpy()

            gae = 0.0
            ag_adv = []
            ag_ret = []
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

        for _ in range(self.cfg.update_epochs):
            idxs = np.random.permutation(T)
            for start in range(0, T, self.cfg.minibatch_size):
                mb = idxs[start: start + self.cfg.minibatch_size]
                if len(mb) == 0: continue
                mb_t = torch.LongTensor(mb)

                ep_policy_loss = 0.0
                ep_value_loss = 0.0

                for ag in agents:
                    mb_obs = torch.FloatTensor(np.stack([buf.obs[t].get(ag, np.zeros(OBS_DIM, dtype=np.float32)) for t in mb]))
                    mb_act = torch.LongTensor([buf.actions[t].get(ag, 1) for t in mb])
                    mb_old_lp = torch.FloatTensor([buf.log_probs[t].get(ag, 0.0) for t in mb])
                    mb_adv = torch.FloatTensor([advantages[ag][t] for t in mb])
                    mb_adv = (mb_adv - mb_adv.mean()) / (mb_adv.std() + 1e-8)
                    mb_ret = torch.FloatTensor([returns[ag][t] for t in mb])

                    # Critic update
                    pred_values = self.critics[ag](mb_obs)
                    value_loss = F.mse_loss(pred_values, mb_ret)
                    self.critic_optims[ag].zero_grad()
                    (self.cfg.value_coef * value_loss).backward()
                    nn.utils.clip_grad_norm_(self.critics[ag].parameters(), 0.5)
                    self.critic_optims[ag].step()
                    ep_value_loss += value_loss.item()

                    # Actor update
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
                total_value_loss += ep_value_loss / len(agents)
                n_updates += 1

        return total_policy_loss / max(n_updates, 1), total_value_loss / max(n_updates, 1)

    def save(self, artifact_dir: Path) -> None:
        artifact_dir.mkdir(parents=True, exist_ok=True)
        for ag, actor in self.actors.items():
            torch.save(actor.state_dict(), artifact_dir / f"actor_{ag}.pt")
            torch.save(self.critics[ag].state_dict(), artifact_dir / f"critic_{ag}.pt")
        logger.info("Saved IPPO checkpoints to %s", artifact_dir)
