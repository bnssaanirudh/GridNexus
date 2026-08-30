"""
engine/tests/test_reasoning_deficit.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tests for Reasoning-Deficit Tolerance & Retry Logic.

Test sections
─────────────
1. OfferProposal schema validation (≥3 invalid-offer cases)
2. Fault-injection: partial failure with retry recovery
3. Fault-injection: full failure with DQN fallback
4. Integration: deficit appears in registry; /metrics counter increments
5. /metrics route (JSON + Prometheus format)
"""

from __future__ import annotations

import json
from collections.abc import Callable
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.negotiate.retry import (
    DeficitRegistry,
    MAX_RETRIES,
    negotiate_with_retry,
)
from app.negotiate.validation import (
    MAX_KWH,
    MAX_PRICE_PER_KWH,
    OfferProposal,
    OfferValidationError,
    validate_offer,
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

VALID_OFFER_JSON = json.dumps(
    {
        "action": "COUNTER_OFFER",
        "price_per_kwh": 45.0,
        "requested_kwh": 100.0,
        "rationale": "I need a better margin.",
    }
)


def _make_dqn():
    """Return a real DQNWrapper (untrained weights are fine for action selection)."""
    from app.agents.dqn_wrapper import DQNWrapper

    return DQNWrapper(state_dim=8, action_dim=3, threshold=100.0)


def _dqn_state() -> dict:
    return {
        "capacity": 120.0,
        "offer_price": 40.0,
        "offer_requested_kwh": 100.0,
        "round_number": 1,
        "opponent_history_embedding": [0.1, 0.2, 0.1, 0.1],
    }


def _llm_sequence(*responses: str) -> Callable[[str], str]:
    """Return a callable that yields `responses` in order on successive calls."""
    it = iter(responses)

    def _call(prompt: str) -> str:  # noqa: ARG001
        return next(it)

    return _call


# ─── 1. OfferProposal schema validation ───────────────────────────────────────


class TestOfferValidation:
    """Unit tests on the validate_offer / OfferProposal schema."""

    def test_valid_offer_parses_cleanly(self) -> None:
        offer = validate_offer(VALID_OFFER_JSON)
        assert offer.action == "COUNTER_OFFER"
        assert offer.price_per_kwh == 45.0
        assert offer.requested_kwh == 100.0

    # ── Invalid case 1: negative price ────────────────────────────────────────
    def test_negative_price_raises(self) -> None:
        bad = json.dumps(
            {"action": "ACCEPT", "price_per_kwh": -1.0, "requested_kwh": 50.0}
        )
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(bad)
        assert "price_per_kwh" in exc_info.value.error_detail
        assert "≥" in exc_info.value.error_detail

    # ── Invalid case 2: over-capacity (kwh exceeds MAX_KWH) ──────────────────
    def test_over_capacity_kwh_raises(self) -> None:
        bad = json.dumps(
            {"action": "ACCEPT", "price_per_kwh": 10.0, "requested_kwh": MAX_KWH + 1}
        )
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(bad)
        assert "requested_kwh" in exc_info.value.error_detail
        assert "grid limit" in exc_info.value.error_detail

    # ── Invalid case 3: missing required field ────────────────────────────────
    def test_missing_field_raises(self) -> None:
        bad = json.dumps({"action": "ACCEPT", "price_per_kwh": 10.0})  # no requested_kwh
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(bad)
        assert "requested_kwh" in exc_info.value.error_detail

    # ── Invalid case 4: unknown action value ──────────────────────────────────
    def test_invalid_action_raises(self) -> None:
        bad = json.dumps(
            {"action": "SPAM", "price_per_kwh": 10.0, "requested_kwh": 50.0}
        )
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(bad)
        assert "action" in exc_info.value.error_detail

    # ── Invalid case 5: malformed JSON ───────────────────────────────────────
    def test_malformed_json_raises(self) -> None:
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer("this is not json {{{")
        assert "JSON" in exc_info.value.error_detail

    # ── Invalid case 6: zero-price counter-offer (cross-field) ───────────────
    def test_zero_price_counter_offer_raises(self) -> None:
        bad = json.dumps(
            {"action": "COUNTER_OFFER", "price_per_kwh": 0.0, "requested_kwh": 50.0}
        )
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(bad)
        assert "COUNTER_OFFER" in exc_info.value.error_detail

    # ── Invalid case 7: price too high ───────────────────────────────────────
    def test_price_exceeds_max_raises(self) -> None:
        bad = json.dumps(
            {"action": "ACCEPT", "price_per_kwh": MAX_PRICE_PER_KWH + 1, "requested_kwh": 50.0}
        )
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(bad)
        assert "price_per_kwh" in exc_info.value.error_detail

    # ── Invalid case 8: zero kwh ──────────────────────────────────────────────
    def test_zero_kwh_raises(self) -> None:
        bad = json.dumps(
            {"action": "ACCEPT", "price_per_kwh": 10.0, "requested_kwh": 0.0}
        )
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(bad)
        assert "requested_kwh" in exc_info.value.error_detail

    def test_error_detail_is_in_raw_output(self) -> None:
        """OfferValidationError.raw_output must equal the input string."""
        raw = "not json"
        with pytest.raises(OfferValidationError) as exc_info:
            validate_offer(raw)
        assert exc_info.value.raw_output == raw

    def test_extra_fields_forbidden(self) -> None:
        bad = json.dumps(
            {
                "action": "ACCEPT",
                "price_per_kwh": 10.0,
                "requested_kwh": 50.0,
                "hidden_field": "exploit",
            }
        )
        with pytest.raises(OfferValidationError):
            validate_offer(bad)


# ─── 2. Fault-injection: partial failure — recovery on retry ─────────────────


class TestPartialFailureWithRetry:
    """
    Mock LLM emits malformed JSON on calls 1 and 2, valid JSON on call 3.
    The session must converge without crashing and fallback_used must be False.
    """

    def test_two_failures_then_success(self) -> None:
        registry = DeficitRegistry()
        llm = _llm_sequence(
            "not json at all",            # attempt 1 — invalid
            '{"action": "broken"',        # attempt 2 — invalid JSON
            VALID_OFFER_JSON,             # attempt 3 — valid
        )
        offer, action, fallback_used, best_q, llm_q = negotiate_with_retry(
            llm_call=llm,
            prompt="Make an offer.",
            agent_id="agent_A",
            negotiation_id="neg_001",
            round_number=1,
            dqn_wrapper=_make_dqn(),
            dqn_state_dict=_dqn_state(),
            registry=registry,
        )
        assert not fallback_used, "Fallback must NOT be used when retry succeeds"
        assert offer is not None, "A valid offer must be returned"
        assert offer.action == "COUNTER_OFFER"
        # No deficit record when retry succeeds
        assert registry.fallback_count() == 0

    def test_one_failure_then_success(self) -> None:
        registry = DeficitRegistry()
        llm = _llm_sequence("bad", VALID_OFFER_JSON)
        offer, _, fallback_used, _, _ = negotiate_with_retry(
            llm_call=llm,
            prompt="Make an offer.",
            agent_id="agent_B",
            negotiation_id="neg_002",
            round_number=2,
            dqn_wrapper=_make_dqn(),
            dqn_state_dict=_dqn_state(),
            registry=registry,
        )
        assert not fallback_used
        assert offer is not None

    def test_error_correction_prompt_contains_error_detail(self) -> None:
        """
        After a failure the retry prompt must contain the error description.
        We capture the prompts the LLM receives to verify this.
        """
        received_prompts: list[str] = []

        def capturing_llm(prompt: str) -> str:
            received_prompts.append(prompt)
            if len(received_prompts) == 1:
                return "bad json {"
            return VALID_OFFER_JSON

        negotiate_with_retry(
            llm_call=capturing_llm,
            prompt="Initial prompt.",
            agent_id="agent_C",
            negotiation_id="neg_003",
            round_number=1,
            dqn_wrapper=_make_dqn(),
            dqn_state_dict=_dqn_state(),
            registry=DeficitRegistry(),
        )
        # Second call is the correction prompt
        assert len(received_prompts) == 2
        correction = received_prompts[1]
        assert "Retry attempt" in correction
        assert "Initial prompt." in correction


# ─── 3. Fault-injection: all retries fail → DQN fallback ─────────────────────


class TestFullFailureWithFallback:
    """
    Mock LLM always returns invalid output.
    The session must NOT crash; DQN fallback action must be used.
    Exactly one ReasoningDeficit must be recorded with fallback_used=True.
    """

    def _run_all_fail(self, agent_id: str = "agent_X", neg_id: str = "neg_999"):
        registry = DeficitRegistry()
        # Always returns malformed JSON
        llm = _llm_sequence(*["bad json"] * (MAX_RETRIES + 5))
        offer, action, fallback_used, best_q, llm_q = negotiate_with_retry(
            llm_call=llm,
            prompt="Make an offer.",
            agent_id=agent_id,
            negotiation_id=neg_id,
            round_number=3,
            dqn_wrapper=_make_dqn(),
            dqn_state_dict=_dqn_state(),
            registry=registry,
        )
        return offer, action, fallback_used, registry

    def test_offer_is_none_on_full_failure(self) -> None:
        offer, _, _, _ = self._run_all_fail()
        assert offer is None, "Offer must be None when all retries fail"

    def test_fallback_used_is_true(self) -> None:
        _, _, fallback_used, _ = self._run_all_fail()
        assert fallback_used is True

    def test_dqn_action_is_valid_negotiation_action(self) -> None:
        from app.agents.dqn_wrapper import NegotiationAction

        _, action, _, _ = self._run_all_fail()
        assert isinstance(action, NegotiationAction)

    def test_session_does_not_raise(self) -> None:
        """Calling negotiate_with_retry must never propagate an exception."""
        try:
            self._run_all_fail()
        except Exception as exc:  # noqa: BLE001
            pytest.fail(f"negotiate_with_retry raised an exception: {exc}")

    def test_exactly_one_deficit_record(self) -> None:
        _, _, _, registry = self._run_all_fail()
        assert registry.total_count() == 1
        assert registry.fallback_count() == 1

    def test_deficit_record_fields(self) -> None:
        _, _, _, registry = self._run_all_fail(agent_id="agent_Y", neg_id="neg_42")
        deficits = registry.all()
        assert len(deficits) == 1
        d = deficits[0]
        assert d.agent_id == "agent_Y"
        assert d.negotiation_id == "neg_42"
        assert d.round == 3
        assert d.fallback_used is True
        assert d.raw_llm_output == "bad json"
        assert len(d.validation_error) > 0
        assert d.id  # uuid4 non-empty

    def test_fallback_rate_is_one_after_one_fallback(self) -> None:
        _, _, _, registry = self._run_all_fail()
        assert registry.fallback_rate() == 1.0

    def test_llm_called_exactly_max_retries_times(self) -> None:
        """The LLM must be called exactly MAX_RETRIES times before giving up."""
        call_count = 0

        def counting_llm(prompt: str) -> str:  # noqa: ARG001
            nonlocal call_count
            call_count += 1
            return "bad json"

        registry = DeficitRegistry()
        negotiate_with_retry(
            llm_call=counting_llm,
            prompt="Make an offer.",
            agent_id="agent_Z",
            negotiation_id="neg_count",
            round_number=1,
            dqn_wrapper=_make_dqn(),
            dqn_state_dict=_dqn_state(),
            registry=registry,
        )
        assert call_count == MAX_RETRIES


# ─── 4. Integration: registry + /metrics counter ──────────────────────────────


class TestMetricsIntegration:
    """
    Confirm that a fallback event increments the /metrics counter and that the
    /metrics endpoint reflects the correct state.
    """

    @pytest.fixture(autouse=True)
    def reset_module_registry(self) -> None:
        """Isolate the module-level registry between tests."""
        from app.negotiate.retry import get_registry
        get_registry().reset()
        yield
        get_registry().reset()

    @pytest.fixture()
    def client(self) -> TestClient:
        from app.main import app
        return TestClient(app)

    def test_fallback_increments_metrics(self, client: TestClient) -> None:
        from app import telemetry
        resp = client.get("/metrics")
        baseline = resp.json()["dqn_fallback_total"]

        telemetry.dqn_fallback_total.inc()
        telemetry.dqn_fallback_total.inc()

        resp = client.get("/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["dqn_fallback_total"] == baseline + 2

    def test_metrics_prometheus_format(self, client: TestClient) -> None:
        resp = client.get("/metrics?format=prometheus")
        assert resp.status_code == 200
        assert "gridnexus_dqn_fallback_total" in resp.text
        assert "gridnexus_llm_invocation_total" in resp.text

    def test_metrics_zero_state(self, client: TestClient) -> None:
        resp = client.get("/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert "dqn_fallback_total" in data
        assert "llm_invocation_total" in data
        assert "fallback_rate" in data


# ─── 5. DeficitRegistry unit tests ────────────────────────────────────────────


class TestDeficitRegistry:
    def test_empty_registry_zero_rate(self) -> None:
        reg = DeficitRegistry()
        assert reg.fallback_rate() == 0.0
        assert reg.total_count() == 0

    def test_reset_clears_all_records(self) -> None:
        from app.negotiate.retry import ReasoningDeficit
        import uuid
        from datetime import datetime, timezone

        reg = DeficitRegistry()
        reg.record(
            ReasoningDeficit(
                id=str(uuid.uuid4()),
                agent_id="a",
                negotiation_id="n",
                round=1,
                raw_llm_output="x",
                validation_error="e",
                fallback_used=True,
                timestamp=datetime.now(timezone.utc),
            )
        )
        assert reg.total_count() == 1
        reg.reset()
        assert reg.total_count() == 0
        assert reg.fallback_rate() == 0.0
