from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import uuid

from app.deps import get_db
from app.schemas.agents import AgentCreate, AgentResponse, AgentUpdate
from app.models import Agent, Microgrid

router = APIRouter(prefix="/agents", tags=["Agents"])

@router.post("", response_model=AgentResponse)
async def create_agent(agent: AgentCreate, db: AsyncSession = Depends(get_db)):
    # Create the agent in DB
    new_id = str(uuid.uuid4())
    db_agent = Agent(
        id=new_id,
        microgridId=agent.microgridId,
        type=agent.policy_metadata.get("type", "Q-Learning"),
        qre_lambda=agent.policy_metadata.get("qre_lambda")
    )
    db.add(db_agent)
    await db.commit()
    
    return AgentResponse(id=new_id, name=agent.name, policy_metadata=agent.policy_metadata)

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    return AgentResponse(id=agent.id, name=f"Agent {agent.id}", policy_metadata={"type": agent.type, "qre_lambda": float(agent.qre_lambda) if agent.qre_lambda else None})

@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, agent: AgentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    db_agent = result.scalars().first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    if agent.policy_metadata:
        if "type" in agent.policy_metadata:
            db_agent.type = agent.policy_metadata["type"]
        if "qre_lambda" in agent.policy_metadata:
            db_agent.qre_lambda = agent.policy_metadata["qre_lambda"]
            
    await db.commit()
    return AgentResponse(id=db_agent.id, name=agent.name or "Updated Agent", policy_metadata={"type": db_agent.type, "qre_lambda": float(db_agent.qre_lambda) if db_agent.qre_lambda else None})

@router.delete("/{agent_id}", response_model=AgentResponse)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    await db.delete(agent)
    await db.commit()
    return AgentResponse(id=agent.id, name="Deleted Agent", policy_metadata={})
