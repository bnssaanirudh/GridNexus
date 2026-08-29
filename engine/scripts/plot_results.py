"""
engine/scripts/plot_results.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plots reproducible, raw experiment results from the claims table and raw metrics.
Does NOT manipulate axes to artificially inflate differences.
"""
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def plot_experiment_results(output_dir: Path):
    metrics_path = output_dir / "raw_metrics.csv"
    if not metrics_path.exists():
        logger.error(f"Cannot find {metrics_path}. Run run_experiment.py first.")
        return
        
    df = pd.read_csv(metrics_path)
    
    # 1. Coalition Size Bar Plot
    plt.figure(figsize=(10, 6))
    sns.barplot(data=df, x="scenario", y="mean_coalition_size", capsize=0.1, errorbar="sd")
    plt.title("Average Coalition Size per Scenario (across seeds)")
    plt.ylabel("Mean Coalition Size")
    plt.xlabel("Scenario")
    # Do NOT artificially compress y-axis. Start from 0.
    plt.ylim(0, df['mean_coalition_size'].max() * 1.2)
    
    plot_path1 = output_dir / "plot_coalition_size.png"
    plt.savefig(plot_path1, dpi=150)
    plt.close()
    
    # 2. Surplus Captured Box Plot
    plt.figure(figsize=(10, 6))
    sns.boxplot(data=df, x="scenario", y="mean_surplus_captured")
    plt.title("Surplus Captured Distribution per Scenario (across seeds)")
    plt.ylabel("Mean Surplus Captured")
    plt.xlabel("Scenario")
    
    plot_path2 = output_dir / "plot_surplus_captured.png"
    plt.savefig(plot_path2, dpi=150)
    plt.close()
    
    logger.info(f"Saved unmanipulated plots to {output_dir}")

if __name__ == "__main__":
    plot_experiment_results(Path("artifacts/experiments"))
