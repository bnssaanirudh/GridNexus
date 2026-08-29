from dataclasses import dataclass
from typing import Dict, Tuple

@dataclass
class Battery:
    id: str
    energy_capacity_kwh: float
    max_charge_kw: float
    max_discharge_kw: float
    efficiency: float
    current_soc_kwh: float
    degradation_cost_per_kwh: float = 0.0

class BatteryModel:
    """
    Models battery State of Charge (SOC) transitions and bounds.
    """
    @staticmethod
    def simulate_dispatch(
        battery: Battery, 
        power_kw: float, 
        interval_hours: float
    ) -> Tuple[bool, float, str]:
        """
        Simulates dispatching `power_kw` for `interval_hours`.
        Positive power = discharge (providing to grid).
        Negative power = charge (taking from grid).
        
        Returns:
            Tuple[bool, float, str]: (is_feasible, new_soc_kwh, violation_reason)
        """
        if power_kw > 0:
            # Discharge
            if power_kw > battery.max_discharge_kw:
                return False, battery.current_soc_kwh, f"Exceeds max discharge: {power_kw} > {battery.max_discharge_kw}"
            
            energy_drawn_kwh = power_kw * interval_hours / battery.efficiency
            new_soc = battery.current_soc_kwh - energy_drawn_kwh
            
            if new_soc < 0:
                return False, new_soc, f"Insufficient SOC: draws {energy_drawn_kwh} kWh from {battery.current_soc_kwh} kWh"
                
        elif power_kw < 0:
            # Charge
            p_charge = abs(power_kw)
            if p_charge > battery.max_charge_kw:
                return False, battery.current_soc_kwh, f"Exceeds max charge: {p_charge} > {battery.max_charge_kw}"
                
            energy_added_kwh = p_charge * interval_hours * battery.efficiency
            new_soc = battery.current_soc_kwh + energy_added_kwh
            
            if new_soc > battery.energy_capacity_kwh:
                return False, new_soc, f"Exceeds capacity: {new_soc} > {battery.energy_capacity_kwh}"
        else:
            new_soc = battery.current_soc_kwh

        return True, new_soc, ""
