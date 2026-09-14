import pytest
import json
from app.grid.hil_gateway import HardwareGateway, PhysicalSensorReading
from app.schemas.stability import SellerProfile, BuyerProfile

def test_hil_gateway_ingest_and_synthesize():
    gateway = HardwareGateway(target_substation_id="SUB_01")
    
    # Simulate incoming Modbus TCP payloads
    payload_1 = json.dumps({
        "device_id": "meter_a",
        "active_power_kw": 150.0,  # Generator
        "reactive_power_kvar": 10.0,
        "voltage_pu": 1.01,
        "soc_pct": 80.5,
        "status_code": 0
    })
    
    payload_2 = json.dumps({
        "device_id": "meter_b",
        "active_power_kw": -50.0,  # Consumer
        "reactive_power_kvar": 5.0,
        "voltage_pu": 0.98,
        "soc_pct": None,
        "status_code": 0
    })
    
    payload_3 = json.dumps({
        "device_id": "meter_faulty",
        "active_power_kw": 500.0,  # Should be zeroed out
        "reactive_power_kvar": 50.0,
        "voltage_pu": 1.05,
        "soc_pct": 100.0,
        "status_code": 1  # FAULT
    })
    
    gateway.ingest_telemetry_frame(payload_1)
    gateway.ingest_telemetry_frame(payload_2)
    gateway.ingest_telemetry_frame(payload_3)
    
    # Assert active sensors correctly logged and faulty is zeroed out
    assert "meter_a" in gateway.active_sensors
    assert gateway.active_sensors["meter_faulty"].active_power_kw == 0.0
    
    # Synthesize State
    state = gateway.synthesize_grid_state(peer_coop_rate=0.8, ex_stress=0.2)
    assert state.total_pooled_capacity_kwh == 150.0  # Only meter_a is generating
    assert state.participating_microgrid_count == 3
    # Demand is 50.0 from meter_b. 50 / 150 = 0.333
    assert abs(state.aggregate_demand_signal - (50.0 / 150.0)) < 1e-4
    
    # Generate Profiles
    profiles = gateway.generate_agent_profiles()
    assert isinstance(profiles["meter_a"], SellerProfile)
    assert profiles["meter_a"].available_capacity == 150.0
    assert isinstance(profiles["meter_b"], BuyerProfile)
    assert profiles["meter_b"].demand == 50.0
