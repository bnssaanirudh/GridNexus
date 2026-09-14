import uuid
import json
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from pydantic import BaseModel
from app.deps import get_db
from app.models import DispatchCertificate
from app.graph.topology_repo import build_topology_from_db
from app.grid.corrective_dispatch import verify_and_correct_dispatch
from app.grid.certificate import generate_certificate, validate_certificate_state

router = APIRouter(prefix="/settlement", tags=["Settlement"])

class ProposeTradeRequest(BaseModel):
    negotiation_id: str
    seller_id: str
    buyer_id: str
    proposed_kw: float
    
class TelemetryUpdateRequest(BaseModel):
    trade_id: str
    measured_seller_kw: float
    measured_buyer_kw: float
    telemetry_timestamp: datetime

@router.post("/propose")
async def propose_trade(request: ProposeTradeRequest, db: AsyncSession = Depends(get_db)):
    """
    Prompt 19: Design corrective settlement.
    """
    # 1. Build current topology
    network, topology_version = await build_topology_from_db(db)
    
    if request.seller_id not in network.nodes or request.buyer_id not in network.nodes:
        raise HTTPException(
            status_code=400,
            detail="Unknown seller or buyer grid node. Settlement requires explicit physical bus mapping."
        )

    seller_node = request.seller_id
    buyer_node = request.buyer_id
        
    # 2. Hierarchical Validation & Correction
    is_ok, final_kw, solver_used, pf_results = verify_and_correct_dispatch(
        network, seller_node, buyer_node, request.proposed_kw
    )
    
    if not is_ok or final_kw <= 0.0:
        raise HTTPException(status_code=400, detail="Trade infeasible and could not be corrected.")
        
    # 3. Generate Dual Certificate
    cert_dict = generate_certificate(
        negotiation_id=request.negotiation_id,
        network=network,
        pf_results=pf_results,
        violations=[],
        topology_version=topology_version,
        solver=solver_used
    )
    
    # 4. Save to DB (Prompts 21 & 22)
    trade_id = f"trd_{uuid.uuid4().hex[:12]}"
    
    db_cert = DispatchCertificate(
        id=f"cert_{uuid.uuid4().hex[:12]}",
        trade_id=trade_id,
        topology_hash=cert_dict["inputHash"],
        telemetry_timestamp=datetime.now(timezone.utc),
        proposed_quantity_kwh=request.proposed_kw,
        corrected_quantity_kwh=final_kw if final_kw != request.proposed_kw else None,
        seller_id=request.seller_id,
        buyer_id=request.buyer_id,
        physical_margins=cert_dict,
        solver_used=solver_used,
        integrity_hash=cert_dict["resultHash"],
        is_valid=True
    )
    
    db.add(db_cert)
    await db.commit()
    
    return {
        "status": "APPROVED" if final_kw == request.proposed_kw else "CORRECTED",
        "trade_id": trade_id,
        "final_kw": final_kw,
        "certificate": cert_dict
    }

@router.post("/telemetry_update")
async def telemetry_update(request: TelemetryUpdateRequest, db: AsyncSession = Depends(get_db)):
    """
    Prompt 23: Closed-loop rollback / re-dispatch
    """
    # 1. Fetch certificate
    result = await db.execute(select(DispatchCertificate).where(DispatchCertificate.trade_id == request.trade_id))
    cert = result.scalars().first()
    
    if not cert:
        raise HTTPException(status_code=404, detail="Trade not found")
        
    if not cert.is_valid:
        raise HTTPException(status_code=400, detail="Certificate is already invalidated")
        
    # 2. Build current physical state (topology)
    network, topology_version = await build_topology_from_db(db)
    
    # 3. Validate certificate against current state
    is_valid, msg = validate_certificate_state(
        cert_input_hash=cert.topology_hash,
        cert_telemetry_timestamp=cert.telemetry_timestamp,
        current_network=network,
        current_topology_version=topology_version,
        max_telemetry_age_seconds=300 # 5 minutes tolerance
    )
    
    if not is_valid:
        cert.is_valid = False
        await db.commit()
        return {
            "status": "ROLLBACK_INITIATED",
            "reason": msg,
            "action": "redispatch_required"
        }
        
    # 4. Check physical deviation
    expected_kw = cert.corrected_quantity_kwh or cert.proposed_quantity_kwh
    deviation = abs(request.measured_seller_kw - float(expected_kw))
    
    if deviation > 5.0: # 5 kW tolerance
        cert.is_valid = False
        await db.commit()
        return {
            "status": "ROLLBACK_INITIATED",
            "reason": f"Physical deviation {deviation}kW exceeds tolerance.",
            "action": "redispatch_required"
        }
        
    return {"status": "OK", "reason": "Telemetry matches expected physical state."}
