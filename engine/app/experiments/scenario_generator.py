import random
from typing import List, Dict, Any
from app.grid.network_model import ElectricalNetwork

def generate_scenario(
    net: ElectricalNetwork,
    n_agents: int = 100,
    solar_penetration: float = 0.3,
    wind_penetration: float = 0.2,
    base_load_kw: float = 10.0,
    volatility: float = 0.1
) -> List[Dict[str, Any]]:
    """
    Generate synthetic agents (prosumers) across the electrical network.
    
    Args:
        net: The electrical network topology.
        n_agents: Total number of market agents to generate.
        solar_penetration: Probability of an agent having solar generation.
        wind_penetration: Probability of an agent having wind generation.
        base_load_kw: Mean base load for each agent.
        volatility: Noise factor for randomizing loads and generation.
        
    Returns:
        List of agent profiles (bids/asks).
    """
    nodes = list(net.nodes.keys())
    if not nodes:
        raise ValueError("Network has no nodes to map agents to.")
        
    agents = []
    
    for i in range(n_agents):
        # Assign agent to a random node
        node_id = random.choice(nodes)
        
        # Determine agent type and capabilities
        has_solar = random.random() < solar_penetration
        has_wind = random.random() < wind_penetration
        
        # Base load (randomized)
        load_kw = max(0.1, random.gauss(base_load_kw, base_load_kw * volatility))
        
        # Generation
        gen_kw = 0.0
        if has_solar:
            gen_kw += max(0.0, random.gauss(5.0, 5.0 * volatility))
        if has_wind:
            gen_kw += max(0.0, random.gauss(8.0, 8.0 * volatility))
            
        # Determine if they are a net buyer or seller
        net_power = gen_kw - load_kw
        
        if net_power > 0:
            # Seller
            bid_type = 'sell'
            quantity = net_power
            # Sellers want to sell at least a minimum price
            price = max(0.01, random.gauss(0.05, 0.01)) # $/kWh
        else:
            # Buyer
            bid_type = 'buy'
            quantity = abs(net_power)
            # Buyers are willing to pay up to a maximum price
            price = max(0.01, random.gauss(0.15, 0.03)) # $/kWh
            
        agent = {
            "agent_id": f"agent_{i}",
            "node_id": node_id,
            "type": bid_type,
            "quantity_kw": round(quantity, 3),
            "price": round(price, 4),
            "flexibility_kw": round(quantity * random.uniform(0.1, 0.5), 3) # 10-50% flexibility
        }
        
        agents.append(agent)
        
    return agents
