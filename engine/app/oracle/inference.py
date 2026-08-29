"""engine/app/oracle/inference.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REINFORCE-trained Grid Oracle policy for Bayesian persuasion.

Architecture
------------
The Oracle is a *single* REINFORCE agent whose:
  - observation  = AnonymizedGridState.to_obs_vector()  (8 floats, no hidden fields)
  - action       = integer in {0, 1, 2, 3, 4}  mapping to a broadcast signal
                   (see ORACLE_ACTIONS below)

The actor MLP is identical in shape to the per-agent actors in mappo_trainer.py
(obs_dim → hidden → hidden → action_logits) so we can reuse the Actor class.

ASSUMPTION : In production this is a pre-trained checkpoint loaded from a model registry. 
The mock RAG pipeline is used to derive the exogenous_stress_index field of the
observation; real connectors can be swapped in without changing this file.

Module boundary rule:
  This file MUST NOT import from app.agents.microgrid_agent or
  app.agents.secret_field.  It is only permitted to import from:
    - app.oracle.anonymized_state
    - app.rl.mappo_trainer  (Actor, MAPPOConfig only)
    - standard library and third-party packages (torch, numpy, etc.)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Categorical

from app.oracle.anonymized_state import AnonymizedGridState, OBS_DIM as _ANON_OBS_DIM
from app.rl.mappo_trainer import Actor, MAPPOConfig

logger = logging.getLogger(__name__)

# ─── Oracle action space ──────────────────────────────────────────────────────

ORACLE_ACTIONS: dict[int, str] = {
    0: "POOL_NOW",           # "Pooled capacity is sufficient – join now"
    1: "DEMAND_SURGE_SOON",  # "Demand spike imminent – pre-pool surplus"
    2: "STABILITY_AT_RISK",  # "Coalitional stability is at risk – cooperate"
    3: "STORM_ALERT",        # "Exogenous disruption – emergency pool requested"
    4: "HOLD_STABLE",        # "Grid is stable – no urgent action required"
}

ORACLE_OBS_DIM: int = _ANON_OBS_DIM  # 8
ORACLE_ACTION_DIM: int = len(ORACLE_ACTIONS)        # 5
ORACLE_HIDDEN_DIM: int = 64

# ─── Signal framing strings ───────────────────────────────────────────────────

SIGNAL_FRAMING: dict[int, str] = {
    0: "Coalition has {capacity:.1f} kWh pooled from {n} microgrids. "
       "Market conditions favour immediate pooling.",
    1: "Demand forecast indicates a surge ({demand:.0%} utilisation). "
       "Pre-pooling surplus now maximises settlement price.",
    2: "Coalitional stability margin is {margin:.3f}. "
       "Additional participation is required to maintain stability.",
    3: "Exogenous stress index {stress:.2f}/1.0 detected. "
       "Emergency pooling requested to buffer grid disruption.",
    4: "Grid is operating within normal parameters. "
       "Maintain current coalition posture.",
}

# ─── Checkpoint path ──────────────────────────────────────────────────────────

DEFAULT_CHECKPOINT_DIR = Path("artifacts/oracle")


# ─── OraclePolicy ─────────────────────────────────────────────────────────────


class OraclePolicy:
    """
    Grid Oracle: a REINFORCE-trained Bayesian-persuasion policy.

    The Oracle observes only AnonymizedGridState and selects which signal
    to broadcast to the coalition.  It never touches per-agent hidden fields.

    Parameters
    ----------
    checkpoint_dir : Path | None
        Directory containing a pre-trained ``oracle_actor.pt`` checkpoint.
    """

    def __init__(
        self,
        checkpoint_dir: Path | None = None,
    ) -> None:
        self.checkpoint_dir = checkpoint_dir or DEFAULT_CHECKPOINT_DIR
        self.actor = Actor(ORACLE_OBS_DIM, ORACLE_ACTION_DIM, ORACLE_HIDDEN_DIM)
        self._trained = False

        ckpt_path = self.checkpoint_dir / "oracle_actor.pt"
        if ckpt_path.exists():
            self.actor.load_state_dict(torch.load(ckpt_path, map_location="cpu"))
            self.actor.eval()
            self._trained = True
            logger.info("Loaded Oracle checkpoint from %s", ckpt_path)
        else:
            logger.warning(
                "No Oracle checkpoint found at %s. Oracle will act randomly unless trained.",
                ckpt_path,
            )

    # ── Inference ─────────────────────────────────────────────────────────────

    def select_action(self, state: AnonymizedGridState) -> tuple[int, str, str]:
        """
        Select the broadcast signal for a given AnonymizedGridState.

        Parameters
        ----------
        state : AnonymizedGridState
            Current anonymized coalition state (no hidden agent fields).

        Returns
        -------
        action_id : int
            Index of the chosen signal in ORACLE_ACTIONS.
        signal_label : str
            Short machine-readable label (e.g. "POOL_NOW").
        broadcast_text : str
            Human-readable framed message for the coalition.
        """
        obs = torch.FloatTensor(state.to_obs_vector()).unsqueeze(0)
        with torch.no_grad():
            dist: Categorical = self.actor.get_dist(obs)
            action = int(dist.sample().item())

        label = ORACLE_ACTIONS[action]
        text = SIGNAL_FRAMING[action].format(
            capacity=state.total_pooled_capacity_kwh,
            n=state.participating_microgrid_count,
            demand=state.aggregate_demand_signal,
            margin=state.stability_margin,
            stress=state.exogenous_stress_index,
        )
        return action, label, text

    def action_probs(self, state: AnonymizedGridState) -> dict[str, float]:
        """Return a probability distribution over all Oracle actions."""
        obs = torch.FloatTensor(state.to_obs_vector()).unsqueeze(0)
        with torch.no_grad():
            logits = self.actor(obs).squeeze(0)
            probs = torch.softmax(logits, dim=-1).numpy()
        return {ORACLE_ACTIONS[i]: float(p) for i, p in enumerate(probs)}

# ─── Removed _warm_start and synthetic logic ───────────────────────────────


# ─── Module-level singleton (lazy-initialised) ────────────────────────────────

_oracle_policy_instance: OraclePolicy | None = None


def get_oracle_policy() -> OraclePolicy:
    """Return the module-level Oracle singleton, initialising on first call."""
    global _oracle_policy_instance
    if _oracle_policy_instance is None:
        _oracle_policy_instance = OraclePolicy()
    return _oracle_policy_instance
