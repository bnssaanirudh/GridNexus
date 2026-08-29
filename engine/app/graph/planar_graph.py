"""
engine/app/graph/planar_graph.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Planar-graph construction and coalition-enumeration core.

Key design decisions (recorded per project convention):
- We represent microgrids as NetworkX nodes with lat/lon and id attributes.
- Planarity is checked once on construction using the Left-Right algorithm
  (networkx.check_planarity).  Non-planar inputs raise PlanarityError, a typed
  subclass of ValueError so callers can catch specifically.
- permissible_coalitions uses BFS expansion from each seed node up to size k
  and de-duplicates via frozensets.  This gives polynomial enumeration relative
  to the planar graph's structure (planar graphs are sparse: |E| ≤ 3|V| − 6).
- GeoJSON loader expects a FeatureCollection with "Point" features for nodes and
  "LineString" features for edges.  Node features MUST carry "microgrid_id"
  property; edge features MUST carry "source", "target", and optionally
  "capacity_kw".
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import Any

import networkx as nx

# ─── Exceptions ─────────────────────────────────────────────────────────────


class PlanarityError(ValueError):
    """Raised when the input graph is not planar.

    This is a typed exception so callers can distinguish planarity failures
    from generic value errors and surface a clear HTTP 422 to API consumers.
    """

    def __init__(self, message: str = "Input graph is not planar") -> None:
        super().__init__(message)


# ─── GeoJSON Loader ──────────────────────────────────────────────────────────


def load_geojson(path: str | Path) -> nx.Graph:
    """Load a GeoJSON FeatureCollection and build a verified-planar NetworkX graph.

    Parameters
    ----------
    path:
        Path to a GeoJSON file containing a FeatureCollection.  Node features
        are ``Point`` geometries; edge features are ``LineString`` geometries.

    Returns
    -------
    nx.Graph
        A planar graph with node attrs ``microgrid_id``, ``lat``, ``lon`` and
        edge attr ``capacity_kw`` (defaults to 0.0 when absent).

    Raises
    ------
    PlanarityError
        When the resulting graph fails the Left-Right planarity test.
    ValueError
        When the GeoJSON is malformed or missing required properties.
    """
    raw: dict[str, Any] = json.loads(Path(path).read_text())
    features: list[dict[str, Any]] = raw.get("features", [])

    G: nx.Graph = nx.Graph()

    for feat in features:
        geom = feat.get("geometry", {})
        props = feat.get("properties", {})
        geom_type = geom.get("type")

        if geom_type == "Point":
            mid = props.get("microgrid_id")
            if mid is None:
                raise ValueError(
                    f"Point feature missing required property 'microgrid_id': {feat}"
                )
            lon, lat = geom["coordinates"][:2]
            G.add_node(mid, microgrid_id=mid, lat=lat, lon=lon)

        elif geom_type == "LineString":
            src = props.get("source")
            tgt = props.get("target")
            if src is None or tgt is None:
                raise ValueError(
                    f"LineString feature missing 'source'/'target' properties: {feat}"
                )
            capacity = float(props.get("capacity_kw", 0.0))
            G.add_edge(src, tgt, capacity_kw=capacity)

    return verify_planarity(G)


# ─── Planarity Verification ──────────────────────────────────────────────────


def verify_planarity(G: nx.Graph) -> nx.Graph:
    """Verify that *G* is planar; raise PlanarityError if not.

    Uses the Left-Right Planarity algorithm (linear-time) bundled with
    NetworkX.

    Parameters
    ----------
    G:
        The NetworkX graph to check.

    Returns
    -------
    nx.Graph
        The same graph, returned for fluent chaining.

    Raises
    ------
    PlanarityError
        When ``networkx.check_planarity`` returns False.
    """
    is_planar, _ = nx.check_planarity(G)
    if not is_planar:
        raise PlanarityError(
            f"Input graph with {G.number_of_nodes()} nodes and "
            f"{G.number_of_edges()} edges is not planar. "
            "GridNexus requires a planar power-line topology."
        )
    return G


# ─── Coalition Enumeration ───────────────────────────────────────────────────


def permissible_coalitions(graph: nx.Graph, k: int) -> list[frozenset[Any]]:
    """Enumerate all coalitions whose induced subgraph is connected in *graph*.

    Algorithm
    ---------
    For every node ``seed`` we BFS-expand the neighbourhood within the graph,
    collecting all connected subsets of size 1 … k.  Results are stored as
    ``frozenset``s in a set to eliminate duplicates.

    Complexity
    ----------
    For a planar graph (|E| ≤ 3|V| − 6) the number of connected subgraphs of
    size ≤ k grows **polynomially** in |V| for fixed k (not at the Bell-number
    rate that unconstrained coalition enumeration would produce).  The
    growth-curve test in ``engine/tests/test_planar_graph.py`` empirically
    confirms this.

    Parameters
    ----------
    graph:
        A planar NetworkX graph whose nodes are microgrid identifiers.
    k:
        Maximum coalition size (inclusive).  Must be ≥ 1.

    Returns
    -------
    list[frozenset]
        Sorted list of all permissible coalitions (each a frozenset of node
        ids), ordered by size then lexicographic node order for determinism.

    Raises
    ------
    ValueError
        When k < 1.
    """
    if k < 1:
        raise ValueError(f"k must be ≥ 1, got {k}")

    seen: set[frozenset[Any]] = set()

    for seed in graph.nodes:
        # BFS from seed; each BFS state is a frozenset of nodes already added
        # plus the frontier of neighbours we can still expand into.
        initial: frozenset[Any] = frozenset([seed])
        queue: deque[frozenset[Any]] = deque([initial])
        visited_states: set[frozenset[Any]] = {initial}

        while queue:
            current_set = queue.popleft()
            seen.add(current_set)

            if len(current_set) >= k:
                continue

            # Compute the external neighbourhood of the current coalition
            frontier: set[Any] = set()
            for node in current_set:
                for nbr in graph.neighbors(node):
                    if nbr not in current_set:
                        frontier.add(nbr)

            for nbr in frontier:
                new_set = current_set | frozenset([nbr])
                if new_set not in visited_states:
                    visited_states.add(new_set)
                    queue.append(new_set)

    # Sort for determinism: first by size, then lexicographically
    return sorted(seen, key=lambda s: (len(s), sorted(str(n) for n in s)))


# ─── Convenience: build from adjacency dict ──────────────────────────────────


def build_from_adjacency(
    nodes: list[str], edges: list[tuple[str, str]]
) -> nx.Graph:
    """Build a planar NetworkX graph from a simple adjacency description.

    Convenience helper used by tests and the route handler.  Assigns dummy
    lat/lon of 0.0 when not provided.

    Parameters
    ----------
    nodes:
        List of microgrid IDs.
    edges:
        List of (source, target) tuples.

    Returns
    -------
    nx.Graph
        Verified-planar graph.

    Raises
    ------
    PlanarityError
        If the described graph is not planar.
    """
    G: nx.Graph = nx.Graph()
    for nid in nodes:
        G.add_node(nid, microgrid_id=nid, lat=0.0, lon=0.0)
    for src, tgt in edges:
        G.add_edge(src, tgt, capacity_kw=0.0)
    return verify_planarity(G)
