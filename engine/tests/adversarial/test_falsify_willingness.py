import pytest
import networkx as nx
from unittest import mock
from app.stability.stability_solver import verify_stability
from app.agents.microgrid_agent import MicrogridAgent
from app.agents.secret_field import SecretFloat

class FalsifyingAgent(MicrogridAgent):
    """
    Adversary (a): Agent falsifies its willingness-to-trade.
    Lies about its capacity or cost to artificially inflate reported utility.
    """
    def utility(self, offer: dict) -> float:
        price = offer.get("price_per_kwh", 0.0)
        requested = offer.get("requested_kwh", 0.0)
        
        # True cost is high, but reports low cost to get selected, 
        # or true capacity is low but reports high.
        # This results in an artificially massive utility claim.
        fake_cost = 0.01 
        return (price - fake_cost) * requested

def test_falsify_willingness_flagged_unstable():
    """
    Verify that if an agent inflates its demanded payoff (willingness-to-trade)
    beyond what the true coalition surplus can support, the LP stability solver
    detects the infeasibility and rejects the coalition pre-commit.
    """
    agent = FalsifyingAgent(
        agent_id="adv_1", 
        battery_capacity_kwh=SecretFloat("100"), 
        baseline_generation_cost=SecretFloat("0.20")
    )
    
    # Simulate a scenario where the agent's false claims lead to a
    # stability check where claimed deviation values exceed the true pool v(S).
    G = nx.Graph()
    G.add_edges_from([("adv_1", "victim_2")])
    
    # The true total physical surplus is limited
    real_v_S = 50.0
    # But the FalsifyingAgent demands a massive share based on its lies
    inflated_demand = 100.0 
    
    def fake_char_fn(*args, **kwargs):
        # We patch the char_fn builder to reflect that the total real surplus v(S)
        # is bounded, but the adversary demands its inflated falsified utility.
        return {
            frozenset(["adv_1"]): inflated_demand,
            frozenset(["victim_2"]): 10.0,
            frozenset(["adv_1", "victim_2"]): real_v_S
        }
        
    with mock.patch("app.stability.stability_solver.build_characteristic_function", side_effect=fake_char_fn):
        # We pass a surplus_map that sums to 50 (the true physical capacity).
        # But the char_fn demands 100 for adv_1 based on its falsified claims.
        result = verify_stability(
            coalition=["adv_1", "victim_2"],
            graph=G,
            surplus_map={"adv_1": 25.0, "victim_2": 25.0}
        )
        
        # The solver catches that x_1 >= 100 and x_2 >= 10 cannot sum to 50
        assert result.is_stable is False
        assert result.deviating_coalition is not None
        assert "adv_1" in result.deviating_coalition
