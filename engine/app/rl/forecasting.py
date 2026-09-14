import torch
import torch.nn as nn
import numpy as np



def get_forecast_error(base_value: float, std_dev: float = 0.05) -> float:
    """
    Simulates forecasting error by injecting Gaussian noise into the true value.
    The RL agent will observe the forecasted value (with error), but physics
    engine evaluates on true value.
    """
    noise = np.random.normal(0, std_dev)
    return max(0.0, base_value + noise)
