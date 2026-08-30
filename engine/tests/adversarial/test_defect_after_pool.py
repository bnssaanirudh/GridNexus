import pytest
import networkx as nx
from unittest import mock
from app.stability.stability_solver import verify_stability
from app.agents.microgrid_agent import MicrogridAgent
from app.agents.secret_field import SecretFloat

class DefectingAgent(MicrogridAgent):
    """
    Adversary (b): Joins a coalition, but immediately attempts to defect
    once capacity is pooled to secure a better deal outside the grand coalition.
    """
    def utility(self, offer: dict) -> float:
        # Standard utility, but the agent's meta-strategy is to pool and then defect
        return super().utility(offer)

def test_defect_after_pool_flagged_unstable():
    """
    Verify that if an agent attempts to defect (forming a highly profitable
    sub-coalition), the farsighted stability solver detects this deviation 
    and blocks the grand coalition from forming.
    """
    # 3-agent graph where the defecting agent can secure a highly profitable
    # side-deal (deviation) with peer_A outside the grand coalition.
    G = nx.Graph()
    G.add_edges_from([("defector", "peer_A"), ("defector", "peer_B")])
    
    def char_fn_with_profitable_defection(*args, **kwargs):
        # Grand coalition (defector, peer_A, peer_B) generates 100
        # But the defector and peer_A can deviate and generate 120 together
        mapping = {}
        perms = args[2]
        for p in perms:
            if p == frozenset(["defector", "peer_A"]):
                mapping[p] = 120.0
            else:
                # Other deviations get default values
                mapping[p] = len(p) * 10.0
        return mapping

    with mock.patch("app.stability.stability_solver.build_characteristic_function", side_effect=char_fn_with_profitable_defection):
        result = verify_stability(
            coalition=["defector", "peer_A", "peer_B"],
            graph=G,
            surplus_map={"defector": 40.0, "peer_A": 30.0, "peer_B": 30.0} # Sum = 100 = v(S)
        )
        
        # The solver must flag this as unstable because defector+peer_A can get 120 > 100
        assert result.is_stable is False
        assert result.deviating_coalition is not None
        assert "defector" in result.deviating_coalition
