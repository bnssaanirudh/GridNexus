import pytest
import numpy as np
from hypothesis import given, strategies as st
from app.grid.network_model import ElectricalNetwork, Node, Line
from app.grid.power_flow import DCPowerFlow
from app.grid.certificate import ConstraintChecker
from app.grid.battery import Battery, BatteryModel

def test_radial_network_overload():
    """Test that a simple radial network detects thermal overloads."""
    net = ElectricalNetwork(base_mva=1.0)
    net.nodes["bus1"] = Node("bus1", 11.0, is_slack=True)
    net.nodes["bus2"] = Node("bus2", 11.0, p_load_kw=1000.0) # 1 MW load
    
    # Line limit is 500 kW
    net.lines["line1"] = Line("line1", "bus1", "bus2", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=500.0)
    
    pf = DCPowerFlow(net)
    results = pf.solve()
    
    is_feasible, violations = ConstraintChecker.check_network(net, results)
    
    assert not is_feasible
    assert any("overload" in v.lower() for v in violations)
    assert results["line_loading_pct"]["line1"] > 100.0

def test_voltage_drop_detected():
    """Test that a large power draw causes undervoltage."""
    net = ElectricalNetwork(base_mva=1.0)
    net.nodes["bus1"] = Node("bus1", 11.0, is_slack=True)
    # Huge load to drop voltage
    net.nodes["bus2"] = Node("bus2", 11.0, p_load_kw=50000.0, v_min_pu=0.95) 
    
    # High resistance line
    net.lines["line1"] = Line("line1", "bus1", "bus2", r_ohms=10.0, x_ohms=10.0, thermal_limit_kw=100000.0)
    
    pf = DCPowerFlow(net)
    results = pf.solve()
    
    is_feasible, violations = ConstraintChecker.check_network(net, results)
    
    assert not is_feasible
    assert any("undervoltage" in v.lower() for v in violations)
    assert results["voltages_pu"]["bus2"] < 0.95

@given(
    power_kw=st.floats(min_value=-100.0, max_value=100.0),
    interval_hours=st.floats(min_value=0.5, max_value=2.0)
)
def test_battery_soc_bounds(power_kw, interval_hours):
    """Property test for battery constraints."""
    batt = Battery(
        id="batt1",
        energy_capacity_kwh=100.0,
        max_charge_kw=50.0,
        max_discharge_kw=50.0,
        efficiency=0.9,
        current_soc_kwh=50.0
    )
    
    is_feasible, new_soc, msg = BatteryModel.simulate_dispatch(batt, power_kw, interval_hours)
    
    if is_feasible:
        assert 0 <= new_soc <= batt.energy_capacity_kwh
        if power_kw > 0:
            assert power_kw <= batt.max_discharge_kw
        else:
            assert abs(power_kw) <= batt.max_charge_kw
    else:
        # Expected to fail if constraints are breached
        pass

def test_power_balance():
    """Test that the slack bus exactly covers the net injection mismatch."""
    net = ElectricalNetwork(base_mva=1.0)
    net.nodes["bus1"] = Node("bus1", 11.0, is_slack=True)
    net.nodes["bus2"] = Node("bus2", 11.0, p_load_kw=1234.5)
    net.nodes["bus3"] = Node("bus3", 11.0, p_gen_kw=567.8)
    
    net.lines["line1"] = Line("line1", "bus1", "bus2", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=10000.0)
    net.lines["line2"] = Line("line2", "bus2", "bus3", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=10000.0)
    
    pf = DCPowerFlow(net)
    results = pf.solve()
    
    # Slack should provide exactly Load - Gen
    expected_slack_kw = 1234.5 - 567.8
    
    assert abs(results["slack_power_kw"] - expected_slack_kw) < 1e-6
    assert results["power_balance_error_kw"] < 1e-6
