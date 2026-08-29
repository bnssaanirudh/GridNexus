import pytest
import networkx as nx
from app.stability.stability_solver import verify_stability
from app.schemas.stability import SellerProfile, BuyerProfile
from app.stability.value_model import VPPValueModel

def test_efficiency_and_ir_properties():
    # 3-agent graph
    G = nx.Graph()
    G.add_edges_from([("seller1", "buyer1"), ("seller1", "seller2")])
    coalition = ["seller1", "seller2", "buyer1"]
    
    profiles = {
        "seller1": SellerProfile(generation_cost=2.0, available_capacity=100.0, outside_option=10.0),
        "seller2": SellerProfile(generation_cost=3.0, available_capacity=50.0, outside_option=5.0),
        "buyer1": BuyerProfile(energy_value=10.0, demand=120.0, outside_option=20.0)
    }
    
    value_model = VPPValueModel(congestion_threshold=200.0)
    
    res = verify_stability(coalition, G, profiles, value_model=value_model)
    
    v_S = value_model.evaluate(frozenset(coalition), profiles)
    
    # Efficiency: sum of allocation should equal v_S
    assert abs(sum(res.allocation.values()) - v_S) < 1e-4
    
    # Individual Rationality: x_i >= outside_option_i
    for agent, alloc in res.allocation.items():
        assert alloc >= profiles[agent].outside_option - 1e-4

def test_non_additive_coalition():
    # Show that v(A, B) > v(A) + v(B) due to matching and diversity
    profiles = {
        "seller1": SellerProfile(generation_cost=2.0, available_capacity=100.0),
        "buyer1": BuyerProfile(energy_value=10.0, demand=100.0)
    }
    value_model = VPPValueModel()
    
    v_seller = value_model.evaluate(frozenset(["seller1"]), profiles) # 0, no match
    v_buyer = value_model.evaluate(frozenset(["buyer1"]), profiles) # 0, no match
    v_both = value_model.evaluate(frozenset(["seller1", "buyer1"]), profiles) # 100 * (10 - 2) = 800
    
    assert v_both > v_seller + v_buyer

def test_sub_additive_due_to_congestion():
    # Show that v(A, B) < v(A) + v(B) if we somehow exceed threshold 
    # Wait, v(A) and v(B) would be 0 if they don't match. 
    # Let A be a seller/buyer pair, B be another pair.
    profiles = {
        "s1": SellerProfile(generation_cost=2.0, available_capacity=100.0),
        "b1": BuyerProfile(energy_value=10.0, demand=100.0),
        "s2": SellerProfile(generation_cost=2.0, available_capacity=100.0),
        "b2": BuyerProfile(energy_value=10.0, demand=100.0)
    }
    
    # Threshold 150. Pair A matches 100, Pair B matches 100. Total 200 > 150.
    value_model = VPPValueModel(congestion_threshold=150.0, congestion_penalty_rate=5.0, diversity_bonus_per_seller=0.0)
    
    v_A = value_model.evaluate(frozenset(["s1", "b1"]), profiles) # 800
    v_B = value_model.evaluate(frozenset(["s2", "b2"]), profiles) # 800
    
    v_grand = value_model.evaluate(frozenset(["s1", "b1", "s2", "b2"]), profiles)
    # Matched = 200. Value = 200 * 8 = 1600. Excess = 50. Penalty = 50 * 5 = 250.
    # Total = 1350.
    assert v_grand < v_A + v_B

def test_least_core_allocation():
    G = nx.Graph()
    G.add_edges_from([("s1", "b1"), ("s2", "b1"), ("s1", "s2")])
    coalition = ["s1", "b1", "s2"]
    
    profiles = {
        "s1": SellerProfile(generation_cost=2.0, available_capacity=100.0),
        "b1": BuyerProfile(energy_value=10.0, demand=100.0),
        "s2": SellerProfile(generation_cost=2.0, available_capacity=100.0),
    }
    # This game is empty core because s1+b1 can form a coalition worth 800.
    # s2+b1 can form a coalition worth 800.
    # v(S) = 800 (since demand is only 100).
    # To satisfy s1+b1: x_s1 + x_b1 >= 800
    # To satisfy s2+b1: x_s2 + x_b1 >= 800
    # Sum: x_s1 + x_s2 + 2x_b1 >= 1600. Since x_s1+x_s2+x_b1 = 800, this requires x_b1 >= 800.
    # Then x_s1 = 0, x_s2 = 0. But wait, if x_b1 = 800, x_s1 = 0, x_s2 = 0, then x_s1 + x_b1 = 800 >= 800.
    # Actually, core is NOT empty. x_b1 = 800, x_s1 = 0, x_s2 = 0 works. 
    # Let's verify:
    value_model = VPPValueModel(diversity_bonus_per_seller=0.0)
    res = verify_stability(coalition, G, profiles, value_model)
    
    assert res.is_stable is True
    assert res.epsilon_star <= 1e-6
