import logging
import argparse
from pathlib import Path

from app.rl.ippo_trainer import IPPOTrainer, IPPOConfig
from app.rl.mappo_trainer import MAPPOTrainer, MAPPOConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_benchmarks(num_seeds=10):
    output_dir = Path("artifacts/benchmarks")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    seeds = list(range(42, 42 + num_seeds))
    
    logger.info(f"Running benchmarks over {num_seeds} seeds: {seeds}")
    
    for seed in seeds:
        logger.info(f"--- SEED {seed} ---")
        
        # IPPO
        ippo_cfg = IPPOConfig(n_episodes=50, seed=seed, artifact_dir=str(output_dir / "ippo" / f"seed_{seed}"))
        ippo_trainer = IPPOTrainer(ippo_cfg)
        ippo_trainer.train()
        ippo_trainer.save(Path(ippo_cfg.artifact_dir))
        
        # MAPPO
        mappo_cfg = MAPPOConfig(n_episodes=50, seed=seed, artifact_dir=str(output_dir / "mappo" / f"seed_{seed}"))
        mappo_trainer = MAPPOTrainer(mappo_cfg)
        mappo_trainer.train()
        mappo_trainer.save(Path(mappo_cfg.artifact_dir))

        # CS-SafeMAPPO
        cs_mappo_cfg = MAPPOConfig(n_episodes=50, seed=seed, artifact_dir=str(output_dir / "cs_safemappo" / f"seed_{seed}"), safe_mode=True)
        cs_mappo_trainer = MAPPOTrainer(cs_mappo_cfg)
        cs_mappo_trainer.train()
        cs_mappo_trainer.save(Path(cs_mappo_cfg.artifact_dir))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", type=int, default=10, help="Number of seeds to evaluate")
    args = parser.parse_args()
    run_benchmarks(args.seeds)
