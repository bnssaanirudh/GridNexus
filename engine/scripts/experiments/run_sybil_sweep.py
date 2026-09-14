import json
import csv
import copy
import random
from pathlib import Path
from app.grid.standard_grids import load_standard_grid
from app.experiments.scenario_generator import generate_scenario
from app.grid.corrective_dispatch import verify_and_correct_dispatch

# Dummy market clearing function to stand-in for the full MARL/optimization clearing for now
def clear_market_dummy(agents, net):
    buyers = [a for a in agents if a['type'] == 'buy']
    sellers = [a for a in agents if a['type'] == 'sell']
    
    trades = []
    for b in buyers:
        if not sellers: break
        s = random.choice(sellers)
        
        qty = min(b['quantity_kw'], s['quantity_kw'])
        
        if qty > 0:
            trades.append({
                "buyer_id": b["agent_id"],
                "seller_id": s["agent_id"],
                "buyer_node": b["node_id"],
                "seller_node": s["node_id"],
                "proposed_kw": qty,
                "price": (b["price"] + s["price"])/2.0
            })
            b['quantity_kw'] -= qty
            s['quantity_kw'] -= qty
            
    return trades

def run_sybil_sweep():
    print("Starting Sybil Benchmark Sweep...")
    
    net = load_standard_grid('ieee33')
    results = []
    
    output_dir = Path("results")
    output_dir.mkdir(exist_ok=True, parents=True)
    jsonl_path = output_dir / "sybil_sweep_traces.jsonl"
    
    # Parameters for factorial sweep
    agent_counts = [50, 100]
    sybil_splits = [2, 5, 10]
    seeds = [42, 43]
    
    with open(jsonl_path, "w", encoding="utf-8") as jsonl_file:
        for seed in seeds:
            random.seed(seed)
            for n_agents in agent_counts:
                honest_agents = generate_scenario(net, n_agents=n_agents)
                
                for split in sybil_splits:
                    attack_agents = copy.deepcopy(honest_agents)
                    
                    large_sellers = [a for a in attack_agents if a['type'] == 'sell' and a['quantity_kw'] > 5.0]
                    if not large_sellers:
                        continue
                        
                    target = large_sellers[0]
                    attack_agents.remove(target)
                    
                    split_qty = target['quantity_kw'] / split
                    for i in range(split):
                        sybil = copy.deepcopy(target)
                        sybil['agent_id'] = f"{target['agent_id']}_sybil_{i}"
                        sybil['quantity_kw'] = split_qty
                        attack_agents.append(sybil)
                    
                    trades = clear_market_dummy(attack_agents, net)
                    
                    successful_trades = 0
                    total_vol = 0
                    for t in trades:
                        ok, kw, solver, res = verify_and_correct_dispatch(net, t['seller_node'], t['buyer_node'], t['proposed_kw'])
                        if ok and kw > 0:
                            successful_trades += 1
                            total_vol += kw
                            
                    res_obj = {
                        "seed": seed,
                        "n_agents": n_agents,
                        "sybil_split": split,
                        "total_trades_proposed": len(trades),
                        "total_trades_settled": successful_trades,
                        "total_volume_settled": round(total_vol, 2)
                    }
                    results.append(res_obj)
                    jsonl_file.write(json.dumps(res_obj) + "\n")
                    jsonl_file.flush()
                    print(f"Seed {seed}, Agents {n_agents}, Split {split} -> {successful_trades} settled")
                    
    with open(output_dir / "sybil_sweep.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["seed", "n_agents", "sybil_split", "total_trades_proposed", "total_trades_settled", "total_volume_settled"])
        writer.writeheader()
        writer.writerows(results)
        
    print(f"Sweep complete. Results saved to {output_dir / 'sybil_sweep.csv'}")

if __name__ == "__main__":
    run_sybil_sweep()
