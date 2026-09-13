"""
engine/scripts/experiments/run_diversity_exp.py
"""
import csv
from pathlib import Path
import networkx as nx

from app.schemas.stability import SellerProfile, BuyerProfile
from app.stability.value_model import VPPValueModel
from app.stability.stability_solver import verify_stability

def run_experiment(output_dir: Path):
    model = VPPValueModel(diversity_bonus_per_seller=10.0, strict=True)
    
    # 1. Homogeneous Coalition: 5 Solar Agents
    G_homo = nx.Graph()
    coalition_homo = ["solar1", "solar2", "solar3", "solar4", "solar5", "buyer"]
    for s in coalition_homo[:-1]:
        G_homo.add_edge(s, "buyer")
        
    profiles_homo = {
        "buyer": BuyerProfile(energy_value=20.0, demand=100.0, outside_option=20.0)
    }
    for i in range(1, 6):
        profiles_homo[f"solar{i}"] = SellerProfile(generation_cost=5.0, available_capacity=20.0, outside_option=5.0)

    res_homo = verify_stability(coalition_homo, G_homo, profiles_homo, model)
    v_homo = sum(res_homo.allocation.values())

    # 2. Heterogeneous Coalition: 2 Solar, 2 Wind, 1 Battery
    # We will simulate the diversity by creating a specialized value model 
    # that multiplies the diversity bonus if asset classes differ.
    class DiversityVPPValueModel(VPPValueModel):
        def evaluate(self, coalition, profiles):
            base_surplus = super().evaluate(coalition, profiles)
            if base_surplus <= 0: return base_surplus
            
            asset_types = set()
            for agent in coalition:
                if "solar" in agent: asset_types.add("solar")
                elif "wind" in agent: asset_types.add("wind")
                elif "battery" in agent: asset_types.add("battery")
                
            diversity_multiplier = len(asset_types)
            return base_surplus + (diversity_multiplier * self.diversity_bonus_per_seller)

    diversity_model = DiversityVPPValueModel(diversity_bonus_per_seller=10.0, strict=True)
    
    G_hetero = nx.Graph()
    coalition_hetero = ["solar1", "solar2", "wind1", "wind2", "battery1", "buyer"]
    for s in coalition_hetero[:-1]:
        G_hetero.add_edge(s, "buyer")
        
    profiles_hetero = {
        "buyer": BuyerProfile(energy_value=20.0, demand=100.0, outside_option=20.0),
        "solar1": SellerProfile(generation_cost=5.0, available_capacity=20.0, outside_option=5.0),
        "solar2": SellerProfile(generation_cost=5.0, available_capacity=20.0, outside_option=5.0),
        "wind1": SellerProfile(generation_cost=4.0, available_capacity=20.0, outside_option=5.0),
        "wind2": SellerProfile(generation_cost=4.0, available_capacity=20.0, outside_option=5.0),
        "battery1": SellerProfile(generation_cost=6.0, available_capacity=20.0, outside_option=5.0),
    }

    res_hetero = verify_stability(coalition_hetero, G_hetero, profiles_hetero, diversity_model)
    v_hetero = sum(res_hetero.allocation.values())

    results = [
        {"Composition": "Homogeneous (5 Solar)", "Total_Surplus": v_homo, "Is_Stable": res_homo.is_stable, "Epsilon": res_homo.epsilon_star},
        {"Composition": "Heterogeneous (Solar+Wind+Battery)", "Total_Surplus": v_hetero, "Is_Stable": res_hetero.is_stable, "Epsilon": res_hetero.epsilon_star}
    ]

    with open(output_dir / "diversity_exp.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

if __name__ == "__main__":
    out = Path(__file__).parent / "results"
    out.mkdir(exist_ok=True)
    run_experiment(out)
    print("Diversity Benchmarks completed. Results in:", out)
