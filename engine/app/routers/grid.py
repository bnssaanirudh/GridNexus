from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ..grid.network_model import ElectricalNetwork, Node, Line
from ..grid.power_flow import DCPowerFlow
from ..grid.certificate import ConstraintChecker, generate_certificate

router = APIRouter()

class NodeInput(BaseModel):
    id: str
    voltage_level_kv: float
    is_slack: bool = False
    p_load_kw: float = 0.0
    p_gen_kw: float = 0.0

class LineInput(BaseModel):
    id: str
    from_node: str
    to_node: str
    r_ohms: float
    x_ohms: float
    thermal_limit_kw: float

class GridVerificationRequest(BaseModel):
    negotiation_id: Optional[str] = None
    nodes: List[NodeInput]
    lines: List[LineInput]

@router.post("/verify")
def verify_grid(req: GridVerificationRequest):
    """
    Solves the power flow for the provided network topology and injections,
    checks physical constraints, and returns a feasibility certificate.
    """
    network = ElectricalNetwork()
    
    for n in req.nodes:
        network.nodes[n.id] = Node(
            id=n.id,
            voltage_level_kv=n.voltage_level_kv,
            is_slack=n.is_slack,
            p_load_kw=n.p_load_kw,
            p_gen_kw=n.p_gen_kw
        )
        
    for l in req.lines:
        network.lines[l.id] = Line(
            id=l.id,
            from_node=l.from_node,
            to_node=l.to_node,
            r_ohms=l.r_ohms,
            x_ohms=l.x_ohms,
            thermal_limit_kw=l.thermal_limit_kw
        )
        
    # Run solver
    solver = DCPowerFlow(network)
    try:
        results = solver.solve()
    except Exception as e:
        # e.g., singular matrix if islanded without slack
        return generate_certificate(
            req.negotiation_id, network, 
            {"theta": {}, "line_flows_kw": {}, "voltages_pu": {}, "line_loading_pct": {}, "power_balance_error_kw": 0.0},
            [str(e)]
        )
        
    # Check constraints
    is_feasible, violations = ConstraintChecker.check_network(network, results)
    
    # Generate certificate
    cert = generate_certificate(req.negotiation_id, network, results, violations)
    return cert

@router.get("/certificates/{id}")
def get_certificate(id: str):
    # In a fully integrated setup, this would query the DB.
    # Currently handled by Broker/Prisma, but added for completeness as requested.
    raise HTTPException(status_code=501, detail="Not Implemented - Fetch via Broker API")
