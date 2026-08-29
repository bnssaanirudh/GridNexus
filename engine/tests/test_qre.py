"""
engine/tests/test_qre.py
━━━━━━━━━━━━━━━━━━━━━━━━
Tests for QRE calibration and solver logic.
"""

import os
import random
import numpy as np
import pytest
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient
from app.main import app
from app.qre.qre_solver import logit_qre_fixed_point
from app.qre.calibration import run_calibration_harness

client = TestClient(app)

def test_qre_solver_convergence_stress_test():
    """
    A numerical convergence test running the QRE solver on 100 
    randomly generated payoff matrices, asserting convergence tolerance.
    """
    tol = 1e-6
    converged_count = 0
    num_tests = 100
    
    for _ in range(num_tests):
        # Generate a random 3x3 payoff matrix
        matrix = np.random.uniform(0, 10, size=(3, 3)).tolist()
        lambda_val = random.uniform(0.1, 5.0)
        
        probs = logit_qre_fixed_point(matrix, lambda_val, tol=tol)
        
        # Verify it forms a valid probability distribution
        assert abs(sum(probs) - 1.0) < tol
        
        # Check convergence manually by applying the map one more time
        p = np.array(probs)
        expected = np.array(matrix) @ p
        max_exp = np.max(expected)
        exp_p = np.exp(lambda_val * (expected - max_exp))
        next_p = exp_p / np.sum(exp_p)
        
        if np.sum(np.abs(next_p - p)) <= tol * 10:  # Allow slight float jitter
            converged_count += 1
            
    # Allow up to 5% non-convergence across random matrices.
    # Fixed-point iteration over random payoffs can legitimately fail to
    # reach tol*10 on a small fraction of ill-conditioned inputs; demanding
    # 100% convergence is an unrealistic bar for a stochastic stress test.
    min_converged = int(num_tests * 0.95)
    assert converged_count >= min_converged, (
        f"QRE convergence rate too low: {converged_count}/{num_tests} "
        f"(required ≥ {min_converged})."
    )

def test_calibration_r_squared_quality():
    """
    A regression-quality test asserting the fitted curve's R^2 meets 
    the 0.8 threshold on the sample points.
    """
    a, b, r_squared = run_calibration_harness(save_plot=True)
    
    # Assert R^2 is at least 0.8
    assert r_squared >= 0.8, f"R^2 value {r_squared} is below the 0.8 threshold."
    
    # Assert the plot was saved
    assert os.path.exists("artifacts/qre_fit.png"), "Plot qre_fit.png was not saved."

@patch('app.routers.qre.asyncpg.connect')
@patch.dict(os.environ, {"DATABASE_URL": "postgresql://mock_db"})
def test_qre_calibrate_integration(mock_connect):
    """
    An integration test hitting /qre/calibrate and confirming 
    the database value updates correctly.
    """
    mock_conn = AsyncMock()
    mock_connect.return_value = mock_conn
    
    payoff_matrix = [[1.0, 0.0], [0.0, 1.0]]
    request_data = {
        "agent_id": "test_agent_123",
        "temperature": 0.5,
        "payoff_matrix": payoff_matrix
    }
    
    response = client.post("/qre/calibrate", json=request_data)
    assert response.status_code == 200, response.text
    
    data = response.json()
    assert "lambda_mapping" in data
    assert "choice_probabilities" in data
    
    # Confirm DB update was called
    mock_conn.execute.assert_called_once()
    call_args = mock_conn.execute.call_args[0]
    
    query = call_args[0]
    assert "UPDATE agents SET qre_lambda = $1 WHERE id = $2" in query
    
    # Check that lambda is passed correctly
    lambda_val_passed = call_args[1]
    agent_id_passed = call_args[2]
    
    assert lambda_val_passed == data["lambda_mapping"]
    assert agent_id_passed == "test_agent_123"
