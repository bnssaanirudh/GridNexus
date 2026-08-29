import networkx as nx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.models import Bus, Line, MicrogridBusMapping, TopologyRevision

async def build_topology_from_db(db: AsyncSession) -> tuple[nx.Graph, int]:
    """
    Constructs a NetworkX graph representing the canonical physical grid
    using data from the PostgreSQL database.
    
    Returns:
        tuple[nx.Graph, int]: The topology graph and the current TopologyRevision version.
    """
    # Fetch the latest topology revision
    result = await db.execute(select(TopologyRevision).order_by(TopologyRevision.version.desc()).limit(1))
    revision = result.scalars().first()
    version = revision.version if revision else 0

    G = nx.Graph()

    # 1. Fetch Buses and map them as nodes
    bus_result = await db.execute(select(Bus))
    buses = bus_result.scalars().all()
    
    for bus in buses:
        G.add_node(
            bus.id,
            node_type="bus",
            voltage=float(bus.voltageLevelKv),
            lat=float(bus.latitude) if bus.latitude else None,
            lon=float(bus.longitude) if bus.longitude else None,
            agents=[] # List of microgrids attached
        )

    # 2. Fetch Microgrid Mappings to attach to buses
    mapping_result = await db.execute(select(MicrogridBusMapping).options(selectinload(MicrogridBusMapping.microgrid)))
    mappings = mapping_result.scalars().all()
    
    for mapping in mappings:
        if G.has_node(mapping.busId):
            G.nodes[mapping.busId]["agents"].append({
                "id": mapping.microgridId,
                "name": mapping.microgrid.name if mapping.microgrid else "Unknown"
            })

    # 3. Fetch Lines (Edges)
    line_result = await db.execute(select(Line).where(Line.active == True))
    lines = line_result.scalars().all()

    for line in lines:
        G.add_edge(
            line.fromBusId,
            line.toBusId,
            id=line.id,
            resistance=float(line.resistance),
            reactance=float(line.reactance),
            capacity=float(line.thermalLimitKw)
        )

    return G, version
