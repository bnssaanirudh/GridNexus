import time
import numpy as np
from app.grid.network_model import ElectricalNetwork, Node, Line
from app.grid.power_flow import DCPowerFlow

def generate_network(num_buses: int) -> ElectricalNetwork:
    """Generates a synthetic radial network similar to IEEE test feeders."""
    net = ElectricalNetwork(base_mva=1.0)
    net.nodes["bus0"] = Node("bus0", 11.0, is_slack=True)
    
    for i in range(1, num_buses):
        bus_id = f"bus{i}"
        net.nodes[bus_id] = Node(bus_id, 11.0, p_load_kw=100.0, p_gen_kw=0.0)
        
        # Connect to previous bus (radial string)
        prev_bus = f"bus{i-1}"
        line_id = f"line{i}"
        net.lines[line_id] = Line(line_id, prev_bus, bus_id, r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=5000.0)
        
    return net

def run_benchmarks():
    print("=== GridNexus Physics Engine Benchmarks (DC Power Flow) ===")
    
    sizes = [33, 69, 123, 500, 1000, 5000]
    
    for size in sizes:
        net = generate_network(size)
        pf = DCPowerFlow(net)
        
        start = time.perf_counter()
        results = pf.solve()
        end = time.perf_counter()
        
        solve_ms = (end - start) * 1000
        print(f"Network Size: {size:4d} buses | Solve Time: {solve_ms:8.2f} ms")
        
        # Sanity check
        assert len(results["voltages_pu"]) == size

if __name__ == "__main__":
    run_benchmarks()
