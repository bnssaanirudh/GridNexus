import torch
import torch.nn as nn
import numpy as np

class LSTMLoadForecaster(nn.Module):
    """
    LSTM-based time-series forecasting model for microgrid load prediction.
    Robustness against forecast errors is a key requirement for Q1 papers.
    """
    def __init__(self, input_size=1, hidden_size=64, num_layers=2, output_size=1):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)
        
    def forward(self, x):
        # x shape: (batch, seq_len, input_size)
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        out, _ = self.lstm(x, (h0, c0))
        # Take the last sequence step
        out = self.fc(out[:, -1, :])
        return out

def get_forecast_error(base_value: float, std_dev: float = 0.05) -> float:
    """
    Simulates forecasting error by injecting Gaussian noise into the true value.
    The RL agent will observe the forecasted value (with error), but physics
    engine evaluates on true value.
    """
    noise = np.random.normal(0, std_dev)
    return max(0.0, base_value + noise)
