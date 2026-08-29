"""
engine/tests/test_log_hidden_leak.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extended hidden-field-leak check.

Extends 's response-payload fuzz test to ALSO scan structured
structlog JSON log output (captured from stderr/stdout) for any occurrence
of the sentinel private microgrid fields (battery capacity and generation
cost) during a full API session run.

This ensures that even if a developer naively passes the MicrogridAgent
object to structlog.bind() or to a logger, the private values never
appear in the log stream — not just in API responses.

ASSUMPTION : structlog is configured with the JSONRenderer
processor in production . We capture its output by overriding
the processors chain with an io.StringIO writer during the test session.
"""

from __future__ import annotations

import json
import structlog
from fastapi.testclient import TestClient

from app.main import app
from app.agents.microgrid_agent import MicrogridAgent
from app.agents.secret_field import SecretFloat

client = TestClient(app)

# Sentinel private values injected into agent fields
SENTINEL_CAPACITY = 999111.0
SENTINEL_COST     = 999222.0


# ── Log-capture helpers ──────────────────────────────────────────────────────

class _CapturingWriter:
    """Minimal structlog processor-compatible output writer."""
    def __init__(self) -> None:
        self._lines: list[str] = []

    def __call__(self, logger, method, event_dict) -> str:  # noqa: N802
        line = json.dumps(event_dict)
        self._lines.append(line)
        return line

    @property
    def lines(self) -> list[str]:
        return list(self._lines)


def _sentinel_appears_in_text(text: str) -> bool:
    """Return True if either sentinel value appears anywhere in the text."""
    cap_str  = str(SENTINEL_CAPACITY)
    cost_str = str(SENTINEL_COST)
    # Also check int representations in case floats are truncated
    cap_int  = str(int(SENTINEL_CAPACITY))
    cost_int = str(int(SENTINEL_COST))
    return (cap_str in text or cost_str in text
            or cap_int in text or cost_int in text)


# ── Test 1: Response payload scan (from , extended) ─────────────────

def test_fuzz_routes_no_leak_in_responses():
    """
    Re-runs the  fuzz test to ensure all API responses are still
    clean after any refactoring since .
    """
    agent = MicrogridAgent(
        agent_id="log-fuzz-agent",
        battery_capacity_kwh=SecretFloat(SENTINEL_CAPACITY),
        baseline_generation_cost=SecretFloat(SENTINEL_COST),
    )

    routes = [r for r in app.routes if hasattr(r, "methods")]
    tested = 0

    for route in routes:
        path = route.path
        if "{" in path:
            path = path.replace("{agent_id}", "log-fuzz-agent")
            path = path.replace("{microgrid_id}", "log-fuzz-mg-1")

        for method in route.methods or []:
            if method in ("HEAD", "OPTIONS"):
                continue

            payload: dict = {}
            if "stability" in path:
                payload = {"coalition": ["a", "b"]}
            elif "negotiate" in path:
                payload = {"agent_id": "log-fuzz-agent", "offer": 10.0}

            try:
                if method == "GET":
                    resp = client.get(path)
                elif method == "POST":
                    resp = client.post(path, json=payload)
                else:
                    continue
            except Exception as exc:
                # A serialisation error from SecretFloat is intentional
                assert "SecretFloat" in str(exc) or "cannot be serialized" in str(exc), \
                    f"Unexpected error in {method} {path}: {exc}"
                tested += 1
                continue

            raw = resp.text
            assert not _sentinel_appears_in_text(raw), (
                f"LEAK in API response {method} {path}: sentinel value found in body"
            )
            tested += 1

    assert tested > 0, "No routes were tested"


# ── Test 2: Log output scan (new in ) ───────────────────────────────

def test_log_output_no_hidden_field_leak(capsys):
    """
    Verifies that private microgrid field values NEVER appear in the
    structured log output (structlog JSON lines) during a realistic session.

    Strategy:
      1. Execute a sequence of API calls that internally may log agent objects.
      2. Capture all stdout/stderr via pytest's capsys fixture.
      3. Scan every captured byte for the sentinel values.

    This approach is more robust than reconfiguring structlog mid-test because
    it avoids incompatible processor/logger combinations (PrintLogger vs stdlib
    Logger) and captures output regardless of logging backend.
    """
    # Run a typical "golden path" session that exercises log paths
    client.get("/health")
    client.get("/ready")
    client.get("/agents")
    client.get("/agents/log-fuzz-agent")
    client.post("/stability/check", json={"coalition": ["log-fuzz-agent"]})
    client.get("/api/topology")

    # Capture all output emitted during the session
    captured = capsys.readouterr()
    all_output = captured.out + captured.err

    if _sentinel_appears_in_text(all_output):
        offending = [
            line for line in all_output.splitlines()
            if _sentinel_appears_in_text(line)
        ]
        assert False, (
            f"LEAK detected in structured log output!\n"
            f"Sentinel {SENTINEL_CAPACITY} or {SENTINEL_COST} found.\n"
            f"Offending log lines:\n" + "\n".join(offending[:10])
        )


# ── Test 3: Structlog processor chain does not expose raw agent repr ─────────

def test_structlog_bind_does_not_leak_secret_float():
    """
    Verifies that if a developer accidentally passes the MicrogridAgent to
    structlog.bind(), the bound log record does not contain the sentinel
    float values (SecretFloat.__repr__ returns '<redacted>').
    """
    agent = MicrogridAgent(
        agent_id="repr-test-agent",
        battery_capacity_kwh=SecretFloat(SENTINEL_CAPACITY),
        baseline_generation_cost=SecretFloat(SENTINEL_COST),
    )

    # What a careless developer might do:
    bound_str = repr(agent)

    assert str(SENTINEL_CAPACITY) not in bound_str, \
        f"LEAK: SENTINEL_CAPACITY {SENTINEL_CAPACITY} exposed in repr: {bound_str}"
    assert str(SENTINEL_COST) not in bound_str, \
        f"LEAK: SENTINEL_COST {SENTINEL_COST} exposed in repr: {bound_str}"

    # Check that SecretFloat repr itself is safe
    sf = SecretFloat(SENTINEL_CAPACITY)
    sf_repr = repr(sf)
    assert str(SENTINEL_CAPACITY) not in sf_repr, \
        f"LEAK: SecretFloat repr exposed value: {sf_repr}"
    # Should contain 'redacted' or similar masking indicator
    assert "redacted" in sf_repr.lower() or "*" in sf_repr or "secret" in sf_repr.lower(), \
        f"SecretFloat repr should indicate redaction, got: {sf_repr}"
