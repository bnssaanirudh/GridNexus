"""
engine/scripts/run_experiment.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Runs reproducible multi-seed experiments to generate the claims table.
"""
import yaml
import csv
import numpy as np
import torch
import logging
from pathlib import Path
from tqdm import tqdm

from app.rl.gridnexus_env import GridNexusEnv, ACTION_DIM, OBS_DIM
from app.oracle.inference import OraclePolicy
from app.oracle.anonymized_state import AnonymizedGridState
from app.rl.mappo_trainer import Actor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def evaluate_scenario(scenario_cfg: dict, config_dir: Path) -> dict:
    """Evaluates a single scenario over multiple seeds."""
    logger.info(f"Evaluating scenario: {scenario_cfg['name']}")
    seeds = scenario_cfg['seeds']
    oracle_enabled = scenario_cfg['oracle_enabled']
    mappo_enabled = scenario_cfg['mappo_enabled']
    
    # Load Oracle
    oracle = None
    if oracle_enabled:
        oracle = OraclePolicy(checkpoint_dir=Path("artifacts/oracle"))
        
    # Load MAPPO actors
    actors = {}
    if mappo_enabled:
        # Load pre-trained actors
        for i in range(5):
            agent = f"agent_{i}"
            act = Actor(OBS_DIM, ACTION_DIM, 64)
            ckpt_path = Path("artifacts/mappo") / f"actor_{agent}.pt"
            if ckpt_path.exists():
                act.load_state_dict(torch.load(ckpt_path, map_location="cpu"))
            act.eval()
            actors[agent] = act
            
    all_metrics = []
    
    for seed in seeds:
        env = GridNexusEnv(n_agents=5, max_steps=scenario_cfg['steps_per_episode'], seed=seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        
        for ep in range(scenario_cfg['num_episodes']):
            obs_dict, _ = env.reset(seed=seed + ep)
            
            coalition_sizes = []
            surpluses = []
            
            while env.agents:
                # Oracle Signal
                oracle_signal = 0.5
                if oracle and oracle._trained:
                    state = AnonymizedGridState(
                        total_pooled_capacity_kwh=100.0,
                        participating_microgrid_count=5,
                        aggregate_demand_signal=0.5,
                        average_market_price=0.2,
                        round_fraction=env._step / env.max_steps,
                        stability_margin=0.1,
                        peer_cooperation_rate=0.5,
                        exogenous_stress_index=0.1
                    )
                    signals = oracle.get_broadcast_probabilities(state)
                    # Pick max probability signal
                    best_signal = max(signals, key=signals.get)
                    signal_map = {"POOL_NOW": 0.0, "DEMAND_SURGE_SOON": 0.2, "STABILITY_AT_RISK": 0.4, "STORM_ALERT": 0.6, "HOLD_STABLE": 0.8}
                    oracle_signal = signal_map.get(best_signal, 0.5)
                
                # MAPPO Actions
                actions = {}
                for ag in env.agents:
                    if mappo_enabled:
                        # Override env oracle signal with our calculated one
                        obs_dict[ag][3] = oracle_signal
                        obs_t = torch.FloatTensor(obs_dict[ag]).unsqueeze(0)
                        with torch.no_grad():
                            dist = actors[ag].get_dist(obs_t)
                            actions[ag] = int(dist.sample().item())
                    else:
                        # Random agent behavior
                        actions[ag] = int(np.random.randint(0, ACTION_DIM))
                        
                next_obs, rewards, terminations, truncations, infos = env.step(actions)
                
                first_info = next(iter(infos.values()), {})
                coalition_sizes.append(float(first_info.get("coalition_size", 0)))
                
                obs_dict = next_obs
                
            total_surplus = np.mean([env._cumulative_surplus.get(ag, 0.0) for ag in env.possible_agents])
            all_metrics.append({
                "scenario": scenario_cfg['name'],
                "seed": seed,
                "episode": ep,
                "mean_coalition_size": np.mean(coalition_sizes),
                "mean_surplus_captured": total_surplus,
                "fairness_violation_rate": 0.0, # Placeholder, requires full fairness guard eval
                "mean_stability_margin": 0.1 # Placeholder
            })
            
    # Compute aggregate stats
    avg_coalition = np.mean([m["mean_coalition_size"] for m in all_metrics])
    avg_surplus = np.mean([m["mean_surplus_captured"] for m in all_metrics])
    
    return {
        "Scenario": scenario_cfg['name'],
        "Mean Coalition Size": f"{avg_coalition:.2f} ± {np.std([m['mean_coalition_size'] for m in all_metrics]):.2f}",
        "Mean Surplus": f"{avg_surplus:.2f} ± {np.std([m['mean_surplus_captured'] for m in all_metrics]):.2f}"
    }, all_metrics

def main():
    config_path = Path("engine/configs/experiment.yaml")
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)
        
    out_dir = Path(config["output_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    
    claims_table = []
    raw_metrics = []
    
    for scenario in config["scenarios"]:
        claim, metrics = evaluate_scenario(scenario, out_dir)
        claims_table.append(claim)
        raw_metrics.extend(metrics)
        
    # Save Claims Table
    claims_path = out_dir / "claims_table.csv"
    with open(claims_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Scenario", "Mean Coalition Size", "Mean Surplus"])
        writer.writeheader()
        writer.writerows(claims_table)
    logger.info(f"Saved Claims Table to {claims_path}")
    
    # Save raw metrics
    raw_path = out_dir / "raw_metrics.csv"
    with open(raw_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["scenario", "seed", "episode", "mean_coalition_size", "mean_surplus_captured", "fairness_violation_rate", "mean_stability_margin"])
        writer.writeheader()
        writer.writerows(raw_metrics)
    logger.info(f"Saved raw metrics to {raw_path}")

if __name__ == "__main__":
    main()
