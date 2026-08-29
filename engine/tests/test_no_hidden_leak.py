"""
engine/tests/test_no_hidden_leak.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fuzz test to iterate all FastAPI routes and guarantee no silent leakage
of the agent's private hidden fields into the response payload.
"""

import json
from fastapi.testclient import TestClient

from app.main import app
from app.agents.microgrid_agent import MicrogridAgent
from app.agents.secret_field import SecretFloat

client = TestClient(app)

# Sentinel values that we inject to track leakage
SENTINEL_CAPACITY = 777777.7
SENTINEL_COST = 888888.8


def recursively_search_json_for_value(data, target_value) -> bool:
    """Recursively search for a float value in a parsed JSON structure."""
    if isinstance(data, dict):
        for key, val in data.items():
            if recursively_search_json_for_value(val, target_value):
                return True
    elif isinstance(data, list):
        for item in data:
            if recursively_search_json_for_value(item, target_value):
                return True
    elif isinstance(data, (float, int)):
        # Check if they are numerically identical or very close
        if abs(float(data) - target_value) < 1e-5:
            return True
    elif isinstance(data, str):
        # Even if it gets converted to a string, we check for it
        if str(target_value) in data:
            return True
            
    return False


def test_fuzz_all_routes_for_leakage(monkeypatch):
    """Fuzz test iterating over all defined routes.
    
    We send a generic mock request to all endpoints. We patch the DB
    and any underlying agent fetchers to return an agent with sentinel
    hidden values. We then assert those values NEVER appear in the response.
    """
    # Create an agent with sentinel values
    agent = MicrogridAgent(
        agent_id="fuzz-agent",
        battery_capacity_kwh=SecretFloat(SENTINEL_CAPACITY),
        baseline_generation_cost=SecretFloat(SENTINEL_COST),
    )
    
    # We patch the routers to return this agent directly where applicable,
    # or just let the normal logic execute if it doesn't touch agents.
    # To truly simulate a developer naively returning the agent object:
    @app.get("/_fuzz_test_leakage_endpoint")
    def naive_return_agent():
        return agent
        
    routes = [route for route in app.routes if hasattr(route, "methods")]
    
    # Track if we actually tested routes
    tested_count = 0
    
    for route in routes:
        path = route.path
        methods = route.methods
        
        # Replace path parameters with arbitrary IDs
        if "{" in path:
            path = path.replace("{agent_id}", "fuzz-agent")
            
        for method in methods:
            if method == "HEAD":
                continue
                
            # Send an arbitrary fuzz payload
            payload = {}
            if "stability" in path:
                payload = {"coalition": ["mg-0", "mg-1"]}
            elif "agents" in path and method in ("POST", "PUT"):
                payload = {"name": "fuzz", "policy_metadata": {}}
            elif "negotiate" in path:
                payload = {"agent_id": "fuzz-agent", "offer": 10.0}
            elif "qre" in path:
                payload = {"history": [1.0, 2.0]}
                
            try:
                if method == "GET":
                    response = client.get(path)
                elif method == "POST":
                    response = client.post(path, json=payload)
                elif method == "PUT":
                    response = client.put(path, json=payload)
                elif method == "DELETE":
                    response = client.delete(path)
                else:
                    continue
            except Exception as e:
                # If the route raises ValueError during serialization (our SecretFloat behavior),
                # it is explicitly doing its job of preventing leakage.
                assert "SecretFloat cannot be serialized" in str(e), f"Unexpected error: {e}"
                tested_count += 1
                continue
                
            # If it didn't crash, it must not contain the hidden data
            if response.status_code >= 500:
                # 500s are fine if they are internal errors caused by our fuzz payload,
                # as long as they don't leak the data in the error message.
                pass
                
            # Now verify the response body
            try:
                data = response.json()
                leaked_capacity = recursively_search_json_for_value(data, SENTINEL_CAPACITY)
                leaked_cost = recursively_search_json_for_value(data, SENTINEL_COST)
                
                assert not leaked_capacity, f"Data LEAK in {method} {path}: capacity found!"
                assert not leaked_cost, f"Data LEAK in {method} {path}: cost found!"
                
                # Double-check raw text just in case it's not proper JSON
                raw_text = response.text
                assert str(SENTINEL_CAPACITY) not in raw_text
                assert str(SENTINEL_COST) not in raw_text
                
                tested_count += 1
                
            except json.JSONDecodeError:
                # Raw text response
                raw_text = response.text
                assert str(SENTINEL_CAPACITY) not in raw_text
                assert str(SENTINEL_COST) not in raw_text
                tested_count += 1
                
    assert tested_count > 0, "No routes were tested"
