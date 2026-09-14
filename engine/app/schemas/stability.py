from typing import Literal, Annotated
from pydantic import BaseModel, Field

class SellerProfile(BaseModel):
    role: Literal["SELLER"] = "SELLER"
    generation_cost: float = Field(0.0, description="Cost to generate energy")
    degradation_cost: float = Field(0.0, description="Battery degradation cost")
    opportunity_cost: float = Field(0.0, description="Opportunity cost of selling")
    outside_option: float = Field(0.0, description="Utility outside the coalition")
    available_capacity: float = Field(0.0, description="Capacity to sell")
    
class BuyerProfile(BaseModel):
    role: Literal["BUYER"] = "BUYER"
    energy_value: float = Field(0.0, description="Value derived from energy")
    alt_procurement_cost: float = Field(0.0, description="Alternative procurement adjustment")
    outside_option: float = Field(0.0, description="Utility outside the coalition")
    demand: float = Field(0.0, description="Energy demand")

AgentProfile = Annotated[SellerProfile | BuyerProfile, Field(discriminator="role")]

class StabilityVerifyRequest(BaseModel):
    coalition: list[str] = Field(..., description="List of microgrid IDs forming the coalition")
    profiles: dict[str, AgentProfile] = Field(
        default_factory=dict,
        description="Economic profiles of agents in the coalition"
    )
    allocation_mechanism: str = Field(
        default="least_core",
        description="Mechanism to allocate surplus: least_core, proportional, nash, shapley"
    )

class BindingConstraintSchema(BaseModel):
    coalition: list[str] = Field(..., description="Members of the deviating coalition T")
    slack: float = Field(..., description="Residual slack SUM_i_in_T x_i* - v(T)")

class StabilityVerifyResponse(BaseModel):
    status: Literal["EXACT_STABLE", "BLOCKING_COALITION_FOUND", "HEURISTIC_NO_VIOLATION_FOUND", "UNVERIFIED"] = Field(
        ..., description="Verification result status"
    )
    isStable: bool = Field(
        ..., description="True iff status==EXACT_STABLE. Preserved for API compatibility."
    )
    epsilonStar: float = Field(..., description="Least-core epsilon value")
    allocation: dict[str, float] = Field(..., description="Allocation of surplus to agents")
    margin: float = Field(..., description="Min slack across all permissible deviating coalitions")
    deviating_coalition: list[str] | None = Field(
        None, description="Worst deviating coalition; non-null only when status=BLOCKING_COALITION_FOUND"
    )
    binding_constraints: list[BindingConstraintSchema] = Field(
        default_factory=list, description="Constraints active at the LP optimum"
    )
    rounds: int = Field(..., description="Number of constraint-generation rounds")
    converged: bool = Field(..., description="True if solver converged; False if cap hit")
    solve_time_ms: float = Field(..., description="Wall-clock solver time in milliseconds")
    topologyVersion: int | None = Field(None, description="The revision version of the canonical topology used")
    value_model_version: str = Field("1.0", description="Version of the CoalitionValueModel used")
    solver_version: str = Field("1.0", description="Solver version")
    outside_options: dict[str, float] = Field(..., description="Outside options for agents")

