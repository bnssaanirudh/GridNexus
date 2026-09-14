import copy
import logging
from typing import Tuple, Dict, Any, Optional

import cvxpy as cp
import numpy as np

from app.grid.network_model import ElectricalNetwork
from app.grid.power_flow import DCPowerFlow, SOCPPowerFlow, ACPowerFlow
from app.grid.certificate import ConstraintChecker

logger = logging.getLogger(__name__)

def verify_hierarchical(network: ElectricalNetwork) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Prompt 20: Hierarchical electrical feasibility certification.
    Stage 1: DC (Analytical/Fast)
    Stage 2: SOCP (Convex verification)
    Stage 3: AC (Full nonlinear validation) - used if SOCP warns or margin is tight.
    """
    # --- Stage 1: DC Screening ---
    dc_pf = DCPowerFlow(network)
    try:
        dc_res = dc_pf.solve()
        dc_ok, dc_violations = ConstraintChecker.check_network(network, dc_res)
    except Exception as e:
        dc_ok, dc_violations = False, [str(e)]
        
    # --- Stage 2: SOCP Validation ---
    socp_pf = SOCPPowerFlow(network)
    try:
        socp_res = socp_pf.solve()
        socp_ok, socp_violations = ConstraintChecker.check_network(network, socp_res)
    except Exception as e:
        socp_ok, socp_violations = False, [f"SOCP failed: {e}"]
        socp_res = {}
        
    if not socp_ok:
        return False, "socp", {"violations": socp_violations}
        
    # Check margins. If any line is > 90% loaded, invoke Stage 3 AC for safety.
    max_loading = max(socp_res.get("line_loading_pct", {}).values(), default=0.0)
    
    if max_loading < 90.0:
        # Safe enough to skip AC
        return True, "socp", socp_res
        
    # --- Stage 3: Full AC Validation ---
    ac_pf = ACPowerFlow(network)
    try:
        ac_res = ac_pf.solve()
        ac_ok, ac_violations = ConstraintChecker.check_network(network, ac_res)
        if ac_ok:
            return True, "ac", ac_res
        else:
            return False, "ac", {"violations": ac_violations}
    except Exception as e:
        return False, "ac", {"violations": [f"AC failed: {e}"]}


def corrective_dispatch(
    network: ElectricalNetwork, 
    seller_node: str, 
    buyer_node: str, 
    proposed_kw: float
) -> Optional[float]:
    """
    Prompt 19: Design corrective settlement.
    Finds the nearest feasible transaction quantity using an SOCP OPF formulation.
    """
    low = 0.0
    high = proposed_kw
    best_feasible_kw = 0.0
    
    # Binary search projection
    for _ in range(8):  # 8 iterations gives ~1% accuracy
        mid = (low + high) / 2.0
        
        test_net = copy.deepcopy(network)
        test_net.nodes[seller_node].p_gen_kw += mid
        test_net.nodes[buyer_node].p_load_kw += mid
        
        ok, solver, res = verify_hierarchical(test_net)
        
        if ok:
            best_feasible_kw = mid
            low = mid
        else:
            high = mid
            
    # Economic acceptable correction threshold (e.g. if we had to slash by more than 80%, reject entirely)
    if best_feasible_kw < (0.2 * proposed_kw):
        return None
        
    return round(best_feasible_kw, 3)

def verify_and_correct_dispatch(
    network: ElectricalNetwork, 
    seller_node: str, 
    buyer_node: str, 
    proposed_kw: float
) -> Tuple[bool, float, str, Dict[str, Any]]:
    """
    Main entry point for Prompts 19 & 20.
    Returns: (is_accepted, final_kw, solver_used, results)
    """
    test_net = copy.deepcopy(network)
    test_net.nodes[seller_node].p_gen_kw += proposed_kw
    test_net.nodes[buyer_node].p_load_kw += proposed_kw
    
    ok, solver, res = verify_hierarchical(test_net)
    
    if ok:
        return True, proposed_kw, solver, res
        
    # Infeasible. Compute corrective settlement.
    corrected_kw = corrective_dispatch(network, seller_node, buyer_node, proposed_kw)
    if corrected_kw is None:
        return False, 0.0, solver, res # Failed completely
        
    test_net_corr = copy.deepcopy(network)
    test_net_corr.nodes[seller_node].p_gen_kw += corrected_kw
    test_net_corr.nodes[buyer_node].p_load_kw += corrected_kw
    
    c_ok, c_solver, c_res = verify_hierarchical(test_net_corr)
    if c_ok:
        return True, corrected_kw, c_solver, c_res
    else:
        return False, 0.0, c_solver, c_res
