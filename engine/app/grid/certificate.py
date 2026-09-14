"""
engine/app/grid/certificate.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generates auditable GridFeasibilityCertificates.

Key guarantees:
  - Input hash: RFC-8785-style canonical JSON (sort_keys=True) covering the
    full electrical network state (P, Q, V limits, r, x, thermal limits) plus
    topology version.  Python repr() is NOT used — hash is stable across
    Python versions and interpreter runs.
  - Topology version: caller-supplied from TopologyRevision.version; never
    hardcoded.
  - Solver + version: populated dynamically from the installed library so the
    cert accurately records which code produced the result.
"""
from typing import Dict, Any, List, Tuple
from .network_model import ElectricalNetwork
import hashlib
import json
from datetime import datetime

# ── Solver version strings (resolved once at import time) ─────────────────────
try:
    import scipy
    _SCIPY_VERSION = scipy.__version__
except ImportError:
    _SCIPY_VERSION = "unknown"

try:
    import cvxpy
    _CVXPY_VERSION = cvxpy.__version__
except ImportError:
    _CVXPY_VERSION = "unknown"

try:
    import numpy
    _NUMPY_VERSION = numpy.__version__
except ImportError:
    _NUMPY_VERSION = "unknown"

try:
    import pandapower
    _PANDAPOWER_VERSION = pandapower.__version__
except ImportError:
    _PANDAPOWER_VERSION = "unknown"


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
        if pf_results.get("power_balance_error_kw", 0.0) > 1.0:  # allow 1 kW tolerance
            violations.append(f"Power balance mismatch: {pf_results['power_balance_error_kw']:.2f} kW")

        # 4. Reactive power violations (if available from SOCP)
        if "q_violations" in pf_results:
            violations.extend(pf_results["q_violations"])

        is_feasible = len(violations) == 0
        return is_feasible, violations


def _canonical_network_hash(network: ElectricalNetwork, topology_version: int) -> str:
    """
    Produces a stable SHA-256 hash of the full network input state.

    Covers: topology version, all node parameters (P, Q, V limits),
    and all line parameters (r, x, thermal limit, from/to IDs).
    Uses json.dumps with sort_keys=True for determinism.
    """
    payload = {
        "topology_version": topology_version,
        "nodes": sorted(
            [
                {
                    "id": nid,
                    "p_gen_kw": round(float(n.p_gen_kw), 6),
                    "p_load_kw": round(float(n.p_load_kw), 6),
                    "q_gen_kvar": round(float(getattr(n, "q_gen_kvar", 0.0)), 6),
                    "q_load_kvar": round(float(getattr(n, "q_load_kvar", 0.0)), 6),
                    "v_min_pu": round(float(n.v_min_pu), 6),
                    "v_max_pu": round(float(n.v_max_pu), 6),
                }
                for nid, n in network.nodes.items()
            ],
            key=lambda x: x["id"],
        ),
        "lines": sorted(
            [
                {
                    "id": lid,
                    "from_node": l.from_node,
                    "to_node": l.to_node,
                    "r_ohms": round(float(l.r_ohms), 8),
                    "x_ohms": round(float(l.x_ohms), 8),
                    "thermal_limit_kw": round(float(l.thermal_limit_kw), 4),
                }
                for lid, l in network.lines.items()
            ],
            key=lambda x: x["id"],
        ),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def generate_certificate(
    negotiation_id: str,
    network: ElectricalNetwork,
    pf_results: Dict[str, Any],
    violations: List[str],
    topology_version: int,
    solver: str = "dc",   # "dc" | "socp" | "ac"
) -> Dict[str, Any]:
    """
    Generates an auditable GridFeasibilityCertificate payload.

    Parameters
    ----------
    topology_version:
        Must be fetched from TopologyRevision.version — never hardcoded.
    solver:
        "dc"   → DCPowerFlow  (numpy.linalg.solve)
        "socp" → SOCPPowerFlow (cvxpy ECOS)
        "ac"   → ACPowerFlow (pandapower runpp)
    """
    is_feasible = len(violations) == 0

    input_hash = _canonical_network_hash(network, topology_version)

    # Result hash: canonical JSON of key output quantities
    result_payload: Dict[str, Any] = {
        "voltages_pu": {k: round(float(v), 8) for k, v in pf_results["voltages_pu"].items()},
        "line_flows_kw": {k: round(float(v), 6) for k, v in pf_results["line_flows_kw"].items()},
    }
    # Include reactive flows and current magnitudes when available (SOCP)
    if "q_flows_kvar" in pf_results:
        result_payload["q_flows_kvar"] = {
            k: round(float(v), 6) for k, v in pf_results["q_flows_kvar"].items()
        }
    if "current_sq" in pf_results:
        result_payload["current_sq"] = {
            k: round(float(v), 8) for k, v in pf_results["current_sq"].items()
        }

    result_canonical = json.dumps(result_payload, sort_keys=True, separators=(",", ":"))
    result_hash = hashlib.sha256(result_canonical.encode("utf-8")).hexdigest()

    # Dynamic solver metadata
    if solver == "socp":
        solver_name = "cvxpy_SOCP_ECOS"
        solver_version = _CVXPY_VERSION
    elif solver == "ac":
        solver_name = "pandapower_AC_NR"
        solver_version = _PANDAPOWER_VERSION
    else:
        solver_name = "numpy_DC_linsolve"
        solver_version = _NUMPY_VERSION

    max_loading = max(pf_results["line_loading_pct"].values()) if pf_results.get("line_loading_pct") else 0.0
    min_v = min(pf_results["voltages_pu"].values()) if pf_results.get("voltages_pu") else 1.0
    max_v = max(pf_results["voltages_pu"].values()) if pf_results.get("voltages_pu") else 1.0

    return {
        "negotiationId": negotiation_id,
        "networkVersion": topology_version,
        "solver": solver_name,
        "solverVersion": solver_version,
        "feasible": is_feasible,
        "violations": violations if not is_feasible else [],
        "maxLineLoadingPct": max_loading,
        "minVoltagePu": min_v,
        "maxVoltagePu": max_v,
        "powerBalanceError": pf_results.get("power_balance_error_kw", 0.0),
        "inputHash": input_hash,
        "resultHash": result_hash,
    }

def validate_certificate_state(
    cert_input_hash: str,
    cert_telemetry_timestamp: datetime,
    current_network: ElectricalNetwork,
    current_topology_version: int,
    max_telemetry_age_seconds: int = 60
) -> Tuple[bool, str]:
    """
    Validates a dual-certificate against the current physical state.
    Prompts 21 & 22: Topology / telemetry invalidation.
    """
    # 1. Telemetry freshness check
    age_seconds = (datetime.now(cert_telemetry_timestamp.tzinfo) - cert_telemetry_timestamp).total_seconds()
    if age_seconds > max_telemetry_age_seconds:
        return False, f"Certificate invalidated: telemetry age {age_seconds:.1f}s exceeds limit {max_telemetry_age_seconds}s"
        
    # 2. Topology and physical limits mismatch check
    current_hash = _canonical_network_hash(current_network, current_topology_version)
    if cert_input_hash != current_hash:
        return False, "Certificate invalidated: physical topology or constraints have changed since certification"
        
    return True, "Valid"

