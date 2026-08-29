from pydantic import BaseModel, Field

class QRECalibrateRequest(BaseModel):
    agent_id: str = Field(..., description="ID of the agent to persist the calibrated lambda for")
    temperature: float = Field(..., description="Temperature value for QRE calibration")
    payoff_matrix: list[list[float]] = Field(..., description="Payoff matrix for the game")

class QRECalibrateResponse(BaseModel):
    lambda_mapping: float = Field(..., description="Calculated lambda mapping")
    choice_probabilities: list[float] = Field(..., description="QRE choice probabilities")
