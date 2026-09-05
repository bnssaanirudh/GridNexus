# GridNexus Experiment Manifest

This document outlines the canonical procedures for reproducing the research experiments and metrics associated with the GridNexus platform. 

## 1. Reproducibility Guarantee

All experiments must be generated deterministically from seed scripts or live simulations. **Synthetic, hard-coded, or purely illustrative plot generation is strictly prohibited in this repository.** To ensure data provenance, all performance plots (e.g., convergence rates, coalition stability, pareto frontiers) must be derived from actual engine logs and metrics.

## 2. Core Experiments

### A. Reinforcement Learning (DQN / MAPPO) Convergence
- **Objective:** Measure the convergence rate of agent policies under varying grid conditions.
- **Execution:**
  1. Start the stack: `docker compose up -d`
  2. Run the policy training script: `poetry run python -m engine.experiments.train_policy`
  3. Metric outputs are saved to `engine/artifacts/metrics/`.
  4. Generate plots using the canonical plotting utility: `poetry run python -m engine.scripts.plot_metrics --source engine/artifacts/metrics/`

### B. Oracle Fairness & Pooling
- **Objective:** Evaluate the fairness and signal propagation pooling effects of the Oracle LLM module.
- **Execution:** 
  - `poetry run pytest tests/oracle/test_fairness.py --generate-plots`
  - Results are saved to `engine/artifacts/oracle/`.

### C. Stability & Coalition Formation
- **Objective:** Validate the stability margin of Shapley value-based settlement against greedy baseline.
- **Execution:**
  - `poetry run python -m engine.experiments.run_stability_baseline`

## 3. Data Lineage & Audit

All experimental data generated is stored in standard CSV/JSON formats alongside the resulting `.png` visualisations in the `artifacts/` folder. The `artifacts/` directory is Git-ignored for large binary data but tracks the validation scripts. 

*Note: Legacy synthetic plots (`coalition_growth.png`, `dqn_training_curve.png`, etc.) have been permanently removed to adhere to the strict reproducibility mandate.*
