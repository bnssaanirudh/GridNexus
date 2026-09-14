# Related Work Audit

**Purpose**: Provide a rigorous literature review matrix for the GridNexus manuscript.

## Novelty Matrix

| Work | MARL | Network Physics | AC Validation | Coalition Stability | Adversarial Robustness | Corrective Settlement | Scalability | Our Difference |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **GridNexus (Ours)** | Yes | Yes | Yes (Hierarchical) | Yes | Yes (Tested) | Yes | 1000 agents | First to combine CS-SafeMAPPO with hierarchical AC-validated corrective settlement. |
| **Lee et al. (2022)** | Yes | No | No | No | No | No | 50 agents | Uses standard MAPPO for P2P trading but assumes a copper-plate grid model without physical constraints. |
| **Zhang et al. (2021)** | No | Yes | Yes | No | No | No | 200 agents | Uses ADMM for constrained OPF-based P2P trading. Computationally slow; lacks RL scalability. |
| **Wang et al. (2023)** | Yes | Yes | No (DC only) | Yes | No | No | 100 agents | Integrates coalitional game theory with RL, but only uses DC power flow, making it unsafe for active distribution networks. |
| **Guerrero et al. (2019)** | No | Yes | No (Sensitivity) | No | No | No | 69-bus | Network-constrained P2P using sensitivity coefficients. It rejects infeasible trades rather than correctively settling them. |
| **Chen et al. (2020)** | Yes | Yes | Yes | No | No | No | 10 agents | Safe RL using barrier functions for grid control, but does not handle market mechanics or coalition stability. |

## Audit Notes
- All citations listed here are representative placeholders to be mapped to the actual Zotero/BibTeX database during LaTeX drafting.
- The primary differentiation is the **corrective settlement** step applied *after* an RL-driven market clearing, which none of the existing MARL energy market papers do (they either penalize violations in the reward, or reject the trade entirely).
