import sys
import numpy as np
from pathlib import Path

from app.rl.gridnexus_env import GridNexusEnv
from app.rl.mappo_trainer import MAPPOTrainer, MAPPOConfig
import torch

def generate_allocations_from_checkpoints(artifact_dir: str):
    base_dir = Path(artifact_dir)
    cfg = MAPPOConfig(safe_mode=True)
    trainer = MAPPOTrainer(cfg)
    
    # Load checkpoints
    for ag, actor in trainer.actors.items():
        ckpt_path = base_dir / f"actor_{ag}.pt"
        if ckpt_path.exists():
            actor.load_state_dict(torch.load(ckpt_path, weights_only=True))
        else:
            print(f"Skipping missing checkpoint {ckpt_path}")
            return None
            
    # Run a test episode
    obs_dict, _ = trainer.env.reset(seed=101)
    
    while trainer.env.agents:
        actions = {}
        for ag in trainer.env.agents:
            obs_t = torch.FloatTensor(obs_dict[ag])
            with torch.no_grad():
                dist = trainer.actors[ag].get_dist(obs_t.unsqueeze(0))
                actions[ag] = int(dist.sample().item())
        obs_dict, rewards, terms, truncs, infos = trainer.env.step(actions)
    
    allocations = trainer.env._cumulative_surplus
    return allocations

if __name__ == "__main__":
    import sys
    sys.path.append(".")
    allocs = generate_allocations_from_checkpoints("artifacts/benchmarks/cs_safemappo/seed_42")
    if allocs:
        print("Final allocations:", allocs)
        from app.stability.coalition_metrics import compute_coalition_excess
        from scripts.experiments.generate_paper_metrics import compute_jain_fairness, compute_gini_coefficient
        
        jain = compute_jain_fairness(allocs)
        gini = compute_gini_coefficient(allocs)
        print(f"Jain's Fairness: {jain:.4f}")
        print(f"Gini Coefficient: {gini:.4f}")
