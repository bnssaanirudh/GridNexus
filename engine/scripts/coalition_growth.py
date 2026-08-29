"""
engine/scripts/coalition_growth.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Growth-curve script: runs permissible_coalitions on the 50-node city-grid
fixture for k = 1 … 6, logs the count at each k, fits a polynomial curve,
and saves a PNG to engine/artifacts/coalition_growth.png.

Run with:
    poetry run python scripts/coalition_growth.py

Assumption: We cap k at 6 to keep runtime under ~30 s on a typical laptop.
The BFS expansion over a sparse planar graph remains tractable for this range.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import matplotlib.pyplot as plt
import networkx as nx
import numpy as np

# Allow running from engine/ root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.graph.fixtures import generate_city_grid
from app.graph.planar_graph import permissible_coalitions

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)

OUTPUT_PATH = ARTIFACTS_DIR / "coalition_growth.png"


def main() -> None:
    print("Generating 50-node city-grid fixture…")
    G = generate_city_grid(rows=5, cols=10)
    print(f"  nodes={G.number_of_nodes()}, edges={G.number_of_edges()}")

    ks: list[int] = []
    counts: list[int] = []
    times: list[float] = []

    for k in range(1, 7):
        t0 = time.perf_counter()
        result = permissible_coalitions(G, k=k)
        elapsed = time.perf_counter() - t0
        n = len(result)
        ks.append(k)
        counts.append(n)
        times.append(elapsed)
        print(f"  k={k}: {n:>8,d} coalitions  ({elapsed:.2f}s)")

    # Polynomial fit (log-log space → exponent estimate)
    log_k = np.log(ks)
    log_n = np.log(counts)
    coeffs = np.polyfit(log_k, log_n, deg=1)
    exponent = coeffs[0]
    print(f"\nEmpirical growth order: O(k^{exponent:.2f})")

    # ─── Plot ────────────────────────────────────────────────────────────────
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    # Left: linear scale
    axes[0].plot(ks, counts, "o-", color="#2563EB", linewidth=2, markersize=8)
    axes[0].set_xlabel("Coalition size k")
    axes[0].set_ylabel("Number of permissible coalitions")
    axes[0].set_title("Permissible Coalitions vs k (50-node city grid)")
    axes[0].grid(True, alpha=0.3)

    # Right: log-log scale with fitted line
    fit_ks = np.linspace(1, 6, 100)
    fit_vals = np.exp(np.polyval(coeffs, np.log(fit_ks)))

    axes[1].loglog(ks, counts, "o", color="#2563EB", markersize=8, label="Empirical")
    axes[1].loglog(
        fit_ks,
        fit_vals,
        "--",
        color="#DC2626",
        label=f"Fit: O(k^{exponent:.2f})",
    )
    axes[1].set_xlabel("Coalition size k")
    axes[1].set_ylabel("Number of permissible coalitions")
    axes[1].set_title("Log-Log Growth (planarity constraint → polynomial)")
    axes[1].legend()
    axes[1].grid(True, alpha=0.3, which="both")

    fig.suptitle(
        "GridNexus: Planar-graph constraint collapses coalition space to polynomial",
        fontsize=13,
        fontweight="bold",
    )
    fig.tight_layout()
    fig.savefig(OUTPUT_PATH, dpi=150, bbox_inches="tight")
    print(f"\nPlot saved -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
