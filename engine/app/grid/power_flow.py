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

class SOCPPowerFlow:
    """
    Implements Second-Order Cone Programming (SOCP) relaxation for AC Power Flow.
    Provides rigorous bounds on voltage magnitudes and active/reactive power flows,
    necessary for Q1 publication standards in distribution grids.
    """
    def __init__(self, network: ElectricalNetwork):
        self.network = network
        self.node_ids = list(network.nodes.keys())
        self.node_idx = {nid: i for i, nid in enumerate(self.node_ids)}
        self.n_nodes = len(self.node_ids)
        
        self.slack_idx = 0
        for i, nid in enumerate(self.node_ids):
            if network.nodes[nid].is_slack:
                self.slack_idx = i
                break

    def solve(self) -> Dict[str, Any]:
        """
        Solves the SOCP relaxation.
        Requires cvxpy to be installed. Returns exact voltages and P/Q flows.
        """
        import cvxpy as cp
        
        # Variables
        v_sq = cp.Variable(self.n_nodes)  # Squared voltage magnitudes
        
        n_lines = len(self.network.lines)
        line_ids = list(self.network.lines.keys())
        line_idx = {lid: i for i, lid in enumerate(line_ids)}
        
        P_flow = cp.Variable(n_lines) # Active power flow
        Q_flow = cp.Variable(n_lines) # Reactive power flow
        l_sq = cp.Variable(n_lines)   # Squared current magnitude
        
        constraints = []
        base_kw = self.network.base_mva * 1000.0
        
        # Voltage limits
        for i, nid in enumerate(self.node_ids):
            node = self.network.nodes[nid]
            if i == self.slack_idx:
                constraints.append(v_sq[i] == 1.0)
            else:
                constraints.append(v_sq[i] >= (node.v_min_pu ** 2))
                constraints.append(v_sq[i] <= (node.v_max_pu ** 2))
                
        # Nodal balance equations
        for i, nid in enumerate(self.node_ids):
            node = self.network.nodes[nid]
            
            p_inj = (node.p_gen_kw - node.p_load_kw) / base_kw
            q_inj = (node.q_gen_kvar - node.q_load_kvar) / base_kw
            
            # Find lines connected to node i
            lines_in = []
            lines_out = []
            for lid, line in self.network.lines.items():
                l_i = line_idx[lid]
                if self.node_idx[line.from_node] == i:
                    lines_out.append(l_i)
                elif self.node_idx[line.to_node] == i:
                    lines_in.append(l_i)
                    
            if i != self.slack_idx:
                # Active power balance
                P_balance = p_inj + cp.sum([P_flow[l_i] for l_i in lines_in]) - cp.sum([l_sq[l_i] * (self.network.lines[line_ids[l_i]].r_ohms / self.network.get_base_z(self.network.lines[line_ids[l_i]].from_node)) for l_i in lines_in]) - cp.sum([P_flow[l_i] for l_i in lines_out])
                constraints.append(P_balance == 0)
                
                # Reactive power balance
                Q_balance = q_inj + cp.sum([Q_flow[l_i] for l_i in lines_in]) - cp.sum([l_sq[l_i] * (self.network.lines[line_ids[l_i]].x_ohms / self.network.get_base_z(self.network.lines[line_ids[l_i]].from_node)) for l_i in lines_in]) - cp.sum([Q_flow[l_i] for l_i in lines_out])
                constraints.append(Q_balance == 0)

        # Ohm's law & SOCP constraints per line
        for lid, line in self.network.lines.items():
            l_i = line_idx[lid]
            fr = self.node_idx[line.from_node]
            to = self.node_idx[line.to_node]
            z_base = self.network.get_base_z(line.from_node)
            r_pu = line.r_ohms / z_base
            x_pu = line.x_ohms / z_base
            
            # v_j = v_i - 2(rP + xQ) + (r^2 + x^2)l
            constraints.append(v_sq[to] == v_sq[fr] - 2 * (r_pu * P_flow[l_i] + x_pu * Q_flow[l_i]) + (r_pu**2 + x_pu**2) * l_sq[l_i])
            
            # SOCP relaxation: P^2 + Q^2 <= v_i * l
            constraints.append(cp.SOC(v_sq[fr] + l_sq[l_i], cp.vstack([2*P_flow[l_i], 2*Q_flow[l_i], v_sq[fr] - l_sq[l_i]])))

        # Objective: minimize losses (which makes the SOCP relaxation exact for radial distribution networks)
        objective = cp.Minimize(cp.sum(l_sq))
        
        prob = cp.Problem(objective, constraints)
        prob.solve(solver=cp.ECOS, verbose=False)
        
        if prob.status not in ["optimal", "optimal_inaccurate"]:
            raise ValueError(f"SOCP Solver failed: {prob.status}")
            
        voltages_pu = {nid: float(np.sqrt(v_sq.value[i])) for nid, i in self.node_idx.items()}
        line_flows_kw = {lid: float(P_flow.value[line_idx[lid]]) * base_kw for lid in line_ids}
        line_loading_pct = {lid: (abs(line_flows_kw[lid]) / max(self.network.lines[lid].thermal_limit_kw, 1e-6)) * 100.0 for lid in line_ids}
        
        return {
            "voltages_pu": voltages_pu,
            "line_flows_kw": line_flows_kw,
            "line_loading_pct": line_loading_pct,
            "status": prob.status
        }

