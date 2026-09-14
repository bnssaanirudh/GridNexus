import pandapower as pp
import pandapower.networks as nw
from app.grid.network_model import ElectricalNetwork, Node, Line

def load_standard_grid(name: str) -> ElectricalNetwork:
    """
    Loads a standard IEEE grid from pandapower and converts it into GridNexus ElectricalNetwork format.
    Supports 'ieee33', 'ieee69', 'ieee118' (as proxy for 123-bus).
    """
    if name == 'ieee33':
        net = nw.case33bw()
    elif name == 'ieee69':
        net = nw.case69()
    elif name == 'ieee118':
        net = nw.case118()
    else:
        raise ValueError(f"Unknown grid name: {name}")

    # Initialize GridNexus representation
    gn_net = ElectricalNetwork(base_mva=net.sn_mva)
    
    slack_buses = set(net.ext_grid.bus.values)
    
    # Map nodes (buses)
    for idx, bus in net.bus.iterrows():
        bus_id = str(bus.name)
        is_slack = bus.name in slack_buses
        
        # Aggregate loads
        p_load_mw = 0.0
        q_load_mvar = 0.0
        if not net.load.empty:
            bus_loads = net.load[net.load.bus == bus.name]
            p_load_mw = bus_loads.p_mw.sum()
            q_load_mvar = bus_loads.q_mvar.sum()
            
        # Aggregate gens
        p_gen_mw = 0.0
        q_gen_mvar = 0.0
        if not net.gen.empty:
            bus_gens = net.gen[net.gen.bus == bus.name]
            p_gen_mw = bus_gens.p_mw.sum()
            q_gen_mvar = bus_gens.q_mvar.sum()
            
        if not net.sgen.empty:
            bus_sgens = net.sgen[net.sgen.bus == bus.name]
            p_gen_mw += bus_sgens.p_mw.sum()
            q_gen_mvar += bus_sgens.q_mvar.sum()

        v_min = bus.min_vm_pu if bus.min_vm_pu == bus.min_vm_pu else 0.9  # check NaN
        v_max = bus.max_vm_pu if bus.max_vm_pu == bus.max_vm_pu else 1.1

        gn_node = Node(
            id=bus_id,
            is_slack=is_slack,
            voltage_level_kv=float(bus.vn_kv) if 'vn_kv' in bus else 11.0,
            v_min_pu=float(v_min) if v_min == v_min else 0.9,
            v_max_pu=float(v_max) if v_max == v_max else 1.1,
            p_gen_kw=float(p_gen_mw * 1000.0),
            p_load_kw=float(p_load_mw * 1000.0),
            q_gen_kvar=float(q_gen_mvar * 1000.0),
            q_load_kvar=float(q_load_mvar * 1000.0)
        )
        gn_net.nodes[gn_node.id] = gn_node
        
    # Map lines
    for idx, line in net.line.iterrows():
        line_id = f"line_{idx}"
        f_bus = str(int(line.from_bus))
        t_bus = str(int(line.to_bus))
        
        # Convert pu back to ohms if needed, but pandapower line gives ohms directly in `r_ohm_per_km`
        r_ohms = line.r_ohm_per_km * line.length_km
        x_ohms = line.x_ohm_per_km * line.length_km
        
        vn_kv = net.bus.at[int(line.from_bus), 'vn_kv'] if 'vn_kv' in net.bus.columns else 11.0
        max_ka = line.max_i_ka if 'max_i_ka' in line else 1.0
        max_mva = max_ka * vn_kv * (3**0.5)
        
        gn_line = Line(
            id=line_id,
            from_node=f_bus,
            to_node=t_bus,
            r_ohms=float(r_ohms),
            x_ohms=float(x_ohms),
            thermal_limit_kw=float(max_mva * 1000.0)
        )
        gn_net.lines[gn_line.id] = gn_line
        
    return gn_net
