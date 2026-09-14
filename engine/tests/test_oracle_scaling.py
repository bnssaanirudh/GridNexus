import time
import json
from pathlib import Path
import networkx as nx
from app.graph.fixtures import generate_city_grid
from app.stability.stability_solver import verify_stability
from app.stability.value_model import AdditiveValueModel
from app.schemas.stability import SellerProfile

def run_benchmark():
    sizes = [10, 20, 30, 50, 100, 200]
    results = []

    for n in sizes:
        # Approximate a grid of size n
        rows = int(n ** 0.5)
        cols = n // rows
        if rows * cols < n:
            cols += 1
            
        graph = generate_city_grid(rows=rows, cols=cols)
        # trim to exactly n nodes
        nodes = list(graph.nodes)[:n]
        graph = graph.subgraph(nodes).copy()
        
        # create mock profiles
        profiles = {}
        for nid in graph.nodes:
            # Random surplus map logic using AdditiveValueModel
            profiles[nid] = SellerProfile(
                role="SELLER",
                generation_cost=10.0,
                degradation_cost=0.0,
                opportunity_cost=0.0,
                available_capacity=10.0,
                outside_option=5.0
            )
            
        # mock surplus_map
        surplus_map = {nid: 15.0 for nid in graph.nodes}
        
        t0 = time.perf_counter()
        res = verify_stability(
            coalition=list(graph.nodes),
            graph=graph,
            profiles=profiles,
            surplus_map=surplus_map,
            max_iter=10
        )
        t1 = time.perf_counter()
        
        results.append({
            "nodes": n,
            "solve_time_ms": res.solve_time_ms,
            "total_time_ms": (t1 - t0) * 1000,
            "rounds": res.rounds,
            "converged": res.converged
        })
        print(f"N={n}, Time={res.solve_time_ms:.2f}ms, Rounds={res.rounds}")

    out_path = Path("oracle_benchmark.json")
    out_path.write_text(json.dumps(results, indent=2))
    print(f"Results written to {out_path.absolute()}")

if __name__ == "__main__":
    run_benchmark()
