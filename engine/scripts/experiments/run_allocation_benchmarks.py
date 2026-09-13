"""
engine/scripts/experiments/run_allocation_benchmarks.py
"""
import time
import csv
from pathlib import Path

from app.schemas.stability import SellerProfile
from app.stability.value_model import AdditiveValueModel
from app.stability.allocation import allocate_shapley, allocate_proportional, allocate_nash_bargaining

class MockValueModel(AdditiveValueModel):
    def evaluate(self, coalition, profiles):
        # A simple O(1) evaluation for the sake of benchmarking the allocation algorithm overhead
        return len(coalition) * 10.0

def run_benchmarks(output_dir: Path):
    results = []
    value_model = MockValueModel()

    sizes = [3, 5, 7, 8, 9, 10, 15, 20, 30, 40, 50]

    for n in sizes:
        coalition = [f"a{i}" for i in range(n)]
        profiles = {f"a{i}": SellerProfile(generation_cost=1.0, available_capacity=10.0, outside_option=2.0) for i in range(n)}
        outside_options = {a: 2.0 for a in coalition}
        v_S = value_model.evaluate(coalition, profiles)

        # Proportional
        t0 = time.perf_counter()
        allocate_proportional(coalition, v_S, outside_options)
        t1 = time.perf_counter()
        prop_time = (t1 - t0) * 1000

        # Nash
        t0 = time.perf_counter()
        allocate_nash_bargaining(coalition, v_S, outside_options)
        t1 = time.perf_counter()
        nash_time = (t1 - t0) * 1000

        # Shapley
        shapley_time = None
        if n <= 10:
            t0 = time.perf_counter()
            allocate_shapley(coalition, profiles, value_model)
            t1 = time.perf_counter()
            shapley_time = (t1 - t0) * 1000
            
        results.append({
            "Agents": n,
            "Proportional_ms": prop_time,
            "Nash_ms": nash_time,
            "Shapley_ms": shapley_time if shapley_time is not None else "TIMEOUT/ERROR"
        })

    with open(output_dir / "allocation_scaling.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

if __name__ == "__main__":
    out = Path(__file__).parent / "results"
    out.mkdir(exist_ok=True)
    run_benchmarks(out)
    print("Allocation Benchmarks completed. Results in:", out)
