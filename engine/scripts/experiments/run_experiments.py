"""
engine/scripts/experiments/run_experiments.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Experiments for Strategic Misreporting, Collusion, and Sybil attacks.
"""
import csv
import copy
import networkx as nx
from typing import Any
from pathlib import Path

from app.schemas.stability import SellerProfile, BuyerProfile, AgentProfile
from app.stability.value_model import VPPValueModel
from app.stability.stability_solver import verify_stability
from app.stability.allocation import allocate_shapley, allocate_proportional, allocate_nash_bargaining

def get_base_game():
    G = nx.Graph()
    G.add_edges_from([("s1", "b1"), ("s2", "b1"), ("s1", "s2"), ("s3", "b1")])
    coalition = ["s1", "s2", "s3", "b1"]
    profiles = {
        "s1": SellerProfile(generation_cost=2.0, available_capacity=50.0, outside_option=5.0),
        "s2": SellerProfile(generation_cost=3.0, available_capacity=50.0, outside_option=5.0),
        "s3": SellerProfile(generation_cost=4.0, available_capacity=50.0, outside_option=5.0),
        "b1": BuyerProfile(energy_value=10.0, demand=120.0, outside_option=10.0),
    }
    return G, coalition, profiles

def run_strategic_misreporting(output_dir: Path):
    """Experiment 1: A seller misreports their generation cost to manipulate the Shapley or Least-Core allocation."""
    G, coalition, base_profiles = get_base_game()
    value_model = VPPValueModel(diversity_bonus_per_seller=1.0)
    
    results = []
    
    # Base Truth
    res_truth = verify_stability(coalition, G, base_profiles, value_model)
    u_truth = res_truth.allocation.get("s1", 0.0)
    
    for misreport_cost in [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]:
        profiles = copy.deepcopy(base_profiles)
        profiles["s1"].generation_cost = misreport_cost
        
        # In reality, their true utility is Allocation - TrueCost (but the model calculates surplus for them based on reported cost).
        # Wait, if they report a higher cost, the mechanism gives them more surplus to satisfy IR or Shapley?
        # Let's see what the mechanism allocates.
        res = verify_stability(coalition, G, profiles, value_model)
        
        # The allocation res.allocation["s1"] is the *surplus* (profit) above their reported cost.
        # But wait, in our model, the allocation *is* the surplus. 
        # So their true utility = reported surplus + (reported cost - true cost) * (amount traded).
        # We assume they trade 50 units (since demand is 120 and they are cheapest).
        true_utility = res.allocation.get("s1", 0.0) + (misreport_cost - 2.0) * 50.0
        
        gain = true_utility - u_truth
        
        results.append({
            "Misreported_Cost": misreport_cost,
            "Reported_Surplus_Allocated": res.allocation.get("s1", 0.0),
            "True_Utility": true_utility,
            "Manipulation_Gain": gain,
            "Is_Stable": res.is_stable
        })
        
    with open(output_dir / "misreporting_exp.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

def run_collusion(output_dir: Path):
    """Experiment 2: Two sellers collude (merge into one agent) to increase market power."""
    G, coalition, base_profiles = get_base_game()
    value_model = VPPValueModel(diversity_bonus_per_seller=1.0)
    
    # Truth
    res_truth = verify_stability(coalition, G, base_profiles, value_model)
    u_s1_truth = res_truth.allocation.get("s1", 0.0)
    u_s2_truth = res_truth.allocation.get("s2", 0.0)
    
    # Collusion: s1 and s2 merge into "s_collude"
    coalition_collude = ["s_collude", "s3", "b1"]
    G_collude = nx.Graph()
    G_collude.add_edges_from([("s_collude", "b1"), ("s3", "b1")])
    profiles_collude = {
        "s_collude": SellerProfile(generation_cost=2.5, available_capacity=100.0, outside_option=10.0),
        "s3": SellerProfile(generation_cost=4.0, available_capacity=50.0, outside_option=5.0),
        "b1": BuyerProfile(energy_value=10.0, demand=120.0, outside_option=10.0),
    }
    
    res_collude = verify_stability(coalition_collude, G_collude, profiles_collude, value_model)
    u_collude = res_collude.allocation.get("s_collude", 0.0)
    
    gain = u_collude - (u_s1_truth + u_s2_truth)
    
    results = [{
        "Scenario": "Independent",
        "Utility_S1": u_s1_truth,
        "Utility_S2": u_s2_truth,
        "Combined_Utility": u_s1_truth + u_s2_truth,
        "Collusion_Gain": 0.0
    }, {
        "Scenario": "Collusion",
        "Utility_S1": "N/A",
        "Utility_S2": "N/A",
        "Combined_Utility": u_collude,
        "Collusion_Gain": gain
    }]
    
    with open(output_dir / "collusion_exp.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

def run_sybil(output_dir: Path):
    """Experiment 3: A seller splits into two identities to capture diversity bonuses or exploit least-core."""
    G, coalition, base_profiles = get_base_game()
    value_model = VPPValueModel(diversity_bonus_per_seller=1.0)
    
    # Truth
    res_truth = verify_stability(coalition, G, base_profiles, value_model)
    u_s1_truth = res_truth.allocation.get("s1", 0.0)
    
    # Sybil: s1 splits into s1a and s1b
    coalition_sybil = ["s1a", "s1b", "s2", "s3", "b1"]
    G_sybil = nx.Graph()
    G_sybil.add_edges_from([("s1a", "b1"), ("s1b", "b1"), ("s2", "b1"), ("s3", "b1")])
    profiles_sybil = {
        "s1a": SellerProfile(generation_cost=2.0, available_capacity=25.0, outside_option=2.5),
        "s1b": SellerProfile(generation_cost=2.0, available_capacity=25.0, outside_option=2.5),
        "s2": SellerProfile(generation_cost=3.0, available_capacity=50.0, outside_option=5.0),
        "s3": SellerProfile(generation_cost=4.0, available_capacity=50.0, outside_option=5.0),
        "b1": BuyerProfile(energy_value=10.0, demand=120.0, outside_option=10.0),
    }
    
    res_sybil = verify_stability(coalition_sybil, G_sybil, profiles_sybil, value_model)
    u_sybil = res_sybil.allocation.get("s1a", 0.0) + res_sybil.allocation.get("s1b", 0.0)
    
    gain = u_sybil - u_s1_truth
    
    results = [{
        "Scenario": "Honest",
        "Utility_S1": u_s1_truth,
        "Sybil_Gain": 0.0
    }, {
        "Scenario": "Sybil (Split in 2)",
        "Utility_S1": u_sybil,
        "Sybil_Gain": gain
    }]
    
    with open(output_dir / "sybil_exp.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

if __name__ == "__main__":
    out = Path(__file__).parent / "results"
    out.mkdir(exist_ok=True)
    
    run_strategic_misreporting(out)
    run_collusion(out)
    run_sybil(out)
    print("Experiments completed. Results in:", out)
