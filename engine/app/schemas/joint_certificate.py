from pydantic import BaseModel, Field
from typing import Any, Dict
from app.schemas.stability import StabilityVerifyRequest, StabilityVerifyResponse

class JointVerifyRequest(BaseModel):
    negotiation_id: str | None = None
    stability_request: StabilityVerifyRequest
    # Extract the GridVerificationRequest fields here so we don't import from routers directly
    nodes: list[dict[str, Any]] = Field(..., description="List of NodeInput dicts")
    lines: list[dict[str, Any]] = Field(..., description="List of LineInput dicts")
    
class JointVerifyResponse(BaseModel):
    passed: bool = Field(..., description="True only if both stability and grid feasibility passed")
    stability_response: StabilityVerifyResponse = Field(..., description="Result of stability solver")
    grid_certificate: dict[str, Any] | None = Field(..., description="Grid certificate payload or None if solver crashed")
