import csv
import json
import copy
import random
from pathlib import Path
from app.grid.standard_grids import load_standard_grid
from app.experiments.scenario_generator import generate_scenario
from app.grid.corrective_dispatch import verify_and_correct_dispatch
from .run_sybil_sweep import clear_market_dummy

def run_collusion_sweep():
    print("Starting Collusion Benchmark Sweep...")
    
    net = load_standard_grid('ieee33')
    results = []
    
    output_dir = Path("results")
    output_dir.mkdir(exist_ok=True, parents=True)
    jsonl_path = output_dir / "collusion_sweep_traces.jsonl"
    
    # Parameters
    agent_counts = [50]
    collusion_fractions = [0.1, 0.3]
    seeds = [42]
    
    with open(jsonl_path, "w", encoding="utf-8") as jsonl_file:
        for seed in seeds:
            random.seed(seed)
            for n_agents in agent_counts:
                honest_agents = generate_scenario(net, n_agents=n_agents)
                
                for fraction in collusion_fractions:
                    attack_agents = copy.deepcopy(honest_agents)
                    
                    # Colluders cooperate to maximize joint utility, but here we just simulate
                    # a simple attack where they coordinate bids (e.g. sellers bid higher together)
                    n_colluders = int(n_agents * fraction)
                    sellers = [a for a in attack_agents if a['type'] == 'sell']
                    colluders = random.sample(sellers, min(n_colluders, len(sellers)))
                    
                    for c in colluders:
                        c['price'] *= 1.5 # Collusive price inflation
                        
                    # Run clearing
                    trades = clear_market_dummy(attack_agents, net)
                    
                    successful_trades = 0
                    for t in trades:
                        ok, kw, solver, res = verify_and_correct_dispatch(net, t['seller_node'], t['buyer_node'], t['proposed_kw'])
                        if ok and kw > 0:
                            successful_trades += 1
                            
                    res_obj = {
                        "seed": seed,
                        "n_agents": n_agents,
                        "collusion_fraction": fraction,
                        "total_trades_settled": successful_trades,
                    }
                    results.append(res_obj)
                    jsonl_file.write(json.dumps(res_obj) + "\n")
                    jsonl_file.flush()
                    print(f"Seed {seed}, Agents {n_agents}, Collusion {fraction} -> {successful_trades} settled")
                    
    with open(output_dir / "collusion_sweep.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["seed", "n_agents", "collusion_fraction", "total_trades_settled"])
        writer.writeheader()
        writer.writerows(results)
        
    print(f"Sweep complete. Results saved to {output_dir / 'collusion_sweep.csv'}")

if __name__ == "__main__":
    run_collusion_sweep()
