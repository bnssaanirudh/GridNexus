from pathlib import Path

from app.rl.gridnexus_env import GridNexusEnv


def test_environment_reports_named_constraint_metrics():
    env = GridNexusEnv(n_agents=2, max_steps=2, seed=7)
    env.reset(seed=7)
    env._oracle_signal = 0.95

    actions = {agent: 0 for agent in env.agents}
    _, _, _, _, infos = env.step(actions)

    for info in infos.values():
        assert info["constraint_metrics"] == {
            "physical_violation": 0.2,
            "coalition_instability": 0.5,
            "total_constraint_cost": 0.7,
        }


def test_benchmark_uses_distinct_cs_safe_mappo_trainer():
    from app.rl.cs_safe_mappo import CSSafeMAPPOTrainer
    from scripts.experiments.run_marl_benchmarks import build_benchmark_trainers

    trainers = build_benchmark_trainers(
        seed=42,
        output_dir=Path("tmp/cs-safe-mappo-benchmark-test"),
        n_episodes=1,
        max_steps=2,
    )

    assert type(trainers["CS-SafeMAPPO"]).__name__ == "CSSafeMAPPOTrainer"
    assert isinstance(trainers["CS-SafeMAPPO"], CSSafeMAPPOTrainer)
