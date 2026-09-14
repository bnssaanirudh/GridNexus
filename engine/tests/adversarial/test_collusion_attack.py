import pytest
import networkx as nx
from unittest import mock
from app.stability.stability_solver import verify_stability

def test_collusion_attack_flagged_unstable():
    """
    Verify that if two adversarial agents collude to bid-rig and depress the
    honest agent's surplus allocation, the stability solver rejects the contract.
    """
    # A graph where the honest node can connect to either colluder A or colluder B
    G = nx.Graph()
    G.add_edges_from([
        ("honest", "colluder_A"),
        ("honest", "colluder_B"),
        ("colluder_A", "colluder_B")
    ])
    
    def char_fn_with_outside_options(*args, **kwargs):
        # The honest node's power is highly valuable.
        mapping = {}
        perms = args[2]
        for p in perms:
            # Standalone values
            if len(p) == 1:
                mapping[p] = 10.0
            # Honest with any single colluder is physically worth 150 because
            # without the cartel price-fixing, the true market clearing value is high.
            elif p == frozenset(["honest", "colluder_A"]) or p == frozenset(["honest", "colluder_B"]):
                mapping[p] = 150.0
            # Colluders without honest node are worth 10
            elif p == frozenset(["colluder_A", "colluder_B"]):
                mapping[p] = 10.0
            # Grand coalition is worth 120 (this is what the cartel artificially restricts it to)
            elif len(p) == 3:
                mapping[p] = 120.0
            else:
                mapping[p] = 0.0
        return mapping

    # The colluders act as a cartel, demanding 50 each from the grand coalition (100 total),
    # leaving the honest node with only 20, despite the honest node bringing most of the value.
    proposed_surplus = {
        "honest": 20.0,
        "colluder_A": 50.0,
        "colluder_B": 50.0
    }

    with mock.patch("app.stability.stability_solver.build_characteristic_function", side_effect=char_fn_with_outside_options):
        result = verify_stability(
            coalition=["honest", "colluder_A", "colluder_B"],
            graph=G,
            surplus_map=proposed_surplus
        )
        
        # The solver must flag this as unstable because the honest node can defect
        # and form a sub-coalition with one of the colluders (who would rationally 
        # break the cartel if offered, e.g., 40, leaving the honest node with 40).
        # Specifically, the core constraint for S={honest, colluder_A} requires 
        # x(honest) + x(colluder_A) >= v(S) -> 20 + 50 >= 80 -> False (70 < 80).
        assert result.is_stable is False
        assert result.deviating_coalition is not None
        assert "honest" in result.deviating_coalition
