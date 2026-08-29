"""
engine/app/qre/qre_solver.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Solves for the Quantal Response Equilibrium (QRE) choice probabilities
using the standard logit fixed-point iteration.
"""

import numpy as np
from scipy.optimize import root

def logit_qre_fixed_point(payoff_matrix: list[list[float]], lambda_val: float, max_iter: int = 10000, tol: float = 1e-6) -> list[float]:
    """
    Computes the QRE choice probabilities for a symmetric 2-player game.
    Uses scipy.optimize.root to find the fixed point reliably.
    
    Args:
        payoff_matrix: 2D list of floats representing the payoffs for the row player.
        lambda_val: The QRE rationality parameter (lambda). 
                    0 = completely random, infinity = perfectly rational.
        max_iter: Maximum number of iterations for the fixed point solver.
        tol: Convergence tolerance for L1 norm of the probability vector change.
        
    Returns:
        List of probabilities (one for each action) representing the logit-QRE.
    """
    U = np.array(payoff_matrix, dtype=float)
    n_actions = U.shape[0]
    
    def qre_residual(p):
        expected_payoffs = U @ p
        max_exp = np.max(expected_payoffs)
        exp_payoffs = np.exp(lambda_val * (expected_payoffs - max_exp))
        br_p = exp_payoffs / np.sum(exp_payoffs)
        return p - br_p

    p0 = np.ones(n_actions) / n_actions
    res = root(qre_residual, p0, method='hybr', tol=tol, options={'maxfev': max_iter})
    
    if res.success or np.sum(np.abs(res.fun)) < tol * 10:
        p = np.clip(res.x, 0, 1)
        p = p / np.sum(p)
        return p.tolist()
        
    # Fallback to heavily damped iteration if root finding fails
    p = p0.copy()
    alpha = 0.05
    for _ in range(max_iter):
        expected_payoffs = U @ p
        max_exp = np.max(expected_payoffs)
        exp_payoffs = np.exp(lambda_val * (expected_payoffs - max_exp))
        br_p = exp_payoffs / np.sum(exp_payoffs)
        if np.sum(np.abs(br_p - p)) < tol:
            return br_p.tolist()
        p = (1 - alpha) * p + alpha * br_p
    return p.tolist()
