
from __future__ import annotations
import pytest
from app.rl.gridnexus_env import GridNexusEnv
from app.rl.ippo_trainer import IPPOConfig, IPPOTrainer

def test_ippo_trainer_basic():
    config = IPPOConfig(
        n_episodes=1,
        max_steps=2,
        minibatch_size=2,
        update_epochs=1,
    )
    trainer = IPPOTrainer(config)
    metrics = trainer.train()
    assert len(metrics) > 0
    assert 'policy_loss' in metrics[0]
