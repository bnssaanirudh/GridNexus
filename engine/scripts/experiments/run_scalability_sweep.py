import time
import csv
import json
import numpy as np
from pathlib import Path
from app.grid.standard_grids import load_standard_grid
from app.grid.corrective_dispatch import verify_and_correct_dispatch
import copy

def run_scalability_sweep():
    print("Running Scalability Benchmark Sweep...")
    
    grids = {
        33: 'ieee33',
        69: 'ieee69',
        118: 'ieee118'
    }
    
    results = []
    
    output_dir = Path("results")
    output_dir.mkdir(exist_ok=True, parents=True)
    jsonl_path = output_dir / "scalability_sweep_traces.jsonl"
    
    with open(jsonl_path, "w", encoding="utf-8") as jsonl_file:
        for n_nodes, grid_name in grids.items():
            net = load_standard_grid(grid_name)
            
            nodes = list(net.nodes.keys())
            
            # We measure verify_and_correct_dispatch time
            latencies = []
            for _ in range(10): # 10 trials
                buyer = nodes[np.random.randint(len(nodes))]
                seller = nodes[np.random.randint(len(nodes))]
                while seller == buyer:
                    seller = nodes[np.random.randint(len(nodes))]
                
                start_t = time.perf_counter()
                verify_and_correct_dispatch(net, seller, buyer, proposed_kw=50.0)
                end_t = time.perf_counter()
                
                latencies.append(end_t - start_t)
                
            res_obj = {
                "agent_count": n_nodes,
                "stage": "corrective_projection",
                "median_latency_s": round(np.median(latencies), 4),
                "p95_latency_s": round(np.percentile(latencies, 95), 4),
                "p99_latency_s": round(np.percentile(latencies, 99), 4)
            }
            results.append(res_obj)
            jsonl_file.write(json.dumps(res_obj) + "\n")
            jsonl_file.flush()
            print(f"Grid {grid_name} (nodes={n_nodes}) -> Median {res_obj['median_latency_s']}s")
            
    with open(output_dir / "scalability_sweep.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["agent_count", "stage", "median_latency_s", "p95_latency_s", "p99_latency_s"])
        writer.writeheader()
        writer.writerows(results)
        
    print(f"Sweep complete. Results saved to {output_dir / 'scalability_sweep.csv'}")

if __name__ == "__main__":
    run_scalability_sweep()
