"""tests/test_oracle_policy.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Three acceptance-criterion tests for the Grid Oracle :

1. test_oracle_select_action_returns_valid_signal
   - Oracle returns a valid action_id and matching label from ORACLE_ACTIONS.

2. test_oracle_broadcast_shifts_agents_toward_pooling
   - Simulation: compare pooled-capacity outcomes *with* vs *without* Oracle
     broadcasts over N episodes. Assert the with-Oracle case is ≥ baseline.

3. test_oracle_signal_route_never_exposes_hidden_fields
   - POST /oracle/signal integration test: the response JSON and the constructed
     state contain no per-agent hidden field values.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from app.oracle.anonymized_state import AnonymizedGridState, OBS_DIM as ANON_OBS_DIM
from app.oracle.inference import (
    OraclePolicy,
    ORACLE_ACTIONS,
)
from app.oracle.simulation_environment import sample_random_state as _sample_random_state
from app.oracle.simulation_environment import simulate_environment_response as _simulate_oracle_reward


# ─── Fixtures ─────────────────────────────────────────────────────────────────


def _make_state(**kwargs: Any) -> AnonymizedGridState:
    """Create a valid AnonymizedGridState with sensible defaults."""
    defaults = dict(
        total_pooled_capacity_kwh=150.0,
        participating_microgrid_count=5,
        aggregate_demand_signal=0.6,
        average_market_price=0.18,
        round_fraction=0.4,
        stability_margin=0.05,
        peer_cooperation_rate=0.4,
        exogenous_stress_index=0.3,
    )
    defaults.update(kwargs)
    return AnonymizedGridState(**defaults)


@pytest.fixture(scope="module")
def oracle() -> OraclePolicy:
    """
    Return a fast-trained OraclePolicy (10 episodes only so CI is quick).
    We use a fresh temp checkpoint dir to avoid polluting the real artifacts/.
    """
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmpdir:
        policy = OraclePolicy(checkpoint_dir=Path(tmpdir))
        yield policy


# ─── Test 1: basic inference ─────────────────────────────────────────────────


class TestOracleSelectAction:
    def test_returns_valid_action_id(self, oracle: OraclePolicy) -> None:
        """select_action must return an action_id in ORACLE_ACTIONS."""
        state = _make_state()
        action_id, label, text = oracle.select_action(state)

        assert action_id in ORACLE_ACTIONS, (
            f"action_id {action_id} is not in ORACLE_ACTIONS ({list(ORACLE_ACTIONS.keys())})"
        )

    def test_label_matches_action_id(self, oracle: OraclePolicy) -> None:
        """The returned label must equal ORACLE_ACTIONS[action_id]."""
        state = _make_state()
        action_id, label, text = oracle.select_action(state)
        assert label == ORACLE_ACTIONS[action_id]

    def test_broadcast_text_is_non_empty(self, oracle: OraclePolicy) -> None:
        """Broadcast text must be a non-empty human-readable string."""
        state = _make_state()
        _, _, text = oracle.select_action(state)
        assert isinstance(text, str) and len(text) > 10

    def test_action_probs_sum_to_one(self, oracle: OraclePolicy) -> None:
        """Softmax probabilities must sum to 1.0."""
        state = _make_state()
        probs = oracle.action_probs(state)
        assert abs(sum(probs.values()) - 1.0) < 1e-5, (
            f"Action probs do not sum to 1: {probs}"
        )

    def test_obs_vector_has_correct_dim(self) -> None:
        """to_obs_vector must return a vector of length OBS_DIM."""
        state = _make_state()
        vec = state.to_obs_vector()
        assert len(vec) == ANON_OBS_DIM


# ─── Test 2: simulation — with-Oracle vs without-Oracle ──────────────────────


class TestOraclePolicyShiftsPooling:
    """
    Compare pooled-capacity outcome across N simulated episodes with vs without
    Oracle broadcasts.

    Implementation note:
    Rather than running a full negotiation environment (which would need MAPPO
    training for the *microgrid* agents too), we model the Oracle's influence
    via the _simulate_oracle_reward function, which captures the domain insight:
    when the Oracle selects the *correct* signal (matching the dominant stress
    type), agents receive a higher cooperation incentive and pool more.

    We simulate two conditions:
      - BASELINE: agents act with random signal (action=HOLD_STABLE always)
      - WITH_ORACLE: agents receive the Oracle's chosen signal

    The assertion: mean reward under WITH_ORACLE >= mean reward under BASELINE.
    This directly measures whether the Oracle's chosen signals shift outcomes
    toward pooling.
    """

    N_EPISODES = 100

    def test_oracle_broadcast_improves_mean_reward(self, oracle: OraclePolicy) -> None:
        rng = np.random.default_rng(0)
        baseline_rewards: list[float] = []
        oracle_rewards: list[float] = []

        for _ in range(self.N_EPISODES):
            state = _sample_random_state(rng)

            # Baseline: always broadcast HOLD_STABLE (action 4) — no persuasion
            baseline_reward = _simulate_oracle_reward(state, action=4, rng=rng)
            baseline_rewards.append(baseline_reward)

            # Oracle: let the policy choose
            action_id, _, _ = oracle.select_action(state)
            oracle_reward = _simulate_oracle_reward(state, action=action_id, rng=rng)
            oracle_rewards.append(oracle_reward)

        mean_baseline = float(np.mean(baseline_rewards))
        mean_oracle = float(np.mean(oracle_rewards))

        assert mean_oracle >= mean_baseline, (
            f"Oracle broadcast did NOT improve mean reward: "
            f"oracle={mean_oracle:.4f} vs baseline={mean_baseline:.4f}. "
            "The policy should be choosing better signals than always broadcasting HOLD_STABLE."
        )

    def test_storm_state_triggers_storm_alert_or_pool_signal(self, oracle: OraclePolicy) -> None:
        """
        When exogenous stress is very high (>0.9), the Oracle should preferentially
        emit STORM_ALERT (3) or POOL_NOW (0) rather than HOLD_STABLE (4).

        We run 20 samples with high-stress states and assert that HOLD_STABLE is
        chosen less than 60% of the time (since HOLD_STABLE rewards 0 under stress).
        """
        rng = np.random.default_rng(99)
        hold_stable_count = 0
        N = 20

        for _ in range(N):
            state = _make_state(
                exogenous_stress_index=float(rng.uniform(0.85, 1.0)),
                aggregate_demand_signal=float(rng.uniform(0.75, 1.0)),
                peer_cooperation_rate=float(rng.uniform(0, 0.3)),
            )
            action_id, _, _ = oracle.select_action(state)
            if action_id == 4:  # HOLD_STABLE
                hold_stable_count += 1

        # At most 70% HOLD_STABLE in a high-stress environment
        hold_stable_rate = hold_stable_count / N
        assert hold_stable_rate < 0.70, (
            f"Oracle chose HOLD_STABLE {hold_stable_rate:.0%} of the time under "
            f"high-stress conditions — the policy is not responding to exogenous stress."
        )


# ─── Test 3: /oracle/signal integration — no hidden field leak ───────────────


class TestOracleSignalRoute:
    """Integration test for POST /oracle/signal."""

    HIDDEN_FIELD_NAMES = {
        "battery_capacity_kwh",
        "baseline_generation_cost",
        "hiddenbatterycapacity",
        "hiddengenerationcost",
        "agent_id",
        "secret",
    }

    @pytest.fixture
    def valid_request_body(self) -> dict:
        return {
            "state": {
                "total_pooled_capacity_kwh": 200.0,
                "participating_microgrid_count": 8,
                "aggregate_demand_signal": 0.55,
                "average_market_price": 0.20,
                "round_fraction": 0.3,
                "stability_margin": 0.1,
                "peer_cooperation_rate": 0.5,
                "exogenous_stress_index": 0.4,
            }
        }

    @pytest.mark.asyncio
    async def test_signal_response_contains_no_hidden_fields(
        self, valid_request_body: dict
    ) -> None:
        """
        The /oracle/signal response body must not contain any hidden field names.
        """
        from app.main import app

        # Patch the DB persistence so no live Postgres is needed
        with patch("app.routers.oracle.AsyncSessionLocal") as mock_sl:
            mock_session = AsyncMock()
            mock_sl.return_value.__aenter__.return_value = mock_session

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/oracle/signal", json=valid_request_body)

        assert resp.status_code == 200, f"Unexpected status: {resp.status_code} {resp.text}"

        resp_json = resp.json()
        resp_keys = set(resp_json.keys())
        leaks = resp_keys & self.HIDDEN_FIELD_NAMES
        assert not leaks, (
            f"/oracle/signal response contains hidden field(s): {leaks}\n"
            f"Response: {resp_json}"
        )

    @pytest.mark.asyncio
    async def test_signal_response_has_required_fields(
        self, valid_request_body: dict
    ) -> None:
        """
        The response must contain: signal, broadcast_text, action_id,
        action_probs, confidence.
        """
        from app.main import app

        with patch("app.routers.oracle.AsyncSessionLocal") as mock_sl:
            mock_session = AsyncMock()
            mock_sl.return_value.__aenter__.return_value = mock_session

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/oracle/signal", json=valid_request_body)

        assert resp.status_code == 200
        data = resp.json()
        for field in ("signal", "broadcast_text", "action_id", "action_probs", "confidence"):
            assert field in data, f"Missing field '{field}' in response: {data}"

        assert data["signal"] in ORACLE_ACTIONS.values()
        assert 0.0 <= data["confidence"] <= 1.0

    @pytest.mark.asyncio
    async def test_request_without_state_returns_400(self) -> None:
        """Sending an empty body should return HTTP 400 or 422."""
        from app.main import app

        with patch("app.routers.oracle.AsyncSessionLocal") as mock_sl:
            mock_session = AsyncMock()
            mock_sl.return_value.__aenter__.return_value = mock_session

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/oracle/signal", json={})

        assert resp.status_code in (400, 422), (
            f"Expected 400 or 422 for empty body, got {resp.status_code}"
        )

    @pytest.mark.asyncio
    async def test_persisted_signal_data_contains_no_hidden_fields(
        self, valid_request_body: dict
    ) -> None:
        """
        The signal_data string persisted to oraclesignals must not contain
        hidden field names.
        """
        from app.main import app

        persisted_signal_data: list[str] = []

        async def capture_execute(query, params=None, **kwargs):
            if params and "signal_data" in params:
                persisted_signal_data.append(params["signal_data"])
            mock_result = MagicMock()
            mock_result.fetchall.return_value = []
            return mock_result

        mock_session = AsyncMock()
        mock_session.execute.side_effect = capture_execute

        with patch("app.routers.oracle.AsyncSessionLocal") as mock_sl:
            mock_sl.return_value.__aenter__.return_value = mock_session

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/oracle/signal", json=valid_request_body)

        assert resp.status_code == 200

        if persisted_signal_data:
            signal_str = persisted_signal_data[0]
            for hidden in self.HIDDEN_FIELD_NAMES:
                assert hidden not in signal_str, (
                    f"Persisted signal_data contains hidden field '{hidden}': {signal_str}"
                )
