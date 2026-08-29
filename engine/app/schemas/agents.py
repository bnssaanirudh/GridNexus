from pydantic import BaseModel, Field


class AgentBase(BaseModel):
    name: str = Field(..., description="Name of the agent")
    policy_metadata: dict[str, str] = Field(default_factory=dict, description="Metadata for the agent's policy")

class AgentCreate(AgentBase):
    microgridId: str = Field(..., description="The ID of the Microgrid this agent represents")

class AgentUpdate(BaseModel):
    name: str | None = Field(None, description="Name of the agent")
    policy_metadata: dict[str, str] | None = Field(None, description="Metadata for the agent's policy")

class AgentResponse(AgentBase):
    id: str = Field(..., description="Unique ID of the agent")

    model_config = {"from_attributes": True}
