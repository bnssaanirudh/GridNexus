"""
engine/tests/test_stability_properties.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hypothesis-based property tests for the Farsighted Coalitional Stability solver.
"""

from __future__ import annotations

import hypothesis.strategies as st
import networkx as nx
from hypothesis import HealthCheck, given, settings

from app.graph.planar_graph import verify_planarity
from app.stability.stability_solver import StabilityResult, verify_stability


@st.composite
def planar_graph_strategy(draw) -> nx.Graph:
    """Generate a random planar graph (trees and forests are always planar)."""
    n = draw(st.integers(min_value=2, max_value=15))
    G = nx.Graph()
    for i in range(n):
        G.add_node(f"mg-{i}", microgrid_id=f"mg-{i}", lat=0.0, lon=0.0)
        
    for i in range(1, n):
        parent = draw(st.integers(min_value=0, max_value=i - 1))
        G.add_edge(f"mg-{i}", f"mg-{parent}", capacity_kw=10.0)
        
    return verify_planarity(G)


@st.composite
def coalition_and_graph_strategy(draw):
    """Draw a planar graph and a connected subset (coalition) from it."""
    graph = draw(planar_graph_strategy())
    nodes = list(graph.nodes())
    
    # We must pick a *connected* subset of nodes to form a permissible coalition.
    seed = draw(st.sampled_from(nodes))
    coalition = {seed}
    
    target_size = draw(st.integers(min_value=1, max_value=len(nodes)))
    
    # Expand coalition randomly via neighbors
    while len(coalition) < target_size:
        frontier = set()
        for node in coalition:
            for nbr in graph.neighbors(node):
                if nbr not in coalition:
                    frontier.add(nbr)
                    
        if not frontier:
            break
            
        next_node = draw(st.sampled_from(list(frontier)))
        coalition.add(next_node)
        
    return graph, list(coalition)


@settings(
    max_examples=50,
    suppress_health_check=[HealthCheck.too_slow],
    deadline=None
)
@given(cg=coalition_and_graph_strategy())
def test_stability_solver_properties(cg):
    """Property test: the solver should never crash and always return a valid StabilityResult."""
    graph, coalition = cg
    
    # The solver implicitly assumes the coalition is connected.
    # Our fixed strategy ensures this is true.
    assert nx.is_connected(graph.subgraph(coalition)), "Coalition should be connected"
    
    surplus_map = {n: 1.0 for n in coalition}
    result = verify_stability(coalition=coalition, graph=graph, surplus_map=surplus_map)
    
    assert isinstance(result, StabilityResult)
    assert isinstance(result.is_stable, bool)
    assert isinstance(result.margin, float)
    assert isinstance(result.rounds, int)
    assert isinstance(result.solve_time_ms, float)
    assert isinstance(result.converged, bool)
