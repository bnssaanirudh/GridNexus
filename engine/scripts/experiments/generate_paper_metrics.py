import json
from pathlib import Path
import numpy as np

def compute_jain_fairness(allocations):
    """Computes Jain's fairness index."""
    allocs = np.array(list(allocations.values()))
    if np.sum(allocs) == 0:
        return 1.0
    return (np.sum(allocs)**2) / (len(allocs) * np.sum(allocs**2))

def compute_gini_coefficient(allocations):
    """Computes the Gini coefficient."""
    allocs = np.array(list(allocations.values()))
    if np.sum(allocs) == 0:
        return 0.0
    # Mean absolute difference
    mad = np.abs(np.subtract.outer(allocs, allocs)).mean()
    # Relative mean absolute difference
    rmad = mad / np.mean(allocs)
    # Gini coefficient
    gini = 0.5 * rmad
    return float(gini)

def compute_nash_social_welfare(allocations):
    """Computes Nash Social Welfare (product of utilities)."""
    allocs = np.array(list(allocations.values()))
    if np.any(allocs < 0):
        return 0.0 # NSW is undefined/0 for negative utilities
    # Geometric mean
    nsw = np.prod(allocs) ** (1.0 / len(allocs)) if len(allocs) > 0 else 0.0
    return float(nsw)

def generate_metrics(allocations_list):
    metrics = {
        "jain_fairness": [],
        "gini_coefficient": [],
        "nash_welfare": []
    }
    for allocs in allocations_list:
        metrics["jain_fairness"].append(compute_jain_fairness(allocs))
        metrics["gini_coefficient"].append(compute_gini_coefficient(allocs))
        metrics["nash_welfare"].append(compute_nash_social_welfare(allocs))
        
    return {
        "mean_jain_fairness": float(np.mean(metrics["jain_fairness"])),
        "mean_gini_coefficient": float(np.mean(metrics["gini_coefficient"])),
        "mean_nash_welfare": float(np.mean(metrics["nash_welfare"])),
    }

if __name__ == "__main__":
    # Example usage with dummy allocations
    sample_allocs = [
        {"a1": 10.0, "a2": 12.0, "a3": 11.0},
        {"a1": 5.0, "a2": 5.0, "a3": 5.0},
        {"a1": 20.0, "a2": 1.0, "a3": 0.5},
    ]
    
    print("Paper Metrics:", json.dumps(generate_metrics(sample_allocs), indent=2))
