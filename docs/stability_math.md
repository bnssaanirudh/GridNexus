# Farsighted Coalitional Stability — Mathematical Formulation

## Overview

A coalition `S ⊆ V` of microgrids is **farsighted-stable** if no subset `T ⊂ S`
can profitably deviate, taking into account that after their defection the
remaining agents `S \ T` will also re-optimise.

This is the **Farsighted Core** condition (Chwe 1994): a coalition `S` is in
the farsighted core if there is no other **permissible** coalition `S'` such
that every member of `S'` is strictly better off in `S'` than in `S`, even
anticipating subsequent deviations from `S'`.

---

## Simplification for the LP Formulation

GridNexus uses a **transferable-utility (TU) cooperative game** where:

- `v(S)` = total surplus available to coalition `S` (kW·h surplus pooled).
- `x_i` = allocated payoff to agent `i` in the grand coalition.
- Stability condition: for all permissible deviating coalitions `T`,
  the grand coalition `S` must offer at least as much as `T` can generate alone.

### Feasibility LP (per proposed coalition S)

Given `n = |S|` agents with surplus values `v_i > 0`, we check feasibility of:

```
Find x ∈ ℝⁿ such that:
  (1)  Σᵢ xᵢ = v(S)                         [efficiency: full surplus distributed]
  (2)  Σᵢ∈T xᵢ ≥ v(T)  ∀ permissible T ⊆ S  [farsighted-stability: no T can deviate]
  (3)  xᵢ ≥ 0           ∀ i ∈ S              [individual rationality]
```

Condition (2) has exponentially many constraints in general.  We handle this
with **row-constraint generation** (Cutting-Plane method):

### Row-Constraint Generation Algorithm

```
1. Start with only constraints (1) and (3) in the LP.
2. Solve the LP for current x*.
3. Separation oracle: for each permissible T ⊆ S, compute
       slack(T) = Σᵢ∈T xᵢ* − v(T)
   Find T* = argmin slack(T).
4. If slack(T*) < −ε (violated), add constraint (2) for T* and go to step 2.
5. If no violation found (all slacks ≥ −ε), the coalition is STABLE.
6. If LP becomes infeasible, the coalition is UNSTABLE.
```

### Planar-Graph Restriction 

The separation oracle at step 3 only searches over **permissible coalitions**
returned by `permissible_coalitions(graph, k)` — i.e., connected subsets of
the physical planar power-line graph.  This restricts the deviation search
space from O(Bell(n)) to O(n^2.67) empirically (see `coalition_growth.png`),
making the algorithm polynomial in practice.

### Characteristic Function `v(S)`

Assumption: `v(S) = Σᵢ∈S surplus_i`, where `surplus_i` is a per-agent
surplus value passed in the request (defaults to 1.0 per agent when not
provided, so the LP tests structural stability rather than value-weighted
stability). Future prompts will wire in real DQN-estimated surplus values.

### Stability Margin

The **margin** returned is `min_T slack(T)` over all permissible T after
convergence — i.e., the slack of the tightest constraint.  A positive margin
means the coalition is comfortably stable; a margin of exactly 0 means it is
marginally stable (binding constraint exists).
