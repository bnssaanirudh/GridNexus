import pytest
from app.negotiate.retry import negotiate_with_retry, ReasoningDeficit, get_registry
from app.negotiate.validation import OfferProposal, OfferValidationError
from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction

@pytest.fixture
def dqn_wrapper():
    # Use INFERENCE mode for deterministic output
    wrapper = DQNWrapper(mode="INFERENCE")
    return wrapper

@pytest.fixture
def state_dict():
    return {
        "capacity": 100.0,
        "cost": 10.0,
        "offer_price": 12.0,
        "offer_requested_kwh": 50.0,
        "round_number": 2,
        "opponent_history_embedding": [0.0, 0.0, 0.0, 0.0]
    }

def test_successful_llm_negotiation(dqn_wrapper, state_dict):
    # Mock LLM that returns a valid JSON string
    def mock_llm_call(prompt: str) -> str:
        return '{"action": "ACCEPT", "price_per_kwh": 12.0, "requested_kwh": 50.0, "rationale": "Good deal"}'
    
    offer, final_action, overridden, best_q, llm_q = negotiate_with_retry(
        llm_call=mock_llm_call,
        prompt="Test prompt",
        agent_id="agent_1",
        negotiation_id="neg_1",
        round_number=2,
        dqn_wrapper=dqn_wrapper,
        dqn_state_dict=state_dict,
    )
    
    assert offer is not None
    assert offer.action == "ACCEPT"
    assert offer.price_per_kwh == 12.0
    
def test_llm_validation_failure_triggers_dqn_fallback(dqn_wrapper, state_dict):
    registry = get_registry()
    registry.reset()
    
    # Mock LLM that always returns invalid JSON
    def mock_llm_call(prompt: str) -> str:
        return "I am an AI and I don't follow instructions."
        
    offer, final_action, overridden, best_q, llm_q = negotiate_with_retry(
        llm_call=mock_llm_call,
        prompt="Test prompt",
        agent_id="agent_1",
        negotiation_id="neg_1",
        round_number=2,
        dqn_wrapper=dqn_wrapper,
        dqn_state_dict=state_dict,
    )
    
    # Should fail all retries and fallback to DQN
    assert offer is None
    assert overridden is True
    assert registry.fallback_count() == 1
