"""
engine/scripts/experiments/run_topology_exp.py
"""
import csv
from pathlib import Path

from app.schemas.stability import SellerProfile, BuyerProfile
from app.stability.value_model import VPPValueModel
from app.grid.network_model import ElectricalNetwork, Node, Line
from app.grid.power_flow import DCPowerFlow

class PhysicalVPPValueModel(VPPValueModel):
    def __init__(self, network: ElectricalNetwork, **kwargs):
        super().__init__(**kwargs)
        self.network = network

    def evaluate(self, coalition, profiles):
        # 1. Base economic evaluation
        base_surplus = super().evaluate(coalition, profiles)
        
        if base_surplus <= 0:
            return base_surplus

        # 2. Inject power into network
        # Reset injections
        for node in self.network.nodes.values():
            node.p_gen_kw = 0.0
            node.p_load_kw = 0.0

        for agent in coalition:
            profile = profiles[agent]
            # Assumes agent ID matches bus ID
            if isinstance(profile, SellerProfile):
                self.network.nodes[agent].p_gen_kw = profile.available_capacity
            elif isinstance(profile, BuyerProfile):
                self.network.nodes[agent].p_load_kw = profile.demand

        # 3. Run power flow
        try:
            pf = DCPowerFlow(self.network)
            results = pf.solve()
            
            # 4. Calculate physical congestion penalties (e.g. 5.0 $/kW overload)
            total_overload = 0.0
            for line_id, flow in results["line_flows_kw"].items():
                limit = self.network.lines[line_id].thermal_limit_kw
                if abs(flow) > limit:
                    total_overload += abs(flow) - limit

            penalty = total_overload * 5.0
            return max(0.0, base_surplus - penalty)
        except Exception:
            return 0.0 # If power flow fails, surplus is 0


def create_radial_grid():
    net = ElectricalNetwork(base_mva=1.0)
    net.nodes["slack"] = Node("slack", 11.0, is_slack=True)
    net.nodes["s1"] = Node("s1", 11.0)
    net.nodes["b1"] = Node("b1", 11.0)
    net.nodes["s2"] = Node("s2", 11.0)
    
    net.lines["l1"] = Line("l1", "slack", "s1", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=50.0)
    net.lines["l2"] = Line("l2", "s1", "b1", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=50.0)
    net.lines["l3"] = Line("l3", "b1", "s2", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=50.0)
    return net

def create_meshed_grid():
    net = create_radial_grid()
    # Add a cross-tie to make it meshed and increase transmission paths
    net.lines["l4"] = Line("l4", "slack", "s2", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=50.0)
    return net


def run_experiment(output_dir: Path):
    coalition = frozenset(["s1", "b1", "s2"])
    profiles = {
        "s1": SellerProfile(generation_cost=2.0, available_capacity=100.0, outside_option=10.0),
        "s2": SellerProfile(generation_cost=2.0, available_capacity=100.0, outside_option=10.0),
        "b1": BuyerProfile(energy_value=10.0, demand=200.0, outside_option=10.0)
    }

    radial_net = create_radial_grid()
    meshed_net = create_meshed_grid()

    model_radial = PhysicalVPPValueModel(radial_net, congestion_threshold=9999.0) # We handle physical limit
    model_meshed = PhysicalVPPValueModel(meshed_net, congestion_threshold=9999.0)

    v_radial = model_radial.evaluate(coalition, profiles)
    v_meshed = model_meshed.evaluate(coalition, profiles)

    results = [
        {"Topology": "Radial", "Total_Surplus": v_radial},
        {"Topology": "Meshed", "Total_Surplus": v_meshed}
    ]

    with open(output_dir / "topology_exp.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

if __name__ == "__main__":
    out = Path(__file__).parent / "results"
    out.mkdir(exist_ok=True)
    run_experiment(out)
    print("Topology Benchmarks completed. Results in:", out)
