"""
engine/app/telemetry.py
━━━━━━━━━━━━━━━━━━━━━━━
Lightweight, thread-safe Prometheus-compatible counter mechanism.

Replaces the simple list-based in-process registry with standard counters.
"""

import threading
from typing import Dict

class Counter:
    """A thread-safe Prometheus-compatible counter."""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self._value = 0
        self._lock = threading.Lock()

    def inc(self, amount: int = 1) -> None:
        """Increment the counter by amount."""
        with self._lock:
            self._value += amount

    def get(self) -> int:
        """Get the current value."""
        with self._lock:
            return self._value

    def reset(self) -> None:
        """Reset the counter to zero (useful for tests)."""
        with self._lock:
            self._value = 0

class TelemetryRegistry:
    """Registry holding all metrics for exposition."""

    def __init__(self):
        self._counters: Dict[str, Counter] = {}
        self._lock = threading.Lock()

    def counter(self, name: str, description: str) -> Counter:
        """Get or create a counter by name."""
        with self._lock:
            if name not in self._counters:
                self._counters[name] = Counter(name, description)
            return self._counters[name]

    def get_all_metrics(self) -> Dict[str, Counter]:
        """Return a copy of all counters."""
        with self._lock:
            return dict(self._counters)
            
    def export_prometheus(self) -> str:
        """Export all counters in Prometheus text exposition format."""
        lines = []
        metrics = self.get_all_metrics()
        for name, counter in metrics.items():
            lines.append(f"# HELP {name} {counter.description}")
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {counter.get()}")
        return "\n".join(lines) + "\n" if lines else ""

# Singleton registry
registry = TelemetryRegistry()

# Standard LLM/DQN counters
llm_invocation_total = registry.counter("gridnexus_llm_invocation_total", "Total LLM negotiation prompts generated")
llm_validation_failure_total = registry.counter("gridnexus_llm_validation_failure_total", "Total LLM validation failures requiring retry")
llm_retry_total = registry.counter("gridnexus_llm_retry_total", "Total LLM retries")
llm_provider_error_total = registry.counter("gridnexus_llm_provider_error_total", "Total LLM provider errors (timeout, connection, etc)")
dqn_fallback_total = registry.counter("gridnexus_dqn_fallback_total", "Total negotiations that fell back to DQN entirely")
dqn_override_total = registry.counter("gridnexus_dqn_override_total", "Total valid LLM proposals overridden by DQN preference")
negotiation_round_total = registry.counter("gridnexus_negotiation_round_total", "Total negotiation rounds processed")
