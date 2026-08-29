from enum import Enum
from pydantic import BaseModel, Field

class NegotiationActionEnum(str, Enum):
    ACCEPT = "ACCEPT"
    COUNTER_OFFER = "COUNTER_OFFER"
    WALK_AWAY = "WALK_AWAY"

class NegotiationRequest(BaseModel):
    agent_id: str = Field(..., description="The ID of the agent evaluating the offer.")
    opponent_id: str = Field(..., description="The ID of the other agent.")
    negotiation_id: str = Field(..., description="The ID of the negotiation session.")
    current_offer_price: float | None = Field(None, description="The price offered by the opponent. None if opening round.")
    current_requested_kwh: float | None = Field(None, description="The kWh requested.")
    round_number: int = Field(..., description="Current round of negotiation.")
    surplus: float = Field(..., description="Implied surplus before discounting.")

class NegotiationResponse(BaseModel):
    action: NegotiationActionEnum = Field(..., description="The action chosen by the agent.")
    counter_offer_price: float | None = Field(None, description="If COUNTER_OFFER, the new price.")
    counter_requested_kwh: float | None = Field(None, description="If COUNTER_OFFER, the new requested kWh.")
