# System Red-Team Review

**Reviewer Persona:** Hostile Q1 Journal Reviewer & Senior Systems Engineer
**Date:** 2026-09-14
**Focus:** Validity of experimental claims, baseline integrity, and system soundness.

## Findings

### 1. Baseline Integrity (Rule-based and Random)
**Severity:** MINOR
**Observation:** The "Rule-based" baseline in the ablation study is simplistic (naive matching) and does not represent a state-of-the-art heuristic. 
**Impact:** While it successfully demonstrates that RL outperforms naive methods, a more sophisticated optimization baseline (e.g., ADMM) would strengthen the comparative claims.
**Recommendation:** Acknowledge this limitation in the manuscript's threats to validity.

### 2. AC Power Flow Convergence in Extreme Scenarios
**Severity:** MAJOR (Fixed in Corrective Settlement)
**Observation:** Standard AC power flow solvers (Newton-Raphson) often fail to converge when market agents propose extreme, uncoordinated trades under heavy network load.
**Impact:** If these convergence failures were treated as "safe", it would be a critical data leak. However, the dual-certificate corrective dispatch strictly defaults to a "failed" verification state upon non-convergence, projecting to a safe fallback.
**Conclusion:** The implementation correctly handles non-convergence safely, preventing a critical flaw.

### 3. Sybil and Collusion Simulation Assumptions
**Severity:** MAJOR
**Observation:** The Sybil and Collusion sweeps assume a specific behavioral model for malicious agents (e.g., splitting capacity linearly or inflating prices by 1.5x). Real adversarial policies learned via RL could be much more complex.
**Impact:** The robustness claims are constrained by the assumed attack models.
**Recommendation:** The manuscript must explicitly state that robustness is demonstrated against *defined heuristic attacks*, not arbitrary optimal adversarial policies.

### 4. Reward Leakage and Train/Test Contamination
**Severity:** MINOR
**Observation:** The scenario generator uses specific seeds for generating the testing topologies and loads. 
**Recommendation:** Verify that the seeds used for evaluating the final tables (`42, 43, 44`) were completely excluded from the RL training environment.

## Overall Verdict
The core claims regarding the reduction of physical violations through the hierarchical verification and corrective settlement are sound and supported by the codebase architecture. The primary limitations lie in the breadth of the baselines and the adversarial models, which should be explicitly documented in the manuscript rather than hidden.
