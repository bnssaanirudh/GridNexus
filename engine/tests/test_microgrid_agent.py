"""
engine/tests/test_microgrid_agent.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Unit tests for the MicrogridAgent, testing utility scenarios and
ensuring the custom SecretFloat structurally prevents serialization leaks.
"""

import pytest
from pydantic import ValidationError

from app.agents.microgrid_agent import MicrogridAgent
from app.agents.secret_field import SecretFloat


def test_secret_float_serialization_raises():
    """Attempting to naively serialize SecretFloat must raise an error."""
    agent = MicrogridAgent(
        agent_id="test-1",
        battery_capacity_kwh=SecretFloat(50.0),
        baseline_generation_cost=SecretFloat(10.0),
    )
    
    with pytest.raises(ValueError, match="SecretFloat cannot be serialized"):
        agent.model_dump()
        
    with pytest.raises(ValueError, match="SecretFloat cannot be serialized"):
        agent.model_dump_json()


def test_secret_float_values_accessible_internally():
    """The internal getters should still work for calculation."""
    agent = MicrogridAgent(
        agent_id="test-1",
        battery_capacity_kwh=SecretFloat(50.0),
        baseline_generation_cost=SecretFloat(10.0),
    )
    assert agent.battery_capacity_kwh.get_secret_value() == 50.0
    assert agent.baseline_generation_cost.get_secret_value() == 10.0


def test_utility_scenario_1_profitable_trade():
    """Scenario 1: Profitable trade within capacity.
    
    Capacity = 50, Cost = 10.
    Offer: Price = 12, Requested = 30.
    Expected utility = (12 - 10) * 30 = 60.0
    """
    agent = MicrogridAgent(
        agent_id="test-1",
        battery_capacity_kwh=SecretFloat(50.0),
        baseline_generation_cost=SecretFloat(10.0),
    )
    utility = agent.utility({"price_per_kwh": 12.0, "requested_kwh": 30.0})
    assert utility == 60.0


def test_utility_scenario_2_unprofitable_trade():
    """Scenario 2: Unprofitable trade within capacity.
    
    Capacity = 50, Cost = 10.
    Offer: Price = 8, Requested = 30.
    Expected utility = (8 - 10) * 30 = -60.0
    """
    agent = MicrogridAgent(
        agent_id="test-1",
        battery_capacity_kwh=SecretFloat(50.0),
        baseline_generation_cost=SecretFloat(10.0),
    )
    utility = agent.utility({"price_per_kwh": 8.0, "requested_kwh": 30.0})
    assert utility == -60.0


def test_utility_scenario_3_exceeds_capacity():
    """Scenario 3: Requested amount exceeds physical battery capacity.
    
    Capacity = 50, Cost = 10.
    Offer: Price = 12, Requested = 60.
    Expected utility = -inf
    """
    agent = MicrogridAgent(
        agent_id="test-1",
        battery_capacity_kwh=SecretFloat(50.0),
        baseline_generation_cost=SecretFloat(10.0),
    )
    utility = agent.utility({"price_per_kwh": 12.0, "requested_kwh": 60.0})
    assert utility == float("-inf")
