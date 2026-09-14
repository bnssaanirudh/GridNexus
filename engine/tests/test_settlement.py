import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta
from app.main import app
from app.deps import get_db

client = TestClient(app)

async def override_get_db():
    mock_session = AsyncMock()
    
    class MockResult:
        def __init__(self, obj):
            self.obj = obj
        def scalars(self):
            class MockScalars:
                def __init__(self, obj):
                    self.obj = obj
                def first(self):
                    return self.obj
            return MockScalars(self.obj)
            
    # Need to fake db.execute returning something
    class MockCert:
        def __init__(self):
            self.is_valid = True
            self.topology_hash = "mock_hash"
            self.telemetry_timestamp = datetime.now(timezone.utc)
            self.proposed_quantity_kwh = 10.0
            self.corrected_quantity_kwh = None
            
    mock_session.execute.return_value = MockResult(MockCert())
    yield mock_session

# We will mock verify_and_correct_dispatch so we don't need real db state
@patch("app.routers.settlement.build_topology_from_db")
@patch("app.routers.settlement.verify_and_correct_dispatch")
def test_propose_trade_feasible(mock_verify, mock_build):
    from app.grid.network_model import ElectricalNetwork, Node, Line
    net = ElectricalNetwork(base_mva=1.0)
    net.add_node(Node("bus1", is_slack=True, v_min_pu=0.9, v_max_pu=1.1, p_gen_kw=0.0, p_load_kw=0.0, q_gen_kvar=0.0, q_load_kvar=0.0))
    net.add_node(Node("bus2", is_slack=False, v_min_pu=0.9, v_max_pu=1.1, p_gen_kw=0.0, p_load_kw=0.0, q_gen_kvar=0.0, q_load_kvar=0.0))
    net.add_line(Line("line1", "bus1", "bus2", 0.01, 0.01, 1000.0))
    
    mock_build.return_value = (net, 1)
    # mock_verify returns (is_ok, final_kw, solver_used, pf_results)
    mock_verify.return_value = (True, 10.0, "dc", {"voltages_pu": {"bus1": 1.0, "bus2": 1.0}, "line_flows_kw": {"line1": 10.0}, "line_loading_pct": {"line1": 1.0}})
    
    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.post(
            "/settlement/propose",
            json={
                "negotiation_id": "neg_123",
                "seller_id": "bus1",
                "buyer_id": "bus2",
                "proposed_kw": 10.0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "APPROVED"
        assert data["final_kw"] == 10.0
    finally:
        app.dependency_overrides = {}

@patch("app.routers.settlement.build_topology_from_db")
@patch("app.routers.settlement.verify_and_correct_dispatch")
def test_propose_trade_infeasible_correction(mock_verify, mock_build):
    from app.grid.network_model import ElectricalNetwork, Node, Line
    net = ElectricalNetwork(base_mva=1.0)
    net.add_node(Node("bus1", is_slack=True, v_min_pu=0.9, v_max_pu=1.1, p_gen_kw=0.0, p_load_kw=0.0, q_gen_kvar=0.0, q_load_kvar=0.0))
    net.add_node(Node("bus2", is_slack=False, v_min_pu=0.9, v_max_pu=1.1, p_gen_kw=0.0, p_load_kw=0.0, q_gen_kvar=0.0, q_load_kvar=0.0))
    net.add_line(Line("line1", "bus1", "bus2", 0.01, 0.01, 100.0))
    
    mock_build.return_value = (net, 1)
    
    # Returning a corrected quantity
    mock_verify.return_value = (True, 90.0, "socp", {"voltages_pu": {"bus1": 1.0, "bus2": 0.99}, "line_flows_kw": {"line1": 90.0}, "line_loading_pct": {"line1": 90.0}})
    
    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.post(
            "/settlement/propose",
            json={
                "negotiation_id": "neg_124",
                "seller_id": "bus1",
                "buyer_id": "bus2",
                "proposed_kw": 5000.0 
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "CORRECTED"
        assert data["final_kw"] == 90.0
    finally:
        app.dependency_overrides = {}

@patch("app.routers.settlement.build_topology_from_db")
@patch("app.routers.settlement.validate_certificate_state")
def test_telemetry_update_stale_certificate(mock_validate, mock_build):
    mock_build.return_value = (None, 1)
    mock_validate.return_value = (False, "Certificate invalidated: telemetry age exceeds limit")
    
    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.post(
            "/settlement/telemetry_update",
            json={
                "trade_id": "trd_123",
                "measured_seller_kw": 10.0,
                "measured_buyer_kw": 10.0,
                "telemetry_timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ROLLBACK_INITIATED"
    finally:
        app.dependency_overrides = {}
