import pytest
from app.grid.network_model import ElectricalNetwork, Node, Line
from app.grid.power_flow import ACPowerFlow
from app.grid.certificate import generate_certificate, ConstraintChecker

def test_ac_power_flow_radial():
    net = ElectricalNetwork(base_mva=1.0)
    net.nodes["bus1"] = Node("bus1", 11.0, is_slack=True)
    net.nodes["bus2"] = Node("bus2", 11.0, p_load_kw=1000.0, q_load_kvar=200.0)
    
    net.lines["line1"] = Line("line1", "bus1", "bus2", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=5000.0)
    
    pf = ACPowerFlow(net)
    results = pf.solve()
    
    assert "status" in results
    assert results["status"] == "optimal"
    
    # check voltages
    assert "voltages_pu" in results
    assert results["voltages_pu"]["bus1"] == 1.0
    assert results["voltages_pu"]["bus2"] < 1.0
    
    # check certification
    is_feasible, violations = ConstraintChecker.check_network(net, results)
    assert is_feasible
    
    cert = generate_certificate("neg-1", net, results, violations, 1, solver="ac")
    assert cert["solver"] == "pandapower_AC_NR"
    assert cert["feasible"] is True
    assert cert["inputHash"]

def test_ac_power_flow_overload_exception():
    net = ElectricalNetwork(base_mva=1.0)
    net.nodes["bus1"] = Node("bus1", 11.0, is_slack=True)
    net.nodes["bus2"] = Node("bus2", 11.0, p_load_kw=10000.0, q_load_kvar=2000.0)
    
    net.lines["line1"] = Line("line1", "bus1", "bus2", r_ohms=0.1, x_ohms=0.1, thermal_limit_kw=100.0)
    
    pf = ACPowerFlow(net)
    with pytest.raises(ValueError, match="Thermal limit violation"):
        results = pf.solve()
