import pytest
from app.grid.standard_grids import load_standard_grid
from app.experiments.scenario_generator import generate_scenario

def test_scenario_generator():
    net = load_standard_grid('ieee33')
    agents = generate_scenario(net, n_agents=50)
    
    assert len(agents) == 50
    assert all(a['type'] in ['buy', 'sell'] for a in agents)
    assert all('node_id' in a for a in agents)
    assert all('quantity_kw' in a for a in agents)
    assert all('price' in a for a in agents)
