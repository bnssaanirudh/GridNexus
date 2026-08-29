"""
engine/scripts/experiments/run_benchmarks.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Benchmarks comparing the Additive vs VPP CoalitionValueModel
and various allocation mechanisms (Least-Core, Shapley, Nash, Proportional).
"""
import time
import csv
from pathlib import Path
import networkx as nx

from app.schemas.stability import SellerProfile, BuyerProfile
from app.stability.value_model import VPPValueModel, CoalitionValueModel
from app.stability.stability_solver import verify_stability

class AdditiveValueModel(CoalitionValueModel):
    def evaluate(self, coalition, profiles):
        return sum(profiles.get(a).outside_option + 1.0 for a in coalition if a in profiles)

def run_benchmarks(output_dir: Path):
    # Setup a realistic 6-agent game
    G = nx.Graph()
    # A line topology
    G.add_edges_from([("s1", "s2"), ("s2", "b1"), ("b1", "s3"), ("s3", "b2"), ("b2", "s4")])
    coalition = ["s1", "s2", "s3", "s4", "b1", "b2"]
    
    profiles = {
        "s1": SellerProfile(generation_cost=2.0, available_capacity=30.0, outside_option=2.0),
        "s2": SellerProfile(generation_cost=2.5, available_capacity=40.0, outside_option=3.0),
        "s3": SellerProfile(generation_cost=3.0, available_capacity=50.0, outside_option=4.0),
        "s4": SellerProfile(generation_cost=4.0, available_capacity=20.0, outside_option=1.0),
        "b1": BuyerProfile(energy_value=12.0, demand=80.0, outside_option=10.0),
        "b2": BuyerProfile(energy_value=10.0, demand=60.0, outside_option=8.0),
    }
    
    vpp_model = VPPValueModel(diversity_bonus_per_seller=1.5, congestion_threshold=100.0, congestion_penalty_rate=2.0)
    additive_model = AdditiveValueModel()
    
    results = []
    
    for model_name, model in [("Additive (Legacy)", additive_model), ("VPP Non-Additive (New)", vpp_model)]:
        t0 = time.perf_counter()
        res = verify_stability(coalition, G, profiles, model)
        t1 = time.perf_counter()
        
        results.append({
            "Model": model_name,
            "Is_Stable": res.is_stable,
            "Epsilon_Star": res.epsilon_star,
            "Solve_Time_ms": (t1 - t0) * 1000.0,
            "V_S": sum(res.allocation.values())
        })
        
    with open(output_dir / "model_benchmarks.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

if __name__ == "__main__":
    out = Path(__file__).parent / "results"
    out.mkdir(exist_ok=True)
    run_benchmarks(out)
    print("Benchmarks completed. Results in:", out)
