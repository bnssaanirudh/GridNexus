import csv
import copy
import random
from pathlib import Path
from app.grid.standard_grids import load_standard_grid
from app.experiments.scenario_generator import generate_scenario
from app.grid.corrective_dispatch import verify_and_correct_dispatch
from .run_sybil_sweep import clear_market_dummy

def run_misreporting_sweep():
    print("Starting Misreporting Benchmark Sweep...")
    
    net = load_standard_grid('ieee33')
    results = []
    
    # Parameters
    agent_counts = [50]
    misreporting_magnitudes = [0.1, 0.2, 0.5] # 10%, 20%, 50% capacity lie
    seeds = [42]
    
    for seed in seeds:
        random.seed(seed)
        for n_agents in agent_counts:
            honest_agents = generate_scenario(net, n_agents=n_agents)
            
            for mag in misreporting_magnitudes:
                attack_agents = copy.deepcopy(honest_agents)
                
                # Misreporting: agents lie about their capacity
                for a in attack_agents:
                    if a['type'] == 'sell':
                        # Claiming to have more power than actual
                        a['quantity_kw'] *= (1.0 + mag)
                    
                # Run clearing
                trades = clear_market_dummy(attack_agents, net)
                
                successful_trades = 0
                for t in trades:
                    # The grid verify function will test with the PROPOSED amounts.
                    # Since they lied, the grid might fail them if it causes a violation.
                    ok, kw, solver, res = verify_and_correct_dispatch(net, t['seller_node'], t['buyer_node'], t['proposed_kw'])
                    if ok and kw > 0:
                        successful_trades += 1
                        
                results.append({
                    "seed": seed,
                    "n_agents": n_agents,
                    "misreporting_magnitude": mag,
                    "total_trades_settled": successful_trades,
                })
                print(f"Seed {seed}, Agents {n_agents}, Misreport {mag} -> {successful_trades} settled")
                
    output_dir = Path("results")
    output_dir.mkdir(exist_ok=True)
    with open(output_dir / "misreporting_sweep.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["seed", "n_agents", "misreporting_magnitude", "total_trades_settled"])
        writer.writeheader()
        writer.writerows(results)
        
    print("Sweep complete. Results saved to results/misreporting_sweep.csv")

if __name__ == "__main__":
    run_misreporting_sweep()
