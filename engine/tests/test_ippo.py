
from __future__ import annotations
import pytest
from app.rl.gridnexus_env import GridNexusEnv
from app.rl.ippo_trainer import IPPOConfig, IPPOTrainer

def test_ippo_trainer_basic():
    config = IPPOConfig(
        n_episodes=1,
        max_steps=2,
        minibatch_size=2,
        ppo_epochs=1,
    )
    env = GridNexusEnv(n_agents=3, max_steps=2, seed=42)
    trainer = IPPOTrainer(env, config)
    metrics = trainer.train(seed=42)
    assert len(metrics) > 0
    assert 'reward' in metrics[0]

