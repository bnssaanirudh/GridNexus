"""
engine/app/negotiate/provider.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LLM Provider abstractions for the negotiation pipeline.
"""
from abc import ABC, abstractmethod
import os
import logging
from typing import Any

from app import telemetry

logger = logging.getLogger(__name__)

class ProviderError(Exception):
    """Raised when the underlying LLM provider fails."""
    pass

class NegotiationLLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    def generate_response(self, prompt: str) -> str:
        """Generates a raw string response from the LLM for a given prompt."""
        pass

class MockLLMProvider(NegotiationLLMProvider):
    """A deterministic mock provider for testing and simulation."""
    
    def __init__(self, default_response: str = '{"action": "ACCEPT", "price_per_kwh": 5.0, "requested_kwh": 10.0, "rationale": "Mock accept"}'):
        self.default_response = default_response
        self.call_count = 0
        
    def generate_response(self, prompt: str) -> str:
        telemetry.llm_invocation_total.inc()
        self.call_count += 1
        return self.default_response

class LangChainLLMProvider(NegotiationLLMProvider):
    """A production LLM provider using LangChain's Chat models."""
    
    def __init__(
        self,
        model_name: str = "gpt-4o-mini",
        temperature: float = 0.0,
        api_key: str | None = None,
        base_url: str | None = None,
    ):
        # We lazily import langchain to avoid slow startup if not used
        try:
            from langchain_openai import ChatOpenAI
            kwargs: dict[str, Any] = dict(
                model=model_name,
                temperature=temperature,
                api_key=api_key,
            )
            if base_url:
                kwargs["base_url"] = base_url
            self.llm = ChatOpenAI(**kwargs)
        except ImportError:
            raise ProviderError("langchain-openai is not installed.")
        except Exception as e:
            raise ProviderError(f"Failed to initialize ChatOpenAI: {e}")

    def generate_response(self, prompt: str) -> str:
        telemetry.llm_invocation_total.inc()
        try:
            response = self.llm.invoke(prompt)
            # Depending on LangChain version, it might return an AIMessage or string
            if hasattr(response, "content"):
                return response.content
            return str(response)
        except Exception as e:
            telemetry.llm_provider_error_total.inc()
            logger.error(f"LLM Provider Error: {e}")
            raise ProviderError(f"LLM Provider failed: {e}")

def get_provider(api_key: str | None = None) -> NegotiationLLMProvider:
    """Factory to get the appropriate LLM provider based on configuration."""
    mode = os.environ.get("GRIDNEXUS_MODE", "simulation").lower()

    # Resolve credentials / endpoint from environment
    resolved_key = api_key or os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("LLM_BASE_URL")          # e.g. https://api.tokenrouter.com/v1
    model_name = os.environ.get("LLM_MODEL", "gpt-4o-mini")

    if mode == "production":
        # In production, we MUST have a configured provider if LLM is enabled
        llm_enabled = os.environ.get("GRIDNEXUS_LLM_ENABLED", "true").lower() == "true"
        if not llm_enabled:
             raise RuntimeError("Production mode requires GRIDNEXUS_LLM_ENABLED=true or a safe explicit fallback.")
        
        provider_type = os.environ.get("LLM_PROVIDER", "openai").lower()
        if provider_type == "openai":
            if not resolved_key:
                raise RuntimeError("LLM_API_KEY (or OPENAI_API_KEY) is required for LangChainLLMProvider in production.")
            return LangChainLLMProvider(model_name=model_name, api_key=resolved_key, base_url=base_url)
        else:
            raise RuntimeError(f"Unsupported LLM_PROVIDER in production: {provider_type}")
            
    else:
        # For simulation/test, fall back to Mock if no key is provided
        if resolved_key:
            try:
                return LangChainLLMProvider(model_name=model_name, api_key=resolved_key, base_url=base_url)
            except ProviderError:
                pass
        return MockLLMProvider()
