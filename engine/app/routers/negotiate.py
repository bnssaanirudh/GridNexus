from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.schemas.negotiate import NegotiationRequest, NegotiationResponse, NegotiationActionEnum
from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction
from app.deps import get_db
from app.models import Agent, Microgrid, DER

from app.negotiate.prompt import build_negotiation_prompt
from app.negotiate.provider import get_provider
from app.negotiate.retry import negotiate_with_retry
from app import telemetry

router = APIRouter(prefix="/negotiate", tags=["Negotiate"])

# Global wrapper instance for the engine
# Note: we should load a checkpoint if in INFERENCE mode.
import os
mode = os.environ.get("GRIDNEXUS_MODE", "simulation").lower()
is_production = (mode == "production")

dqn_wrapper = DQNWrapper(mode="INFERENCE" if is_production else "TRAINING")

if is_production:
    checkpoint_path = os.environ.get("DQN_CHECKPOINT_PATH", "dqn_checkpoint.pt")
    try:
        dqn_wrapper.load_checkpoint(checkpoint_path)
    except Exception as e:
        # Fails production startup explicitly if checkpoint doesn't exist
        import sys
        import logging
        logging.getLogger(__name__).error(f"Failed to load DQN checkpoint in production: {e}")
        sys.exit(1)

async def _fetch_agent(agent_id: str, db: AsyncSession) -> dict:
    """Fetch the agent and its microgrid's true capacity/cost from PostgreSQL."""
    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.microgrid).selectinload(Microgrid.ders))
        .where(Agent.id == agent_id)
    )
    agent_record = result.scalars().first()
    if not agent_record:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    microgrid = agent_record.microgrid
    if not microgrid:
        raise HTTPException(status_code=400, detail="Agent has no associated microgrid")

    try:
        battery_capacity = float(microgrid.hiddenbatterycapacity)
    except ValueError:
        battery_capacity = sum(float(der.energyCapacityKwh or 0) for der in microgrid.ders) or 50.0

    try:
        generation_cost = float(microgrid.hiddengenerationcost)
    except ValueError:
        generation_cost = 10.0

    return {
        "capacity": battery_capacity,
        "cost": generation_cost
    }

@router.post("", response_model=NegotiationResponse)
async def negotiate(request: NegotiationRequest, db: AsyncSession = Depends(get_db)):
    """Evaluate a negotiation round for an agent using the Real LLM + DQN safeguard."""
    if request.surplus < 0:
        raise HTTPException(status_code=400, detail="Surplus cannot be negative")

    telemetry.negotiation_round_total.inc()
    agent_info = await _fetch_agent(request.agent_id, db)
    
    # State encoding for DQN
    state_dict = {
        "capacity": agent_info["capacity"],
        "cost": agent_info["cost"], # Added for safety validator
        "offer_price": request.current_offer_price or 0.0,
        "offer_requested_kwh": request.current_requested_kwh or 0.0,
        "round_number": request.round_number,
        "opponent_history_embedding": [0.0, 0.0, 0.0, 0.0] # Mock embedding
    }
    
    provider = get_provider(api_key=request.api_key)
    prompt = build_negotiation_prompt(
        agent_id=request.agent_id,
        opponent_id=request.opponent_id,
        round_number=request.round_number,
        current_surplus=request.surplus,
        current_offer_price=request.current_offer_price,
        current_requested_kwh=request.current_requested_kwh,
        capacity=agent_info["capacity"],
        cost=agent_info["cost"],
    )

    offer, final_action, overridden, best_q, llm_q = negotiate_with_retry(
        llm_call=provider.generate_response,
        prompt=prompt,
        agent_id=request.agent_id,
        negotiation_id=request.negotiation_id,
        round_number=request.round_number,
        dqn_wrapper=dqn_wrapper,
        dqn_state_dict=state_dict,
    )
    
    action_map = {
        NegotiationAction.ACCEPT: NegotiationActionEnum.ACCEPT,
        NegotiationAction.COUNTER_OFFER: NegotiationActionEnum.COUNTER_OFFER,
        NegotiationAction.WALK_AWAY: NegotiationActionEnum.WALK_AWAY
    }
    
    response = NegotiationResponse(action=action_map[final_action])
    
    if final_action == NegotiationAction.COUNTER_OFFER:
        if offer and not overridden:
            response.counter_offer_price = offer.price_per_kwh
            response.counter_requested_kwh = offer.requested_kwh
        else:
            # DQN Fallback or Override logic (DQN doesn't pick continuous values easily without an actor-critic)
            # In a real system the DQN fallback would supply safe continuous values.
            # Here we provide a safe deterministic fallback.
            cost = agent_info["cost"]
            import random
            response.counter_offer_price = round(cost + random.uniform(0.5, 2.5), 3)
            response.counter_requested_kwh = request.current_requested_kwh or 50.0
            
    # Include audit information in headers or metadata if needed in the future
    return response
