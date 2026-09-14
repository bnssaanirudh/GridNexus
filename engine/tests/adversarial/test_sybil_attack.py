import pytest
import networkx as nx
from unittest import mock
from app.stability.stability_solver import verify_stability

@pytest.mark.parametrize("sybil_count, adv_demand, expected_status", [
    (2, 20.0, "BLOCKING_COALITION_FOUND"), # Original case: adv + 2 sybils demand 60.0
    (5, 10.0, "BLOCKING_COALITION_FOUND"), # adv + 5 sybils demand 60.0
    (1, 5.0, "EXACT_STABLE"), # adv + 1 sybil demand 10.0 (honest gets 90.0)
])
def test_sybil_attack_flagged_unstable(sybil_count, adv_demand, expected_status):
    """
    Verify that an agent spawning fake virtual nodes (Sybils) to artificially inflate
    its Shapley value allocation is flagged as unstable by the physical separation oracle.
    """
    G = nx.Graph()
    sybils = [f"sybil_{i}" for i in range(1, sybil_count + 1)]
    edges = [("honest", "adversary")] + [("adversary", s) for s in sybils]
    G.add_edges_from(edges)
    
    def char_fn_with_physical_limits(*args, **kwargs):
        mapping = {}
        perms = args[2]
        adv_nodes = set(["adversary"] + sybils)
        for p in perms:
            if p == frozenset(["honest"]):
                mapping[p] = 50.0
            elif p.issubset(frozenset(adv_nodes)):
                mapping[p] = 30.0 if adv_demand != 5.0 else 0.0
            elif "honest" in p and any(n in p for n in adv_nodes):
                mapping[p] = 100.0
            else:
                mapping[p] = 0.0
        return mapping

    # Total demand must sum to 100
    adv_total = adv_demand * (sybil_count + 1)
    honest_demand = 100.0 - adv_total
    
    proposed_surplus = {"honest": honest_demand, "adversary": adv_demand}
    for s in sybils:
        proposed_surplus[s] = adv_demand

    with mock.patch("app.stability.stability_solver.build_characteristic_function", side_effect=char_fn_with_physical_limits):
        result = verify_stability(
            coalition=["honest", "adversary"] + sybils,
            graph=G,
            surplus_map=proposed_surplus
        )
        
        assert result.status == expected_status
        if expected_status == "BLOCKING_COALITION_FOUND":
            assert result.deviating_coalition is not None
