"""
engine/app/stability/allocation.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mechanisms to allocate the surplus $v(S)$ among the agents in the coalition.
"""

from typing import Any
import math
import itertools
from scipy.optimize import minimize
from app.schemas.stability import AgentProfile
from app.stability.value_model import CoalitionValueModel

def allocate_proportional(
    coalition: list[Any],
    v_S: float,
    outside_options: dict[Any, float]
) -> dict[Any, float]:
    """Allocate proportional to outside options (if sum > 0), else equally."""
    out_sum = sum(outside_options[a] for a in coalition)
    
    if out_sum > 0:
        return {a: v_S * (outside_options[a] / out_sum) for a in coalition}
    else:
        n = len(coalition)
        return {a: v_S / n for a in coalition}

def allocate_shapley(
    coalition: list[Any],
    profiles: dict[Any, AgentProfile],
    value_model: CoalitionValueModel
) -> dict[Any, float]:
    """
    Compute the exact Shapley value.
    WARNING: Tractable only for small |S| (<= 8).
    """
    n = len(coalition)
    if n > 10:
        raise ValueError("Shapley value intractable for N > 10.")
        
    allocation = {a: 0.0 for a in coalition}
    # Precompute subset values to avoid recalculating
    memo = {}
    def v(subset: frozenset) -> float:
        if subset not in memo:
            memo[subset] = value_model.evaluate(subset, profiles)
        return memo[subset]
        
    import math
    factorial_n = math.factorial(n)
    
    # We can iterate over all subsets instead of all permutations
    # Shapley formula: sum over S \subseteq N \setminus {i} of 
    # (|S|! * (n - |S| - 1)!) / n! * (v(S \cup {i}) - v(S))
    
    # Helper to get all subsets
    for r in range(n):
        for subset_tuple in itertools.combinations(coalition, r):
            subset = frozenset(subset_tuple)
            val_S = v(subset)
            
            for agent in coalition:
                if agent not in subset:
                    subset_with_i = subset | frozenset([agent])
                    val_S_with_i = v(subset_with_i)
                    
                    marginal = val_S_with_i - val_S
                    weight = (math.factorial(r) * math.factorial(n - r - 1)) / factorial_n
                    allocation[agent] += weight * marginal
                    
    return allocation

def allocate_nash_bargaining(
    coalition: list[Any],
    v_S: float,
    outside_options: dict[Any, float]
) -> dict[Any, float]:
    """
    Approximates the Nash Bargaining Solution.
    Maximizes sum(log(x_i - outside_i)) subject to sum(x_i) = v_S and x_i >= outside_i.
    """
    n = len(coalition)
    
    out_sum = sum(outside_options[a] for a in coalition)
    if v_S <= out_sum:
        # Cannot satisfy IR, just fallback to proportional
        return allocate_proportional(coalition, v_S, outside_options)
        
    # We use scipy minimize to find the Nash product max (by minimizing negative sum of logs)
    def objective(x):
        # We add a tiny epsilon to avoid log(0)
        return -sum(math.log(max(xi - outside_options[coalition[i]], 1e-9)) for i, xi in enumerate(x))
        
    # Constraints: sum(x) == v_S
    constraints = [{'type': 'eq', 'fun': lambda x: sum(x) - v_S}]
    
    # Bounds: x_i >= outside_options[i] + small epsilon
    bounds = [(outside_options[coalition[i]] + 1e-6, v_S) for i in range(n)]
    
    # Initial guess: proportional or equal surplus division
    surplus_to_divide = v_S - out_sum
    x0 = [outside_options[coalition[i]] + (surplus_to_divide / n) for i in range(n)]
    
    import numpy as np
    from scipy.optimize import minimize
    
    res = minimize(
        objective,
        x0=np.array(x0),
        bounds=bounds,
        constraints=constraints,
        method='SLSQP'
    )
    
    if res.success:
        return {coalition[i]: float(res.x[i]) for i in range(n)}
    else:
        # Fallback if solver fails
        return allocate_proportional(coalition, v_S, outside_options)
