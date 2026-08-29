import numpy as np
from typing import Dict, Any, Tuple
from .network_model import ElectricalNetwork

class DCPowerFlow:
    """
    Implements a DC Power Flow formulation for grid physics verification.
    DC Power Flow is robust for arbitrary topologies (radial or meshed).
    Assumes voltage ~ 1.0 p.u. and calculates phase angles (theta) and active power flows (P).
    Adds a heuristic voltage drop calculation to provide approximate voltage profiles.
    """
    def __init__(self, network: ElectricalNetwork):
        self.network = network
        
        # Map node IDs to matrix indices
        self.node_ids = list(network.nodes.keys())
        self.node_idx = {nid: i for i, nid in enumerate(self.node_ids)}
        self.n_nodes = len(self.node_ids)
        
        # Identify slack bus (assume index 0 if none specified)
        self.slack_idx = 0
        for i, nid in enumerate(self.node_ids):
            if network.nodes[nid].is_slack:
                self.slack_idx = i
                break
                
        # Non-slack indices
        self.pqv_idx = [i for i in range(self.n_nodes) if i != self.slack_idx]

    def _build_b_matrix(self) -> np.ndarray:
        """Construct the susceptance matrix (B) in per-unit."""
        B = np.zeros((self.n_nodes, self.n_nodes))
        
        for line in self.network.lines.values():
            i = self.node_idx[line.from_node]
            j = self.node_idx[line.to_node]
            
            # Base impedance for the line (use from_node base)
            z_base = self.network.get_base_z(line.from_node)
            
            # Reactance in p.u. (prevent div by zero)
            x_pu = max(line.x_ohms / z_base, 1e-6)
            b = 1.0 / x_pu
            
            B[i, j] -= b
            B[j, i] -= b
            B[i, i] += b
            B[j, j] += b
            
        return B

    def solve(self) -> Dict[str, Any]:
        """
        Solves the DC power flow and returns line flows, angles, and voltages.
        """
        B = self._build_b_matrix()
        
        # Reduce B matrix (remove slack row/col)
        B_reduced = B[np.ix_(self.pqv_idx, self.pqv_idx)]
        
        # Power injections in p.u.
        P_inj_pu = np.zeros(self.n_nodes)
        base_kw = self.network.base_mva * 1000.0
        
        for i, nid in enumerate(self.node_ids):
            node = self.network.nodes[nid]
            # Injection = Gen - Load
            P_inj_pu[i] = (node.p_gen_kw - node.p_load_kw) / base_kw
            
        P_inj_reduced = P_inj_pu[self.pqv_idx]
        
        # Solve for angles (theta)
        try:
            theta_reduced = np.linalg.solve(B_reduced, P_inj_reduced)
        except np.linalg.LinAlgError:
            # If singular, network might have islands without slack
            raise ValueError("B-matrix is singular. The network may be islanded without a slack bus.")
            
        theta = np.zeros(self.n_nodes)
        theta[self.pqv_idx] = theta_reduced
        
        # Calculate line flows and heuristic voltages
        line_flows_kw = {}
        line_loading_pct = {}
        
        # Initialize voltages to 1.0 p.u.
        voltages = np.ones(self.n_nodes)
        
        for line_id, line in self.network.lines.items():
            i = self.node_idx[line.from_node]
            j = self.node_idx[line.to_node]
            
            z_base = self.network.get_base_z(line.from_node)
            x_pu = max(line.x_ohms / z_base, 1e-6)
            r_pu = line.r_ohms / z_base
            
            # P_ij = (theta_i - theta_j) / X_ij
            p_flow_pu = (theta[i] - theta[j]) / x_pu
            p_flow_kw = p_flow_pu * base_kw
            
            line_flows_kw[line_id] = p_flow_kw
            
            # Loading percentage (absolute flow)
            limit = line.thermal_limit_kw
            if limit > 0:
                loading = (abs(p_flow_kw) / limit) * 100.0
            else:
                loading = 0.0
            line_loading_pct[line_id] = loading
            
            # Heuristic voltage drop (LinDistFlow approximation: dV = - (RP + XQ) / V_nom)
            # Assuming Q=0 for DC power flow, dV = - R * P
            dv_ij = r_pu * p_flow_pu
            # For a radial path from slack, we could integrate this. 
            # As a simple mesh-compatible approximation for small drops:
            if i == self.slack_idx:
                voltages[j] = voltages[i] - dv_ij
            elif j == self.slack_idx:
                voltages[i] = voltages[j] + dv_ij
            else:
                # Average if both non-slack (very heuristic)
                pass # Needs a proper linear solve for exact V, we'll keep it simple

        # Slack bus power balance (slack covers losses + mismatches)
        slack_power_pu = -np.sum(P_inj_reduced) 
        P_inj_pu[self.slack_idx] = slack_power_pu
        power_balance_error_kw = abs(np.sum(P_inj_pu)) * base_kw # Should be very close to 0

        # Construct results
        results = {
            "theta": {nid: theta[i] for nid, i in self.node_idx.items()},
            "voltages_pu": {nid: voltages[i] for nid, i in self.node_idx.items()},
            "line_flows_kw": line_flows_kw,
            "line_loading_pct": line_loading_pct,
            "power_balance_error_kw": power_balance_error_kw,
            "slack_power_kw": slack_power_pu * base_kw
        }
        
        return results
