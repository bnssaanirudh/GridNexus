from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

@patch("app.main.check_db_health", return_value=True)
@patch("app.main.check_redis_health", return_value=True)
def test_ready_check_success(mock_redis, mock_db):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "up", "redis": "up"}

@patch("app.main.check_db_health", return_value=False)
@patch("app.main.check_redis_health", return_value=True)
def test_ready_check_db_down(mock_redis, mock_db):
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "db": "down", "redis": "up"}

# Agents
def test_create_agent_valid():
    response = client.post("/agents", json={"name": "Test Agent", "microgridId": "mg-1", "policy_metadata": {"key": "val"}})
    assert response.status_code == 200
    assert response.json()["name"] == "Test Agent"

def test_create_agent_invalid():
    # Missing required 'name'
    response = client.post("/agents", json={"policy_metadata": {"key": "val"}})
    assert response.status_code == 422

@patch("app.routers.negotiate._fetch_agent", return_value={"capacity": 100.0, "cost": 10.0})
def test_negotiate_valid(mock_fetch):
    response = client.post("/negotiate", json={
        "agent_id": "a1", 
        "opponent_id": "a2",
        "surplus": 100.0, 
        "round_number": 1, 
        "negotiation_id": "neg_test_1"
    })
    assert response.status_code == 200
    assert "action" in response.json()

def test_negotiate_invalid():
    # Negative surplus logic raises 422 if we rely on pydantic, or 400 if our code catches it
    # Pydantic will raise 422 for missing required fields
    response = client.post("/negotiate", json={"agent_id": "a1", "surplus": -10.0})
    # Will fail early on pydantic or inside endpoint before fetch_agent
    assert response.status_code == 422

# Stability
@patch("app.routers.stability.build_topology_from_db")
def test_stability_valid(mock_build):
    import networkx as nx
    G = nx.Graph()
    G.add_edge("mg-0", "mg-1")
    mock_build.return_value = (G, -1)
    # mg-0 and mg-1 are adjacent in the default 5x10 city-grid (row 0, cols 0 and 1)
    response = client.post("/stability/verify", json={"coalition": ["mg-0", "mg-1"]})
    print(response.json())
    assert response.status_code == 200
    assert response.json()["isStable"] == True

def test_stability_invalid():
    # Empty coalition raises 400
    response = client.post("/stability/verify", json={"coalition": []})
    assert response.status_code == 400

# Oracle
_VALID_ORACLE_BODY = {
    "state": {
        "total_pooled_capacity_kwh": 200.0,
        "participating_microgrid_count": 5,
        "aggregate_demand_signal": 0.6,
        "average_market_price": 0.18,
        "round_fraction": 0.4,
        "stability_margin": 0.05,
        "peer_cooperation_rate": 0.5,
        "exogenous_stress_index": 0.3,
    }
}

@patch("app.routers.oracle.AsyncSessionLocal")
def test_oracle_valid(mock_sl):
    mock_session = MagicMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_sl.return_value = mock_session

    response = client.post("/oracle/signal", json=_VALID_ORACLE_BODY)
    assert response.status_code == 200
    data = response.json()
    assert "signal" in data
    assert "confidence" in data
    assert "broadcast_text" in data

@patch("app.routers.oracle.AsyncSessionLocal")
def test_oracle_invalid(mock_sl):
    # Missing required `state` field returns 422 (Pydantic validation error)
    mock_session = MagicMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_sl.return_value = mock_session

    response = client.post("/oracle/signal", json={})
    assert response.status_code == 422

# QRE
@patch("app.routers.qre.update_agent_qre_lambda")
def test_qre_valid(mock_update):
    response = client.post("/qre/calibrate", json={
        "agent_id": "test", 
        "temperature": 2.0, 
        "payoff_matrix": [[1.0, 0.0], [0.0, 1.0]]
    })
    assert response.status_code == 200
    assert "lambda_mapping" in response.json()

def test_qre_invalid():
    # Negative temperature raises 400
    response = client.post("/qre/calibrate", json={
        "agent_id": "test", 
        "temperature": -1.0, 
        "payoff_matrix": [[1.0, 0.0], [0.0, 1.0]]
    })
    assert response.status_code == 400
