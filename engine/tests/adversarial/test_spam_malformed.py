import pytest
import torch
import torch.nn as nn
from app.negotiate.retry import negotiate_with_retry, get_registry
from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction
from app.agents.microgrid_agent import MicrogridAgent
from app.agents.secret_field import SecretFloat

class MalformedSpammerAgent(MicrogridAgent):
    """
    Adversary (c): Agent spams malformed offers to trigger reasoning deficit fallback.
    """
    pass

class DummyActor(nn.Module):
    def forward(self, x):
        # Always output highest logit for index 1 -> COUNTER_OFFER
        return torch.tensor([[0.0, 1.0, 0.0]]) 

def test_spam_malformed_triggers_bounded_fallback():
    """
    Verify that if an agent spams malformed non-JSON data to disrupt the
    negotiation, the system exhausts MAX_RETRIES and gracefully falls back to 
    the DQN action, bounding the fallback rate without crashing the session.
    """
    registry = get_registry()
    registry.reset()
    
    dqn = DQNWrapper(state_dim=8, action_dim=3)
    dqn.epsilon = 0.0 # Disable epsilon-greedy exploration so it always exploits the network
    # Monkey-patch the q_network so it always predicts COUNTER_OFFER
    dqn.q_network = DummyActor() 
    
    # The mock LLM will unconditionally return garbage non-JSON spam
    def mock_spam_llm(prompt: str) -> str:
        return "HAHAHA INVALID JSON SPAM!"
        
    offer, fallback_action, fallback_used = negotiate_with_retry(
        llm_call=mock_spam_llm,
        prompt="Please propose an offer.",
        agent_id="spammer_1",
        negotiation_id="neg_999",
        round_number=1,
        dqn_wrapper=dqn,
        dqn_state_dict={
            "capacity": 10.0, 
            "offer_price": 0.1, 
            "offer_requested_kwh": 5.0,
            "round_number": 1.0,
            "opponent_history_embedding": [0.1, 0.2, 0.3, 0.4]
        },
        registry=registry
    )
    
    # Assert the fallback was triggered gracefully (offer is None)
    assert fallback_used is True
    assert offer is None
    
    # The DQN must return its fallback action (which we mocked to COUNTER_OFFER)
    assert fallback_action == NegotiationAction.COUNTER_OFFER
    
    # Assert the DeficitRegistry properly bounded the fallback and tracked the event
    assert registry.fallback_count() == 1
    assert registry.total_count() == 1
    assert registry.fallback_rate() == 1.0
