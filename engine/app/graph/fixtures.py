"""
engine/app/graph/fixtures.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Synthetic fixture generator for benchmarking and testing.

Generates a 50-node planar grid graph (m×n lattice), which is guaranteed
planar by construction (all planar graphs have maximum degree ≤ 5 in grids
and the grid graph itself satisfies the L-R planarity condition trivially).

Assumption: We use a 5×10 rectangular grid which gives exactly 50 nodes
and a city-grid-like topology (every internal node has 4 neighbours).
"""

from __future__ import annotations

import math

import networkx as nx


def generate_city_grid(rows: int = 5, cols: int = 10) -> nx.Graph:
    """Generate a city-grid-like planar graph with ``rows × cols`` nodes.

    The 2D grid graph (``nx.grid_2d_graph``) is provably planar.  Nodes
    are re-labelled to human-readable microgrid IDs ("mg-0" … "mg-N").

    Parameters
    ----------
    rows, cols:
        Dimensions of the lattice.  Default 5 × 10 = 50 nodes.

    Returns
    -------
    nx.Graph
        Planar graph with node attrs ``microgrid_id``, ``lat``, ``lon``
        (scaled to [-1, 1] for mock coordinates) and edge attr
        ``capacity_kw`` (uniform 100 kW for fixture purposes).
    """
    G_grid = nx.grid_2d_graph(rows, cols)

    # Relabel (row, col) tuples → "mg-{i}" sequential IDs
    mapping = {(r, c): f"mg-{r * cols + c}" for r, c in G_grid.nodes()}
    G: nx.Graph = nx.relabel_nodes(G_grid, mapping)

    # Attach mock geo-attributes
    for (r, c), new_id in mapping.items():
        lat = (r / (rows - 1)) * 2 - 1  # [-1, 1]
        lon = (c / (cols - 1)) * 2 - 1  # [-1, 1]
        G.nodes[new_id]["microgrid_id"] = new_id
        G.nodes[new_id]["lat"] = round(lat, 6)
        G.nodes[new_id]["lon"] = round(lon, 6)

    for u, v in G.edges():
        G[u][v]["capacity_kw"] = 100.0

    return G


def generate_petersen_like(n: int = 50) -> nx.Graph:
    """Generate a Halin graph of size n (always planar, always 3-connected).

    A Halin graph is built by taking a tree (no vertex of degree 2) and
    adding a cycle through all its leaves.  This produces graphs that are
    tougher to enumerate coalitions for than a simple grid, useful for
    stress-testing.

    Parameters
    ----------
    n:
        Number of nodes.  Must be ≥ 4.

    Returns
    -------
    nx.Graph
        Planar Halin-style graph.
    """
    # Build a balanced binary tree with n//2 internal nodes, n//2 leaves
    depth = math.floor(math.log2(n)) if n > 1 else 1
    T = nx.balanced_tree(r=2, h=depth)
    leaves = [v for v in T.nodes() if T.degree(v) == 1]

    H: nx.Graph = T.copy()
    # Add the Halin outer cycle connecting leaves in BFS order
    bfs_leaves = [v for v in nx.bfs_tree(T, source=0).nodes() if v in set(leaves)]
    for i in range(len(bfs_leaves)):
        H.add_edge(bfs_leaves[i], bfs_leaves[(i + 1) % len(bfs_leaves)])

    # Relabel to mg-{i}
    mapping = {v: f"mg-{v}" for v in H.nodes()}
    G: nx.Graph = nx.relabel_nodes(H, mapping)

    for nid in G.nodes():
        G.nodes[nid]["microgrid_id"] = nid
        G.nodes[nid]["lat"] = 0.0
        G.nodes[nid]["lon"] = 0.0
    for u, v in G.edges():
        G[u][v]["capacity_kw"] = 100.0

    return G
