import pytest
from app.grid.standard_grids import load_standard_grid
from app.grid.corrective_dispatch import verify_and_correct_dispatch

def test_load_ieee33():
    net = load_standard_grid('ieee33')
    assert len(net.nodes) == 33
    assert len(net.lines) > 0
    
    # Try a transaction on the standard grid
    ok, kw, solver, res = verify_and_correct_dispatch(net, "10", "20", 500.0)
    
    # Check if the function ran without raising errors
    # It might be True or False depending on grid physics
    assert isinstance(ok, bool)
    assert isinstance(kw, float)
    assert solver in ["socp", "ac"]
