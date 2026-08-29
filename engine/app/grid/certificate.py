from typing import Dict, Any, List, Tuple
from .network_model import ElectricalNetwork
import hashlib
import json
from datetime import datetime

class ConstraintChecker:
    """
    Checks physical grid constraints post-power flow solve.
    """
    @staticmethod
    def check_network(network: ElectricalNetwork, pf_results: Dict[str, Any]) -> Tuple[bool, List[str]]:
        violations = []
        
        # 1. Voltage bounds
        voltages = pf_results["voltages_pu"]
        for node_id, v in voltages.items():
            node = network.nodes[node_id]
            if v < node.v_min_pu:
                violations.append(f"Undervoltage at {node_id}: {v:.4f} p.u. < {node.v_min_pu} p.u.")
            if v > node.v_max_pu:
                violations.append(f"Overvoltage at {node_id}: {v:.4f} p.u. > {node.v_max_pu} p.u.")
                
        # 2. Thermal limits
        loadings = pf_results["line_loading_pct"]
        for line_id, loading in loadings.items():
            if loading > 100.0:
                violations.append(f"Thermal overload on line {line_id}: {loading:.2f}%")
                
        # 3. Power balance error
        if pf_results["power_balance_error_kw"] > 1.0: # allow 1kW tolerance for numerical
            violations.append(f"Power balance mismatch: {pf_results['power_balance_error_kw']:.2f} kW")
            
        is_feasible = len(violations) == 0
        return is_feasible, violations

def generate_certificate(
    negotiation_id: str,
    network: ElectricalNetwork,
    pf_results: Dict[str, Any],
    violations: List[str]
) -> Dict[str, Any]:
    """
    Generates an auditable GridFeasibilityCertificate payload.
    """
    is_feasible = len(violations) == 0
    
    # Simple hash of the network inputs
    input_str = str([(nid, n.p_load_kw, n.p_gen_kw) for nid, n in sorted(network.nodes.items())])
    input_hash = hashlib.sha256(input_str.encode()).hexdigest()
    
    # Hash of results
    result_str = json.dumps({
        "theta": pf_results["theta"],
        "line_flows": pf_results["line_flows_kw"]
    }, sort_keys=True)
    result_hash = hashlib.sha256(result_str.encode()).hexdigest()
    
    max_loading = max(pf_results["line_loading_pct"].values()) if pf_results["line_loading_pct"] else 0.0
    min_v = min(pf_results["voltages_pu"].values()) if pf_results["voltages_pu"] else 1.0
    max_v = max(pf_results["voltages_pu"].values()) if pf_results["voltages_pu"] else 1.0
    
    return {
        "negotiationId": negotiation_id,
        "networkVersion": 1,
        "solver": "SciPy_DCPowerFlow",
        "solverVersion": "1.0",
        "feasible": is_feasible,
        "violations": violations if not is_feasible else [],
        "maxLineLoadingPct": max_loading,
        "minVoltagePu": min_v,
        "maxVoltagePu": max_v,
        "powerBalanceError": pf_results["power_balance_error_kw"],
        "inputHash": input_hash,
        "resultHash": result_hash
    }
