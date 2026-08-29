"""
engine/tests/test_planar_graph.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full test suite for the planar graph module:

1. Unit tests with hand-built graphs and manually enumerated expected answers.
2. PlanarityError rejection test for a known non-planar graph (K₅).
3. Property-based tests using hypothesis asserting every returned coalition
   is connected and truly a subgraph of the input.
4. Fixture tests on the 50-node city-grid.
"""

from __future__ import annotations

import json
import math
import os
import tempfile
from pathlib import Path

import networkx as nx
import pytest

from app.graph.fixtures import generate_city_grid
from app.graph.planar_graph import (
    PlanarityError,
    build_from_adjacency,
    load_geojson,
    permissible_coalitions,
    verify_planarity,
)

# ─── pytest fixtures ──────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def city_grid_50():
    """Reusable 50-node city-grid planar graph fixture."""
    return generate_city_grid(rows=5, cols=10)


# ─── 1. Hand-built unit tests ─────────────────────────────────────────────────


class TestPermissibleCoalitionsHandBuilt:
    """Unit tests against graphs where the correct answer is known by inspection."""

    def test_path_graph_k1(self):
        """Path A-B-C: singletons only when k=1."""
        G = build_from_adjacency(["A", "B", "C"], [("A", "B"), ("B", "C")])
        result = permissible_coalitions(G, k=1)
        expected = [frozenset({"A"}), frozenset({"B"}), frozenset({"C"})]
        assert sorted(result) == sorted(expected)

    def test_path_graph_k2(self):
        """Path A-B-C, k=2: pairs must be adjacent.

        Connected pairs: {A,B}, {B,C}.  Non-adjacent {A,C} should NOT appear.
        """
        G = build_from_adjacency(["A", "B", "C"], [("A", "B"), ("B", "C")])
        result = permissible_coalitions(G, k=2)
        assert frozenset({"A", "C"}) not in result, "Non-adjacent pair must not be returned"
        assert frozenset({"A", "B"}) in result
        assert frozenset({"B", "C"}) in result
        # singletons are also permissible
        assert frozenset({"A"}) in result

    def test_path_graph_k3(self):
        """Path A-B-C, k=3: all three nodes form one connected coalition."""
        G = build_from_adjacency(["A", "B", "C"], [("A", "B"), ("B", "C")])
        result = permissible_coalitions(G, k=3)
        assert frozenset({"A", "B", "C"}) in result
        # Total: 3 singletons + 2 pairs + 1 triple = 6
        assert len(result) == 6

    def test_triangle_k2(self):
        """Triangle A-B-C: all three pairs are valid coalitions."""
        G = build_from_adjacency(
            ["A", "B", "C"], [("A", "B"), ("B", "C"), ("A", "C")]
        )
        result = permissible_coalitions(G, k=2)
        assert frozenset({"A", "B"}) in result
        assert frozenset({"B", "C"}) in result
        assert frozenset({"A", "C"}) in result

    def test_disconnected_graph_k2(self):
        """Two separate edges A-B and C-D: cross-component coalition must not appear."""
        G = build_from_adjacency(
            ["A", "B", "C", "D"], [("A", "B"), ("C", "D")]
        )
        result = permissible_coalitions(G, k=2)
        assert frozenset({"A", "C"}) not in result
        assert frozenset({"A", "D"}) not in result
        assert frozenset({"B", "C"}) not in result
        assert frozenset({"B", "D"}) not in result
        assert frozenset({"A", "B"}) in result
        assert frozenset({"C", "D"}) in result

    def test_star_graph_k2(self):
        """Star with hub H and leaves L1, L2, L3: leaves can only pair with hub."""
        G = build_from_adjacency(
            ["H", "L1", "L2", "L3"],
            [("H", "L1"), ("H", "L2"), ("H", "L3")],
        )
        result = permissible_coalitions(G, k=2)
        # Leaf-leaf pairs not connected → must not appear
        assert frozenset({"L1", "L2"}) not in result
        assert frozenset({"L1", "L3"}) not in result
        assert frozenset({"L2", "L3"}) not in result
        # Hub-leaf pairs must be present
        assert frozenset({"H", "L1"}) in result
        assert frozenset({"H", "L2"}) in result
        assert frozenset({"H", "L3"}) in result

    def test_k_below_one_raises(self):
        """k < 1 should raise ValueError."""
        G = build_from_adjacency(["A", "B"], [("A", "B")])
        with pytest.raises(ValueError, match="k must be"):
            permissible_coalitions(G, k=0)


# ─── 2. Planarity rejection ───────────────────────────────────────────────────


class TestPlanarityRejection:
    """K₅ and K₃₃ are the canonical non-planar graphs."""

    def test_k5_is_rejected(self):
        """K₅ (complete graph on 5 nodes) is not planar and must be rejected."""
        K5 = nx.complete_graph(5)
        nx.set_node_attributes(K5, {n: f"mg-{n}" for n in K5.nodes()}, "microgrid_id")
        with pytest.raises(PlanarityError):
            verify_planarity(K5)

    def test_k33_is_rejected(self):
        """K₃₃ (complete bipartite 3,3) is not planar."""
        K33 = nx.complete_bipartite_graph(3, 3)
        with pytest.raises(PlanarityError):
            verify_planarity(K33)

    def test_build_from_adjacency_k5_rejected(self):
        """build_from_adjacency with K₅ edges must raise PlanarityError."""
        nodes = [str(i) for i in range(5)]
        edges = [(str(i), str(j)) for i in range(5) for j in range(i + 1, 5)]
        with pytest.raises(PlanarityError):
            build_from_adjacency(nodes, edges)

    def test_planar_graph_accepted(self):
        """A simple cycle (always planar) must be accepted without error."""
        G = nx.cycle_graph(8)
        nx.set_node_attributes(G, {n: f"mg-{n}" for n in G.nodes()}, "microgrid_id")
        result = verify_planarity(G)
        assert result.number_of_nodes() == 8


# ─── 3. GeoJSON loader ────────────────────────────────────────────────────────


class TestGeoJSONLoader:
    def _write_geojson(self, data: dict) -> str:
        f = tempfile.NamedTemporaryFile(
            mode="w", suffix=".geojson", delete=False
        )
        json.dump(data, f)
        f.close()
        return f.name

    def test_valid_geojson_loads(self):
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [10.0, 50.0]},
                    "properties": {"microgrid_id": "mg-A"},
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [11.0, 50.0]},
                    "properties": {"microgrid_id": "mg-B"},
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [[10, 50], [11, 50]]},
                    "properties": {"source": "mg-A", "target": "mg-B", "capacity_kw": 250.0},
                },
            ],
        }
        path = self._write_geojson(geojson)
        try:
            G = load_geojson(path)
            assert G.has_node("mg-A")
            assert G.has_node("mg-B")
            assert G.has_edge("mg-A", "mg-B")
            assert G["mg-A"]["mg-B"]["capacity_kw"] == 250.0
        finally:
            os.unlink(path)

    def test_missing_microgrid_id_raises(self):
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [10.0, 50.0]},
                    "properties": {},  # missing microgrid_id
                }
            ],
        }
        path = self._write_geojson(geojson)
        try:
            with pytest.raises(ValueError, match="microgrid_id"):
                load_geojson(path)
        finally:
            os.unlink(path)


# ─── 4. Fixture / 50-node tests ──────────────────────────────────────────────


class TestCityGrid50:
    def test_has_50_nodes(self, city_grid_50):
        assert city_grid_50.number_of_nodes() == 50

    def test_is_planar(self, city_grid_50):
        """Grid graphs are always planar; verify_planarity must not raise."""
        verify_planarity(city_grid_50)

    def test_all_nodes_have_microgrid_id(self, city_grid_50):
        for node in city_grid_50.nodes():
            assert "microgrid_id" in city_grid_50.nodes[node]

    def test_k1_returns_50_coalitions(self, city_grid_50):
        """Singleton coalitions: one per node, exactly 50."""
        result = permissible_coalitions(city_grid_50, k=1)
        assert len(result) == 50

    def test_k2_returns_more_than_k1(self, city_grid_50):
        r1 = permissible_coalitions(city_grid_50, k=1)
        r2 = permissible_coalitions(city_grid_50, k=2)
        assert len(r2) > len(r1)

    def test_every_coalition_is_connected(self, city_grid_50):
        """All returned coalitions for k=3 must form connected subgraphs."""
        result = permissible_coalitions(city_grid_50, k=3)
        for coalition in result:
            sub = city_grid_50.subgraph(coalition)
            assert nx.is_connected(sub), f"Coalition {coalition} is not connected"

    def test_every_coalition_uses_only_real_nodes(self, city_grid_50):
        """No coalition may contain a node not present in the input graph."""
        known_nodes = set(city_grid_50.nodes())
        result = permissible_coalitions(city_grid_50, k=3)
        for coalition in result:
            assert coalition.issubset(known_nodes), f"Invented node in coalition {coalition}"


# ─── 5. Property-based tests (hypothesis) ────────────────────────────────────

try:
    from hypothesis import given, settings
    from hypothesis import strategies as st

    def _random_planar_graph(draw) -> nx.Graph:
        """Draw a small random planar graph (grid subgraph for guaranteed planarity)."""
        rows = draw(st.integers(min_value=2, max_value=4))
        cols = draw(st.integers(min_value=2, max_value=4))
        G = nx.grid_2d_graph(rows, cols)
        mapping = {node: f"mg-{i}" for i, node in enumerate(G.nodes())}
        return nx.relabel_nodes(G, mapping)

    @given(st.composite(_random_planar_graph)())
    @settings(max_examples=20)
    def test_all_coalitions_connected_hypothesis(G: nx.Graph) -> None:
        """Property: every coalition from any small planar graph is connected."""
        result = permissible_coalitions(G, k=3)
        for coalition in result:
            sub = G.subgraph(coalition)
            assert nx.is_connected(sub)

    @given(st.composite(_random_planar_graph)())
    @settings(max_examples=20)
    def test_all_coalitions_subgraph_hypothesis(G: nx.Graph) -> None:
        """Property: no coalition contains a node outside the input graph."""
        known = set(G.nodes())
        result = permissible_coalitions(G, k=3)
        for c in result:
            assert c.issubset(known)

except ImportError:
    # Hypothesis not installed – skip property tests gracefully
    pass
