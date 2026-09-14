import pandapower.networks as nw
from app.grid.network_model import ElectricalNetwork, Node, Line

def pp_to_electrical_network(net, base_mva: float = 1.0) -> ElectricalNetwork:
    """
    Converts a pandapower network object into a GridNexus ElectricalNetwork.
    """
    en = ElectricalNetwork(base_mva=base_mva)
    
    # Check for external grids (slack buses)
    slack_buses = set()
    if hasattr(net, 'ext_grid') and not net.ext_grid.empty:
        slack_buses = set(net.ext_grid.bus.values)

    # 1. Map Buses -> Nodes
    for idx, row in net.bus.iterrows():
        nid = f"bus-{idx}"
        is_slack = (idx in slack_buses)
        en.nodes[nid] = Node(
            id=nid,
            voltage_level_kv=row.vn_kv,
            is_slack=is_slack
        )
        
    # 2. Map Static Loads
    if hasattr(net, 'load') and not net.load.empty:
        for idx, row in net.load.iterrows():
            nid = f"bus-{row.bus}"
            if nid in en.nodes:
                en.nodes[nid].p_load_kw += float(row.p_mw * 1000.0) if hasattr(row, 'p_mw') and not type(row.p_mw) is type(None) else 0.0
                en.nodes[nid].q_load_kvar += float(row.q_mvar * 1000.0) if hasattr(row, 'q_mvar') and not type(row.q_mvar) is type(None) else 0.0

    # 3. Map Generators / Static Generators
    if hasattr(net, 'sgen') and not net.sgen.empty:
        for idx, row in net.sgen.iterrows():
            nid = f"bus-{row.bus}"
            if nid in en.nodes:
                en.nodes[nid].p_gen_kw += float(row.p_mw * 1000.0) if hasattr(row, 'p_mw') and not type(row.p_mw) is type(None) else 0.0
                en.nodes[nid].q_gen_kvar += float(row.q_mvar * 1000.0) if hasattr(row, 'q_mvar') and not type(row.q_mvar) is type(None) else 0.0
                
    if hasattr(net, 'gen') and not net.gen.empty:
        for idx, row in net.gen.iterrows():
            nid = f"bus-{row.bus}"
            if nid in en.nodes:
                en.nodes[nid].p_gen_kw += float(row.p_mw * 1000.0) if hasattr(row, 'p_mw') and not type(row.p_mw) is type(None) else 0.0
                en.nodes[nid].q_gen_kvar += float(row.q_mvar * 1000.0) if hasattr(row, 'q_mvar') and not type(row.q_mvar) is type(None) else 0.0

    # 4. Map Lines
    if hasattr(net, 'line') and not net.line.empty:
        for idx, row in net.line.iterrows():
            src = f"bus-{int(row.from_bus)}"
            tgt = f"bus-{int(row.to_bus)}"
            line_id = f"line-{idx}"
            
            # Impedance = per-km * length
            r = float(row.r_ohm_per_km * row.length_km)
            x = float(row.x_ohm_per_km * row.length_km)
            
            # Thermal limit approximation (I_max * V_base * sqrt(3))
            limit = 100000.0 # fallback 100MW
            if hasattr(row, 'max_i_ka') and row.max_i_ka:
                base_kv = en.nodes[src].voltage_level_kv
                limit = float(row.max_i_ka * base_kv * 1000.0 * 1.732)
                
            en.lines[line_id] = Line(
                id=line_id,
                from_node=src,
                to_node=tgt,
                r_ohms=r,
                x_ohms=x,
                thermal_limit_kw=limit
            )
            
    # Trafo mapping (Simplified as lines for benchmarking if needed)
    if hasattr(net, 'trafo') and not net.trafo.empty:
        for idx, row in net.trafo.iterrows():
            src = f"bus-{int(row.hv_bus)}"
            tgt = f"bus-{int(row.lv_bus)}"
            line_id = f"trafo-{idx}"
            en.lines[line_id] = Line(
                id=line_id,
                from_node=src,
                to_node=tgt,
                r_ohms=0.1,  # Simplified
                x_ohms=0.5,  # Simplified
                thermal_limit_kw=100000.0
            )

    return en

def load_ieee_14_bus() -> ElectricalNetwork:
    """Loads the IEEE 14-bus transmission system."""
    net = nw.case14()
    return pp_to_electrical_network(net, base_mva=net.sn_mva)

def load_ieee_33_bus() -> ElectricalNetwork:
    """Loads the standard IEEE 33-bus radial distribution network."""
    net = nw.case33bw()
    return pp_to_electrical_network(net, base_mva=net.sn_mva)

def load_cigre_mv() -> ElectricalNetwork:
    """Loads the CIGRE Medium Voltage distribution network."""
    net = nw.create_cigre_network_mv(with_der=False)
    return pp_to_electrical_network(net, base_mva=net.sn_mva)
