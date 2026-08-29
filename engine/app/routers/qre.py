import os
import asyncpg
from fastapi import APIRouter, HTTPException
import logging

from app.schemas.qre import QRECalibrateRequest, QRECalibrateResponse
from app.qre.calibration import get_calibrated_lambda
from app.qre.qre_solver import logit_qre_fixed_point

router = APIRouter(prefix="/qre", tags=["QRE"])
logger = logging.getLogger(__name__)

async def update_agent_qre_lambda(agent_id: str, lambda_val: float):
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.warning("DATABASE_URL not set, skipping DB persistence.")
        return
        
    # asyncpg doesn't like postgresql+asyncpg://, it wants postgresql://
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
        
    try:
        conn = await asyncpg.connect(db_url)
        # Update the qre_lambda for the given agent
        await conn.execute(
            "UPDATE agents SET qre_lambda = $1 WHERE id = $2",
            lambda_val, agent_id
        )
        await conn.close()
    except Exception as e:
        logger.error(f"Failed to persist qre_lambda for agent {agent_id}: {e}")

@router.post("/calibrate", response_model=QRECalibrateResponse)
async def calibrate_qre(request: QRECalibrateRequest):
    if request.temperature <= 0:
        raise HTTPException(status_code=400, detail="Temperature must be positive")

    # 1. Get calibrated lambda
    calibrated_lambda = get_calibrated_lambda(request.temperature)
    
    # 2. Persist to DB asynchronously
    await update_agent_qre_lambda(request.agent_id, calibrated_lambda)
    
    # 3. Solve QRE
    try:
        choice_probs = logit_qre_fixed_point(request.payoff_matrix, calibrated_lambda)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"QRE Solver failed: {e}")

    return QRECalibrateResponse(
        lambda_mapping=calibrated_lambda,
        choice_probabilities=choice_probs
    )
