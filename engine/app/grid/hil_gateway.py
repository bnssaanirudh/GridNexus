"""engine/app/grid/hil_gateway.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hardware-in-the-Loop (HIL) Gateway Interface.

This module bridges the physical world (Modbus/TCP, SCADA streams, digital twins)
to the abstract mathematics of the GridNexus stability solver.
It translates raw sensor payloads into `AnonymizedGridState` vectors and topology mappings.
"""
from typing import Any
import json
import logging
from pydantic import BaseModel, Field

from app.oracle.anonymized_state import AnonymizedGridState
from app.schemas.stability import AgentProfile, SellerProfile, BuyerProfile

logger = logging.getLogger(__name__)

class PhysicalSensorReading(BaseModel):
    """Raw data frame emitted by a SCADA/Digital Twin endpoint."""
    device_id: str = Field(..., description="Unique hardware identifier (e.g., Modbus slave ID or smart meter MAC)")
    active_power_kw: float = Field(..., description="Real power reading (P)")
    reactive_power_kvar: float = Field(..., description="Reactive power reading (Q)")
    voltage_pu: float = Field(..., description="Voltage magnitude per-unit")
    soc_pct: float | None = Field(None, description="State of Charge (if applicable, 0-100%)")
    status_code: int = Field(0, description="Hardware fault code, 0 is OK")

class HardwareGateway:
    """
    Translates asynchronous physical hardware streams into verified grid physics states.
    """
    def __init__(self, target_substation_id: str):
        self.substation_id = target_substation_id
        self.active_sensors: dict[str, PhysicalSensorReading] = {}
        
    def ingest_telemetry_frame(self, raw_payload: str) -> None:
        """
        Ingests a raw string payload (e.g., from a TCP socket or serial port),
        validates it against the sensor schema, and updates the local physical state cache.
        """
        try:
            data = json.loads(raw_payload)
            reading = PhysicalSensorReading(**data)
            if reading.status_code != 0:
                logger.warning(f"Hardware fault detected on {reading.device_id}: Code {reading.status_code}")
                # For safety, if a hardware fault exists, we zero out its active power availability
                reading.active_power_kw = 0.0
            self.active_sensors[reading.device_id] = reading
        except Exception as e:
            logger.error(f"Failed to ingest telemetry frame: {e}")
            raise ValueError(f"Invalid telemetry payload: {e}")

    def synthesize_grid_state(self, peer_coop_rate: float = 0.5, ex_stress: float = 0.0) -> AnonymizedGridState:
        """
        Aggregates all physical sensors into an `AnonymizedGridState` vector
        ready for the Stability Oracle neural network.
        """
        if not self.active_sensors:
            raise RuntimeError("No telemetry data available to synthesize state.")
            
        total_capacity = sum(
            s.active_power_kw for s in self.active_sensors.values() if s.active_power_kw > 0
        )
        total_demand = sum(
            abs(s.active_power_kw) for s in self.active_sensors.values() if s.active_power_kw < 0
        )
        
        # In a real microgrid, we infer average market price via internal matching, 
        # but here we proxy it or it's fetched out of band.
        average_price = 0.15 
        
        return AnonymizedGridState(
            total_pooled_capacity_kwh=total_capacity,
            participating_microgrid_count=len(self.active_sensors),
            aggregate_demand_signal=total_demand / max(1.0, total_capacity),
            average_market_price=average_price,
            round_fraction=0.0,  # Contextual, typically set by the negotiation loop
            stability_margin=0.0, # Will be computed by LP solver downstream
            peer_cooperation_rate=peer_coop_rate,
            exogenous_stress_index=ex_stress,
            exogenous_signal_stale=False
        )

    def generate_agent_profiles(self) -> dict[str, AgentProfile]:
        """
        Extracts real physical capabilities into economic profiles for the LP Solver.
        """
        profiles = {}
        for device_id, sensor in self.active_sensors.items():
            if sensor.active_power_kw > 0:
                # Discharging/Generating
                profiles[device_id] = SellerProfile(
                    generation_cost=5.0, # Hardcoded proxy, typically fetched from metadata
                    available_capacity=sensor.active_power_kw,
                    outside_option=0.0
                )
            else:
                # Charging/Consuming
                profiles[device_id] = BuyerProfile(
                    energy_value=25.0,
                    demand=abs(sensor.active_power_kw),
                    outside_option=0.0
                )
        return profiles
