import pytest
import networkx as nx
from unittest import mock
from app.stability.stability_solver import verify_stability

def test_sybil_attack_flagged_unstable():
    """
    Verify that an agent spawning fake virtual nodes (Sybils) to artificially inflate
    its Shapley value allocation is flagged as unstable by the physical separation oracle.
    """
    # A graph where the "honest" node connects to the adversary,
    # but the adversary spawns 'sybil_1' and 'sybil_2' connected only to itself,
    # claiming they are distinct microgrids.
    G = nx.Graph()
    G.add_edges_from([
        ("honest", "adversary"),
        ("adversary", "sybil_1"),
        ("adversary", "sybil_2")
    ])
    
    def char_fn_with_physical_limits(*args, **kwargs):
        # Physical reality: The adversary and its sybils share the exact same
        # physical interconnection point, so they cannot actually generate more surplus
        # than the adversary alone.
        mapping = {}
        perms = args[2]
        for p in perms:
            # If the honest node is isolated, it gets 50
            if p == frozenset(["honest"]):
                mapping[p] = 50.0
            # If the adversary (and its sybils) acts alone, it gets 30 total
            elif p.issubset(frozenset(["adversary", "sybil_1", "sybil_2"])):
                mapping[p] = 30.0
            # Honest + any combination of adversary/sybils gets exactly 100 max, 
            # because the physical line limits don't care about virtual identities.
            elif "honest" in p and any(n in p for n in ["adversary", "sybil_1", "sybil_2"]):
                mapping[p] = 100.0
            else:
                mapping[p] = 0.0
        return mapping

    # The adversary demands an artificially inflated surplus map, allocating
    # 20 to itself and 20 to each of its Sybils, leaving the honest node with only 40.
    # Total = 40 (honest) + 20 (adv) + 20 (s1) + 20 (s2) = 100.
    proposed_surplus = {
        "honest": 40.0,
        "adversary": 20.0,
        "sybil_1": 20.0,
        "sybil_2": 20.0
    }

    with mock.patch("app.stability.stability_solver.build_characteristic_function", side_effect=char_fn_with_physical_limits):
        result = verify_stability(
            coalition=["honest", "adversary", "sybil_1", "sybil_2"],
            graph=G,
            surplus_map=proposed_surplus
        )
        
        # The solver must flag this as unstable because the honest node can deviate
        # alone and secure 50.0, which is > 40.0. The Sybils' fake valuation fails.
        assert result.is_stable is False
        assert result.deviating_coalition is not None
        assert "honest" in result.deviating_coalition
