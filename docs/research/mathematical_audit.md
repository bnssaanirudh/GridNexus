# Mathematical Method Audit

**Purpose**: Audit all equations and definitions needed for the GridNexus manuscript.

## Definitions

- **Agents ($\mathcal{N}$)**: Set of all market participants, where $i \in \mathcal{N}$ represents a single prosumer or flexible load.
- **States ($s_t$)**: The global physical state of the grid at time step $t$, including voltage magnitudes, phase angles, and current SOCs.
- **Actions ($a_t^i$)**: The proposed transaction quantity by agent $i$ at time $t$.
- **Observations ($o_t^i$)**: The local observation available to agent $i$, including local price signals and local bus voltage.
- **Coalitions ($C$)**: A subset of agents $C \subseteq \mathcal{N}$ that cooperatively agree to coordinate bids.
- **Characteristic Function ($v(C)$)**: The maximum physical and market value that coalition $C$ can guarantee independently.
- **Allocation ($x$)**: The vector of payoffs assigned to each agent.
- **Coalition Excess ($e(C)$)**: $e(C) = v(C) - \sum_{i \in C} x_i$. A measure of how much a coalition wants to deviate.
- **Social Welfare ($SW$)**: The aggregate utility of all participants in the market.
- **Fairness ($\mathcal{F}$)**: Jain's Fairness Index over the allocations $x$.

## Formulations

### Constrained Objective
The central planner (or decentralized RL objective) aims to maximize social welfare subject to physical network constraints:
$$ \max_{a_t} \mathbb{E} \left[ \sum_{t=0}^T \gamma^t SW(s_t, a_t) \right] $$
subject to $V_{min} \le V(s_t, a_t) \le V_{max}$ (voltage limits) and $I(s_t, a_t) \le I_{max}$ (thermal limits).

### MAPPO Objective
Standard multi-agent PPO maximizes a clipped surrogate advantage objective with a centralized value function $V(s)$.

### CS-SafeMAPPO Objective
Incorporates dual variables for both physical safety $\lambda$ and coalition stability $\mu$:
$$ \mathcal{L}_{CS-SafeMAPPO} = \mathcal{L}_{MAPPO} - \lambda \cdot \text{Cost}_{physical} - \mu \cdot \text{Cost}_{coalition} $$

### Corrective Projection
For a proposed action vector $a_{prop}$, the corrected action $a_{corr}$ is found via:
$$ \arg\min_{a} || a - a_{prop} ||_2^2 $$
subject to all AC power flow constraints (verified hierarchically).

## Audit Notes
- **Notation Overloading**: Checked. No collision between the physical state $s$ (network) and the RL state formulation.
- **Convergence Guarantees**: We do *not* claim theoretical global convergence to the core of the cooperative game, as the non-convex AC constraints make the characteristic function non-superadditive in pathological cases. Claims are restricted to empirical stability.
