import csv
import numpy as np
from scipy import stats
from pathlib import Path

def run_statistics():
    print("Running Statistical Pipeline...")
    results_dir = Path("results")
    if not results_dir.exists():
        print("No results directory found.")
        return
        
    ablation_file = results_dir / "ablation_study.csv"
    if not ablation_file.exists():
        print("No ablation_study.csv found.")
        return
        
    data = []
    with open(ablation_file, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(row)
            
    # Group by algorithm
    algos = {}
    for row in data:
        a = row["algorithm"]
        if a not in algos:
            algos[a] = {"welfare": []}
        algos[a]["welfare"].append(float(row["welfare"]))
        
    print(f"\n{'Algorithm':<40} {'N':<5} {'Mean W':<10} {'Std W':<10} {'p-value (vs CS-SafeMAPPO)':<25}")
    print("-" * 95)
    
    target_algo = "CS-SafeMAPPO"
    if target_algo not in algos:
        print(f"Target algorithm {target_algo} not found.")
        return
        
    target_data = algos[target_algo]["welfare"]
    
    for a, metrics in algos.items():
        w_data = metrics["welfare"]
        n = len(w_data)
        mean_w = np.mean(w_data)
        std_w = np.std(w_data)
        
        if a == target_algo:
            p_val_str = "-"
        else:
            # Welch's t-test
            t_stat, p_val = stats.ttest_ind(target_data, w_data, equal_var=False)
            p_val_str = f"{p_val:.4e}"
            
        print(f"{a:<40} {n:<5} {mean_w:<10.2f} {std_w:<10.2f} {p_val_str:<25}")

if __name__ == "__main__":
    run_statistics()
