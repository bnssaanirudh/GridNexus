# Topology-Aware Coalition Separation Oracle

## Problem Statement
In a Graph-Constrained Coalitional Game, the Least-Core stability constraint generation requires a separation oracle to find the most violated deviating coalition $T \subseteq S$:
$$ \text{slack}(T) = \sum_{i \in T} x_i - v(T) $$
where $x_i$ is the proposed payoff to agent $i$, and $v(T)$ is the characteristic surplus function of $T$. 
For a network with $|V|$ nodes, enumerating all connected subgraphs up to size $|V|$ is exponential, making the exact oracle intractable for $N > 20$.

## Topology-Aware Greedy Heuristic
We propose a polynomial-time heuristic that uses the network's electrical topology and the current payoff allocations to intelligently prune the search space.

### 1. Seed Selection
We sort all individual nodes (singletons) by their individual slack:
$$ \Delta_i = x_i - v(\{i\}) $$
Nodes with small (or negative) $\Delta_i$ are "unhappy" and are the most likely instigators of a deviating coalition. We select the top $M$ most unhappy nodes as seeds.

### 2. Greedy Expansion
From each seed $i$, we initialize a coalition $T = \{i\}$. At each step, we consider the frontier of nodes $F$ adjacent to $T$ in the power grid graph.
For each candidate $j \in F$, we evaluate the marginal slack improvement:
$$ \text{gain}(j) = \text{slack}(T) - \text{slack}(T \cup \{j\}) $$
$$ = (v(T \cup \{j\}) - v(T)) - x_j $$
We greedily add the candidate $j^*$ that maximizes this gain, provided $\text{gain}(j^*) > 0$.

### 3. Electrical Pruning
The heuristic uses the graph topology implicitly because $F$ is restricted to adjacent nodes. We can further prune nodes $j \in F$ if the tie-line capacity to $j$ is zero, or if $j$ is electrically disconnected (islanding constraints). 
The expansion stops when no adjacent node offers a positive marginal gain, or a maximum depth is reached.

## Certification Mode (Exact Fallback)
For small networks ($N \le 20$), the oracle defaults to exhaustive enumeration (using `permissible_coalitions`) to provide an exact mathematical certificate of stability. For larger networks, it returns the best coalition found by the greedy heuristic, offering a bounded certification.
