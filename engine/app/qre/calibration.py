"""
engine/app/qre/calibration.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Calibrates QRE lambda from LLM temperature parameter.
Samples mock LLM choices at varying temperatures and fits
lambda = a * (1/T) + b using simple regression.
"""

import math
import random
import os
import matplotlib.pyplot as plt
import numpy as np
from typing import List, Tuple

# Set seeds for determinism
random.seed(42)
np.random.seed(42)

# We will cache the fitted parameters here in memory
_fitted_params = {"a": None, "b": None}

def mock_llm_choice(payoffs: List[float], temperature: float) -> int:
    """
    [SYNTHETIC] Mock LLM interface. In reality, this would prompt an LLM API.
    We simulate bound-rationality by adding a small non-linear distortion
    to the standard softmax to give the regression some work to do.
    """
    # Simulate a slight distortion in how LLMs perceive payoff differences
    distorted_payoffs = [p * 1.1 for p in payoffs]
    
    # Softmax with temperature
    exp_vals = [math.exp(p / temperature) for p in distorted_payoffs]
    total = sum(exp_vals)
    probs = [e / total for e in exp_vals]
    
    # Sample based on probabilities
    r = random.random()
    cumulative = 0.0
    for i, p in enumerate(probs):
        cumulative += p
        if r <= cumulative:
            return i
    return len(payoffs) - 1

def empirical_lambda(payoffs: List[float], empirical_probs: List[float]) -> float:
    """
    Estimates the lambda that best fits the empirical probabilities
    for a given set of payoffs.
    Uses a simple grid search over lambda values since the function is monotonic.
    """
    best_lambda = 0.0
    min_error = float('inf')
    
    for l_val in np.linspace(0.1, 20.0, 1000):
        # Compute QRE probabilities for this lambda
        max_p = max(payoffs)
        exp_vals = [math.exp(l_val * (p - max_p)) for p in payoffs]
        total = sum(exp_vals)
        qre_probs = [e / total for e in exp_vals]
        
        # Mean squared error
        error = sum((qre_probs[i] - empirical_probs[i])**2 for i in range(len(payoffs)))
        
        if error < min_error:
            min_error = error
            best_lambda = l_val
            
    return best_lambda

def run_calibration_harness(save_plot: bool = True) -> Tuple[float, float, float]:
    """
    Runs the sampling harness and fits the curve lambda = a * (1/T) + b.
    Returns (a, b, r_squared).
    """
    temperatures = [0.1, 0.3, 0.5, 0.7, 0.9, 1.2]
    N = 1000  # Sample size per temperature
    payoffs = [1.0, 2.0, 3.0]  # Fixed decision task payoffs
    
    x_vals = []
    y_vals = []
    
    for T in temperatures:
        counts = [0] * len(payoffs)
        for _ in range(N):
            choice = mock_llm_choice(payoffs, T)
            counts[choice] += 1
            
        empirical_probs = [c / N for c in counts]
        l_est = empirical_lambda(payoffs, empirical_probs)
        
        x_vals.append(1.0 / T)
        y_vals.append(l_est)
        
    # Simple linear regression: y = a * x + b
    x_mean = np.mean(x_vals)
    y_mean = np.mean(y_vals)
    
    numerator = sum((x_vals[i] - x_mean) * (y_vals[i] - y_mean) for i in range(len(x_vals)))
    denominator = sum((x_vals[i] - x_mean)**2 for i in range(len(x_vals)))
    
    a = numerator / denominator
    b = y_mean - a * x_mean
    
    # Calculate R^2
    y_pred = [a * x + b for x in x_vals]
    ss_res = sum((y_vals[i] - y_pred[i])**2 for i in range(len(y_vals)))
    ss_tot = sum((y_vals[i] - y_mean)**2 for i in range(len(y_vals)))
    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 1.0
    
    _fitted_params["a"] = a
    _fitted_params["b"] = b
    
    if save_plot:
        os.makedirs("artifacts", exist_ok=True)
        plt.figure()
        plt.scatter(x_vals, y_vals, color='blue', label='Empirical Data')
        plt.plot(x_vals, y_pred, color='red', label=f'Fit: $\lambda = {a:.2f}(1/T) + {b:.2f}$')
        plt.title(f'[SYNTHETIC] LLM Temperature to QRE $\lambda$ Calibration ($R^2 = {r_squared:.3f}$)')
        plt.xlabel('1 / Temperature')
        plt.ylabel('Estimated $\lambda$')
        plt.legend()
        plt.savefig("artifacts/qre_fit.png")
        plt.close()
        
    return a, b, r_squared

def get_calibrated_lambda(temperature: float) -> float:
    """Returns the calibrated lambda for a given temperature."""
    if _fitted_params["a"] is None:
        run_calibration_harness(save_plot=False)
        
    a = _fitted_params["a"]
    b = _fitted_params["b"]
    
    l_val = a * (1.0 / temperature) + b
    # Ensure lambda is strictly positive
    return max(0.01, l_val)
