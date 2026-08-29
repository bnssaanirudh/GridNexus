"""engine/tests/test_connector_resilience.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Acceptance tests for External Data Connector Resilience.

Tests
-----
T1 - Chaos: Sustained 500 → circuit trips → stale cache → auto-recovery.
T2 - Rate limiter: Calls beyond quota are throttled / rejected.
T3 - Staleness propagation: Stale signal is measurably down-weighted in Oracle.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest

from app.oracle.anonymized_state import AnonymizedGridState
from app.rag.connectors import BaseConnector, RawDocument, WeatherConnector
from app.rag.rate_limiter import RateLimiter
from app.rag.resilience import (
    CachedSignal,
    CircuitBreaker,
    CircuitState,
    ResilientConnector,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_docs(content: str = "sunny") -> list[RawDocument]:
    return [RawDocument(source_type="weather", content=content)]


def _make_resilient(
    inner: BaseConnector,
    failure_threshold: int = 5,
    cooldown_seconds: float = 60.0,
    rate_calls_per_second: float = 100.0,  # effectively unlimited for most tests
    max_retry_attempts: int = 1,
) -> ResilientConnector:
    cb = CircuitBreaker(
        failure_threshold=failure_threshold,
        cooldown_seconds=cooldown_seconds,
        connector_name="test_weather",
    )
    rl = RateLimiter(calls_per_second=rate_calls_per_second, burst=200, connector_name="test_weather")
    return ResilientConnector(inner=inner, circuit_breaker=cb, rate_limiter=rl, max_retry_attempts=max_retry_attempts)


# ─── T1: Chaos – circuit trip, stale cache, auto-recovery ─────────────────────


class ChaoticConnector(BaseConnector):
    """Connector that fails for a configurable number of calls, then succeeds."""

    def __init__(self) -> None:
        self._calls = 0
        self.fail_for: int = 0  # how many calls to fail
        self.recovery_doc: str = "After storm, sunshine returns."

    def fetch_signals(self, **kwargs) -> list[RawDocument]:  # type: ignore[override]
        self._calls += 1
        if self._calls <= self.fail_for:
            raise ConnectionError(f"HTTP 500 – call #{self._calls}")
        return _make_docs(self.recovery_doc)


def test_t1_circuit_breaker_trips_on_sustained_failures():
    """T1a: Circuit trips within 5 consecutive failures (max_retry_attempts=1)."""
    connector = ChaoticConnector()
    connector.fail_for = 999  # always fail

    rc = _make_resilient(connector, failure_threshold=5, max_retry_attempts=1)
    # Pre-populate cache so we don't hit RuntimeError on stale fallback
    rc._last_good_cache = CachedSignal(documents=_make_docs("cached sunshine"), stale=False)

    # 5 failures → circuit should be OPEN after the 5th
    for i in range(5):
        result = rc.fetch_signals()
        assert result.stale is True, f"Should serve stale after failure {i + 1}"

    assert rc._cb.state == CircuitState.OPEN, "Circuit should be OPEN after 5 consecutive failures"


def test_t1_circuit_trips_exactly_at_threshold():
    """T1b: The breaker trips at exactly `failure_threshold` consecutive failures."""
    cb = CircuitBreaker(failure_threshold=5, cooldown_seconds=60.0, connector_name="test")
    assert cb.state == CircuitState.CLOSED

    for i in range(4):
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED, f"Should still be CLOSED after {i + 1} failures"

    cb.record_failure()
    assert cb.state == CircuitState.OPEN, "Should be OPEN after 5th failure"


def test_t1_stale_cache_served_during_outage():
    """T1c: During an outage (circuit open), stale cached data is returned."""
    connector = ChaoticConnector()
    connector.fail_for = 999

    rc = _make_resilient(connector, failure_threshold=5, max_retry_attempts=1)
    good_docs = _make_docs("last good data")
    rc._last_good_cache = CachedSignal(documents=good_docs, stale=False)

    # Force circuit open
    rc._cb._state = CircuitState.OPEN
    rc._cb._opened_at = time.monotonic()

    result = rc.fetch_signals()
    assert result.stale is True
    assert result.documents[0].content == "last good data"


def test_t1_auto_recovery_after_cooldown():
    """T1d: Circuit closes automatically after cooldown + one successful probe."""
    connector = ChaoticConnector()
    connector.fail_for = 5  # fail for the first 5 calls, then succeed

    # Very short cooldown for testing
    cb = CircuitBreaker(failure_threshold=5, cooldown_seconds=0.05, connector_name="weather")
    rl = RateLimiter(calls_per_second=100.0, burst=200, connector_name="weather")
    rc = ResilientConnector(inner=connector, circuit_breaker=cb, rate_limiter=rl, max_retry_attempts=1)
    rc._last_good_cache = CachedSignal(documents=_make_docs("old data"), stale=False)

    # Trip the circuit
    for _ in range(5):
        rc.fetch_signals()  # each fails and returns stale

    assert cb.state == CircuitState.OPEN

    # Wait for cooldown → transitions to HALF_OPEN
    time.sleep(0.1)
    assert cb.state == CircuitState.HALF_OPEN

    # The 6th call onwards succeeds → circuit CLOSES
    result = rc.fetch_signals()
    assert result.stale is False
    assert connector.recovery_doc in result.documents[0].content
    assert cb.state == CircuitState.CLOSED


# ─── T2: Rate limiter ─────────────────────────────────────────────────────────


def test_t2_rate_limiter_rejects_calls_beyond_quota():
    """T2a: Calls exceeding the configured quota are rejected with RuntimeError."""
    # burst=3, so only first 3 calls are allowed before refill
    rl = RateLimiter(calls_per_second=0.1, burst=3, connector_name="weather")

    for _ in range(3):
        rl.acquire()  # should succeed

    with pytest.raises(RuntimeError, match="Rate limit exceeded"):
        rl.acquire()  # 4th call should fail


def test_t2_rate_limiter_allows_calls_after_token_refill():
    """T2b: After waiting, new tokens accumulate and calls succeed again."""
    rl = RateLimiter(calls_per_second=50.0, burst=1, connector_name="weather")
    rl.acquire()  # consume the burst token

    with pytest.raises(RuntimeError, match="Rate limit exceeded"):
        rl.acquire()  # immediately fails

    # Wait for refill: 1 token at 50 tokens/s = 0.02s
    time.sleep(0.03)
    rl.acquire()  # should succeed after refill


def test_t2_preconfigured_limiters_have_correct_rates():
    """T2c: Preconfigured limiters match documented API quotas."""
    weather_rl = RateLimiter.for_weather()
    assert weather_rl.calls_per_second == 1.0
    assert weather_rl.burst == 5

    grid_rl = RateLimiter.for_grid_load()
    assert grid_rl.calls_per_second == 2.0

    reg_rl = RateLimiter.for_regulatory()
    assert reg_rl.calls_per_second == 0.5


def test_t2_rate_limiter_rejects_via_resilient_connector():
    """T2d: Rate-limited rejection propagates correctly through ResilientConnector."""
    connector = WeatherConnector()
    # rate limiter with 0 burst (immediate exhaustion)
    rl = RateLimiter(calls_per_second=0.0, burst=0, connector_name="weather")
    cb = CircuitBreaker(failure_threshold=5, connector_name="weather")
    rc = ResilientConnector(inner=connector, circuit_breaker=cb, rate_limiter=rl, max_retry_attempts=1)
    rc._last_good_cache = CachedSignal(documents=_make_docs("cached"), stale=False)

    with pytest.raises(RuntimeError, match="Rate limit exceeded"):
        rc.fetch_signals()


# ─── T3: Staleness propagation in Oracle ──────────────────────────────────────

_BASE_STATE_KWARGS = dict(
    total_pooled_capacity_kwh=500.0,
    participating_microgrid_count=5,
    aggregate_demand_signal=0.6,
    average_market_price=0.12,
    round_fraction=0.4,
    stability_margin=0.2,
    peer_cooperation_rate=0.7,
    exogenous_stress_index=0.8,
)


def test_t3_stale_signal_is_down_weighted_in_obs_vector():
    """T3a: exogenous_stress_index is halved when exogenous_signal_stale=True."""
    fresh = AnonymizedGridState(**_BASE_STATE_KWARGS, exogenous_signal_stale=False)
    stale = AnonymizedGridState(**_BASE_STATE_KWARGS, exogenous_signal_stale=True)

    fresh_vec = fresh.to_obs_vector()
    stale_vec = stale.to_obs_vector()

    # The exogenous stress index is the last element of the vector
    exogenous_idx = 7
    assert fresh_vec[exogenous_idx] == pytest.approx(0.8, abs=1e-6)
    assert stale_vec[exogenous_idx] == pytest.approx(0.4, abs=1e-6), (
        "Stale signal should be down-weighted by 50%"
    )


def test_t3_non_exogenous_fields_unchanged_by_staleness():
    """T3b: All other obs-vector fields are identical whether stale or not."""
    fresh = AnonymizedGridState(**_BASE_STATE_KWARGS, exogenous_signal_stale=False)
    stale = AnonymizedGridState(**_BASE_STATE_KWARGS, exogenous_signal_stale=True)

    fresh_vec = fresh.to_obs_vector()
    stale_vec = stale.to_obs_vector()

    for i in range(7):  # indices 0–6 must be identical
        assert fresh_vec[i] == pytest.approx(stale_vec[i], abs=1e-9), (
            f"Field at index {i} should not change due to staleness"
        )


def test_t3_stale_flag_defaults_to_false():
    """T3c: exogenous_signal_stale defaults to False (backward-compatible)."""
    state = AnonymizedGridState(**_BASE_STATE_KWARGS)
    assert state.exogenous_signal_stale is False
    # Confirm no down-weighting when stale is not set
    vec = state.to_obs_vector()
    assert vec[7] == pytest.approx(0.8, abs=1e-6)


def test_t3_zero_stress_unaffected_by_stale():
    """T3d: If exogenous stress is 0.0, stale flag has no effect."""
    kwargs = {**_BASE_STATE_KWARGS, "exogenous_stress_index": 0.0}
    stale = AnonymizedGridState(**kwargs, exogenous_signal_stale=True)
    vec = stale.to_obs_vector()
    assert vec[7] == pytest.approx(0.0, abs=1e-9)
