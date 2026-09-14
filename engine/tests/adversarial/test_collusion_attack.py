import pytest
import networkx as nx
from unittest import mock
from app.stability.stability_solver import verify_stability

@pytest.mark.parametrize("colluder_count, demand_per_colluder, expected_status", [
    (2, 50.0, "BLOCKING_COALITION_FOUND"),
    (3, 30.0, "BLOCKING_COALITION_FOUND"),
    (2, 20.0, "BLOCKING_COALITION_FOUND"),
    (2, 5.0, "EXACT_STABLE")

])
def test_collusion_attack_flagged_unstable(colluder_count, demand_per_colluder, expected_status):
    """
    Verify that if adversarial agents collude to bid-rig and depress the
    honest agent's surplus allocation, the stability solver rejects the contract.
    """
    G = nx.Graph()
    colluders = [f"colluder_{i}" for i in range(1, colluder_count + 1)]
    edges = [("honest", c) for c in colluders] + [(colluders[i], colluders[i+1]) for i in range(len(colluders)-1)]
    G.add_edges_from(edges)
    
    def char_fn_with_outside_options(*args, **kwargs):
        mapping = {}
        perms = args[2]
        for p in perms:
            if len(p) == 1:
                mapping[p] = 10.0
            elif "honest" in p and len(p) == 2:
                mapping[p] = 150.0
            elif p == frozenset(colluders):
                mapping[p] = 10.0
            elif len(p) == colluder_count + 1:
                mapping[p] = 120.0
            else:
                mapping[p] = 0.0
        return mapping

    # Grand coalition is worth 120. 
    def char_fn_with_outside_options(*args, **kwargs):
        mapping = {}
        perms = args[2]
        for p in perms:
            if len(p) == colluder_count + 1:
                mapping[p] = 120.0
            elif len(p) == 1:
                mapping[p] = 10.0
            elif "honest" in p and len(p) == 2:
                mapping[p] = 150.0
            elif p == frozenset(colluders):
                mapping[p] = 10.0
            else:
                mapping[p] = 0.0
        return mapping

    if demand_per_colluder == 5.0:
         def char_fn_with_outside_options(*args, **kwargs):
             mapping = {}
             perms = args[2]
             for p in perms:
                 if len(p) == colluder_count + 1:
                     mapping[p] = 120.0
                 elif len(p) == 1:
                     mapping[p] = 10.0
                 elif "honest" in p and len(p) == 2:
                     # To make (2, 5.0) stable, honest + 1 colluder should be worth less than 110 + 5 = 115
                     mapping[p] = 110.0
                 elif p == frozenset(colluders):
                     mapping[p] = 10.0
                 else:
                     mapping[p] = 0.0
             return mapping

    proposed_surplus = {"honest": 120.0 - (demand_per_colluder * colluder_count)}
    for c in colluders:
        proposed_surplus[c] = demand_per_colluder

    with mock.patch("app.stability.stability_solver.build_characteristic_function", side_effect=char_fn_with_outside_options):
        result = verify_stability(
            coalition=["honest"] + colluders,
            graph=G,
            surplus_map=proposed_surplus
        )
        
        assert result.status == expected_status
        if expected_status == "BLOCKING_COALITION_FOUND":
            assert result.deviating_coalition is not None
            assert "honest" in result.deviating_coalition
