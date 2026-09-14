"""
engine/app/routers/stability.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stability verification route — wired to the real LP solver .

POST /stability/verify:
  1. Validates coalition non-empty and all nodes in physical graph.
  2. Validates coalition connectivity (permissible).
  3. Calls verify_stability() from the constraint-generation LP solver.
  4. Returns a fully typed StabilityVerifyResponse.
"""

from __future__ import annotations

import os
import structlog
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.graph.fixtures import generate_city_grid
from app.graph.planar_graph import permissible_coalitions
from app.graph.topology_repo import build_topology_from_db
from app.schemas.stability import (
    BindingConstraintSchema,
    StabilityVerifyRequest,
    StabilityVerifyResponse,
)
from app.stability.stability_solver import verify_stability

logger = structlog.get_logger()
router = APIRouter(prefix="/stability", tags=["Stability"])

@router.post("/verify", response_model=StabilityVerifyResponse)
async def stability_verify(
    request: StabilityVerifyRequest, 
    db: AsyncSession = Depends(get_db)
) -> StabilityVerifyResponse:
    """Check farsighted stability of a proposed microgrid coalition."""
    logger.info("stability_verify_called", coalition_size=len(request.coalition))

    if not request.coalition:
        raise HTTPException(status_code=400, detail="Coalition cannot be empty")

    mode = os.environ.get("GRIDNEXUS_MODE", "production")
    
    # ── 1. Load Topology ────────────────────────────────────────────────────
    if mode == "simulation":
        # In simulation mode, we may fall back to the fixture if needed
        # but try DB first
        graph, topology_version = await build_topology_from_db(db)
        if len(graph.nodes) == 0:
            graph = generate_city_grid(rows=5, cols=10)
            topology_version = -1
    else:
        # In production, we MUST use the database
        graph, topology_version = await build_topology_from_db(db)
        if len(graph.nodes) == 0:
            raise HTTPException(status_code=500, detail="Production topology is empty")

    # The DB topology has agents associated with buses. We need to collect all known agent IDs.
    known_agents = set()
    for node, data in graph.nodes(data=True):
        if "agents" in data:
            for agent in data["agents"]:
                known_agents.add(agent["id"])
    
    # In simulation mode with mock graph, the node names are the microgrid names
    if topology_version == -1:
        known_agents = set(graph.nodes())

    unknown = set(request.coalition) - known_agents
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown microgrid IDs not in physical graph: {sorted(unknown)}",
        )

    # ── 2. Verify Connectivity ──────────────────────────────────────────────
    # Map agents to buses to check connectivity on the bus graph.
    # In the mock graph, agents ARE the nodes.
    if topology_version == -1:
        # Old behavior: agents are nodes
        k = len(request.coalition)
        permissible = permissible_coalitions(graph, k=k)
        coalition_set = frozenset(request.coalition)
        if coalition_set not in permissible:
            raise HTTPException(
                status_code=422,
                detail="Coalition is not connected in the physical power-line graph.",
            )
    else:
        # New behavior: check if the subgraph of buses containing these agents is connected
        bus_nodes = set()
        for node, data in graph.nodes(data=True):
            if "agents" in data:
                for agent in data["agents"]:
                    if agent["id"] in request.coalition:
                        bus_nodes.add(node)
        
        subgraph = graph.subgraph(bus_nodes)
        import networkx as nx
        if not nx.is_connected(subgraph):
             raise HTTPException(
                status_code=422,
                detail="Coalition is not connected in the physical power-line graph.",
            )

    # ── 3. Call the real LP solver ────────────────────────────────────────────
    # verify_stability currently expects nodes in the graph to map 1:1 to coalition members.
    # We will pass a reduced graph where agents are nodes, and edges exist if their buses are connected.
    if topology_version != -1:
        agent_graph = nx.Graph()
        agent_to_bus = {}
        for node, data in graph.nodes(data=True):
            if "agents" in data:
                for agent in data["agents"]:
                    agent_to_bus[agent["id"]] = node
                    agent_graph.add_node(agent["id"])
        
        for a1, bus1 in agent_to_bus.items():
            for a2, bus2 in agent_to_bus.items():
                if a1 != a2:
                    if bus1 == bus2 or graph.has_edge(bus1, bus2):
                        agent_graph.add_edge(a1, a2)
        lp_graph = agent_graph
    else:
        lp_graph = graph

    from app.stability.value_model import VPPValueModel
    value_model = VPPValueModel()

    result = verify_stability(
        coalition=request.coalition,
        graph=lp_graph,
        profiles=request.profiles,
        value_model=value_model,
    )
    
    # ── 4. Apply Allocation Mechanism ─────────────────────────────────────────
    allocation = result.allocation
    v_S = sum(allocation.values()) if allocation else 0.0
    
    if request.allocation_mechanism != "least_core" and result.is_stable:
        from app.stability.allocation import allocate_proportional, allocate_shapley, allocate_nash_bargaining
        
        if request.allocation_mechanism == "proportional":
            allocation = allocate_proportional(request.coalition, v_S, result.outside_options)
        elif request.allocation_mechanism == "shapley":
            allocation = allocate_shapley(request.coalition, request.profiles, value_model)
        elif request.allocation_mechanism == "nash":
            allocation = allocate_nash_bargaining(request.coalition, v_S, result.outside_options)
            
    logger.info(
        "stability_verify_result",
        is_stable=result.is_stable,
        epsilon_star=result.epsilon_star,
        margin=result.margin,
        rounds=result.rounds,
        converged=result.converged,
        solve_time_ms=result.solve_time_ms,
    )

    return StabilityVerifyResponse(
        status=result.status,
        isStable=result.is_stable,
        epsilonStar=result.epsilon_star,
        allocation=allocation,
        outside_options=result.outside_options,
        margin=result.margin,
        deviating_coalition=result.deviating_coalition,
        binding_constraints=[
            BindingConstraintSchema(coalition=bc.coalition, slack=bc.slack)
            for bc in result.binding_constraints
        ],
        rounds=result.rounds,
        converged=result.converged,
        solve_time_ms=result.solve_time_ms,
        topologyVersion=topology_version if topology_version != -1 else None,
        value_model_version="1.0",
        solver_version="Least-Core Highs"
    )
