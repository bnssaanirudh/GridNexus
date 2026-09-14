import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os
import csv
from pathlib import Path

# Create output directory for figures
output_dir = "paper_figures"
os.makedirs(output_dir, exist_ok=True)

# Plot styling suitable for IEEE Transactions / Applied Energy (Q1 journals)
plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Times New Roman"],
    "font.size": 12,
    "axes.labelsize": 14,
    "axes.titlesize": 14,
    "xtick.labelsize": 12,
    "ytick.labelsize": 12,
    "legend.fontsize": 12,
    "figure.titlesize": 16,
    "figure.dpi": 300,
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
})
sns.set_theme(style="whitegrid", rc={"font.family": "serif"})

def generate_evaluation_plots():
    """Generates evaluation metric plots based on actual experiment data from run_experiment.py."""
    raw_metrics_path = Path("artifacts/experiments/raw_metrics.csv")
    
    if not raw_metrics_path.exists():
        print(f"Metrics file not found at {raw_metrics_path}. Please run run_experiment.py first.")
        return

    # Load data
    data = []
    with open(raw_metrics_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append({
                "scenario": row["scenario"],
                "episode": int(row["episode"]),
                "mean_surplus": float(row["mean_surplus_captured"]),
                "mean_coalition": float(row["mean_coalition_size"])
            })

    episodes = sorted(list(set(d["episode"] for d in data)))
    scenarios = list(set(d["scenario"] for d in data))
    
    # Sort scenarios so 'baseline' is typically first
    scenarios.sort()

    colors = {'baseline': '#ff7f0e', 'proposed': '#1f77b4'}
    labels = {'baseline': 'Baseline (Random/Heuristic)', 'proposed': 'GridNexus (MAPPO)'}

    # Plot 1: Evaluation Surplus over Episodes
    plt.figure(figsize=(8, 5))
    
    for scenario in scenarios:
        scenario_data = [d for d in data if d["scenario"] == scenario]
        means, stds = [], []
        
        for ep in episodes:
            ep_data = [d["mean_surplus"] for d in scenario_data if d["episode"] == ep]
            if ep_data:
                means.append(np.mean(ep_data))
                stds.append(np.std(ep_data))
            else:
                means.append(0)
                stds.append(0)
                
        means = np.array(means)
        stds = np.array(stds)
        
        color = colors.get(scenario, '#2ca02c')
        label = labels.get(scenario, scenario)
        
        plt.plot(episodes, means, label=label, color=color, linewidth=2.5)
        plt.fill_between(episodes, means - stds, means + stds, color=color, alpha=0.2)

    plt.xlabel('Evaluation Episodes')
    plt.ylabel('Mean Surplus Captured (USD)')
    plt.title('Evaluation: Multi-Agent Policy Performance')
    plt.legend(loc='lower right')
    
    plt.savefig(f"{output_dir}/evaluation_surplus.png")
    plt.close()

    # Plot 2: Bar chart for Mean Coalition Size
    plt.figure(figsize=(6, 5))
    bar_means = []
    bar_stds = []
    bar_labels = []
    bar_colors = []
    
    for scenario in scenarios:
        vals = [d["mean_coalition"] for d in data if d["scenario"] == scenario]
        bar_means.append(np.mean(vals))
        bar_stds.append(np.std(vals))
        bar_labels.append(labels.get(scenario, scenario))
        bar_colors.append(colors.get(scenario, '#2ca02c'))

    plt.bar(bar_labels, bar_means, yerr=bar_stds, capsize=5, color=bar_colors, alpha=0.8)
    plt.ylabel('Mean Coalition Size')
    plt.title('Coalition Formation Efficiency')
    plt.tight_layout()
    plt.savefig(f"{output_dir}/coalition_size_comparison.png")
    plt.close()

if __name__ == "__main__":
    print("Generating Q1 Publication-Ready Figures from REAL DATA...")
    generate_evaluation_plots()
    print(f"Figures saved to {output_dir}/")
