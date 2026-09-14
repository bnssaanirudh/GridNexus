import logging
import argparse
from pathlib import Path

from app.rl.ippo_trainer import IPPOTrainer, IPPOConfig
from app.rl.mappo_trainer import MAPPOTrainer, MAPPOConfig
from app.rl.cs_safe_mappo import CSSafeMAPPOTrainer, CSSafeMAPPOConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def build_benchmark_trainers(seed: int, output_dir: Path, n_episodes: int = 50, max_steps: int = 20):
    return {
        "IPPO": IPPOTrainer(
            IPPOConfig(
                n_episodes=n_episodes,
                max_steps=max_steps,
                seed=seed,
                artifact_dir=str(output_dir / "ippo" / f"seed_{seed}"),
            )
        ),
        "MAPPO": MAPPOTrainer(
            MAPPOConfig(
                n_episodes=n_episodes,
                max_steps=max_steps,
                seed=seed,
                artifact_dir=str(output_dir / "mappo" / f"seed_{seed}"),
            )
        ),
        "CS-SafeMAPPO": CSSafeMAPPOTrainer(
            CSSafeMAPPOConfig(
                n_episodes=n_episodes,
                max_steps=max_steps,
                seed=seed,
                artifact_dir=str(output_dir / "cs_safemappo" / f"seed_{seed}"),
            )
        ),
    }


def run_benchmarks(num_seeds=10):
    output_dir = Path("artifacts/benchmarks")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    seeds = list(range(42, 42 + num_seeds))
    
    logger.info(f"Running benchmarks over {num_seeds} seeds: {seeds}")
    
    for seed in seeds:
        logger.info(f"--- SEED {seed} ---")
        
        for trainer in build_benchmark_trainers(seed, output_dir).values():
            trainer.train()
            trainer.save(Path(trainer.cfg.artifact_dir))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", type=int, default=10, help="Number of seeds to evaluate")
    args = parser.parse_args()
    run_benchmarks(args.seeds)
