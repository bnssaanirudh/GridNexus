"""tests/test_oracle_boundary.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Static-analysis test: enforces the oracle module boundary.

Acceptance criterion :
  oracle_policy.py MUST NOT import anything from the hidden-field-bearing
  modules app.agents.microgrid_agent or app.agents.secret_field.

We verify this with Python's `ast` module so the check is zero-dependency and
fast — no actual code is executed.
"""

import ast
import textwrap
from pathlib import Path

import pytest


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _collect_imports(source_path: Path) -> list[str]:
    """
    Parse *source_path* and return a flat list of every imported module name.

    Handles:
      - ``import foo.bar``           → ["foo.bar"]
      - ``from foo.bar import baz``  → ["foo.bar"]
    """
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    imported: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imported.append(node.module)

    return imported


REPO_ROOT = Path(__file__).parent.parent  # engine/

# Modules that must NOT be imported by oracle_policy.py (contain hidden fields)
FORBIDDEN_MODULES = {
    "app.agents.microgrid_agent",
    "app.agents.secret_field",
}

# The module under test
ORACLE_POLICY_PATH = REPO_ROOT / "app" / "oracle" / "inference.py"
ANON_STATE_PATH = REPO_ROOT / "app" / "oracle" / "anonymized_state.py"


# ─── Tests ───────────────────────────────────────────────────────────────────


class TestOracleBoundary:
    """Static-analysis enforcement of the oracle information boundary."""

    def test_oracle_policy_does_not_import_forbidden_modules(self) -> None:
        """
        inference.py must not import from microgrid_agent or secret_field.

        These modules carry battery_capacity_kwh and baseline_generation_cost
        — the two fields that the Oracle is forbidden to observe.
        """
        assert ORACLE_POLICY_PATH.exists(), (
            f"inference.py not found at {ORACLE_POLICY_PATH}"
        )
        imported = _collect_imports(ORACLE_POLICY_PATH)

        violations = [m for m in imported if m in FORBIDDEN_MODULES]
        assert not violations, (
            f"inference.py imports forbidden module(s): {violations}\n"
            "The Oracle must only observe AnonymizedGridState — never "
            "per-agent hidden fields."
        )

    def test_anonymized_state_does_not_import_forbidden_modules(self) -> None:
        """
        anonymized_state.py must also not import from the hidden-field modules.
        """
        assert ANON_STATE_PATH.exists(), (
            f"anonymized_state.py not found at {ANON_STATE_PATH}"
        )
        imported = _collect_imports(ANON_STATE_PATH)
        violations = [m for m in imported if m in FORBIDDEN_MODULES]
        assert not violations, (
            f"anonymized_state.py imports forbidden module(s): {violations}"
        )

    def test_oracle_router_does_not_import_forbidden_modules(self) -> None:
        """
        The /oracle/signal router must not import from the hidden-field modules.
        """
        router_path = REPO_ROOT / "app" / "routers" / "oracle.py"
        assert router_path.exists()
        imported = _collect_imports(router_path)
        violations = [m for m in imported if m in FORBIDDEN_MODULES]
        assert not violations, (
            f"routers/oracle.py imports forbidden module(s): {violations}"
        )

    def test_anonymized_state_has_no_hidden_fields(self) -> None:
        """
        AnonymizedGridState must not contain field names that correspond to
        known hidden ledger fields.
        """
        from app.oracle.anonymized_state import AnonymizedGridState

        hidden_field_names = {
            "battery_capacity_kwh",
            "baseline_generation_cost",
            "hiddenbatterycapacity",
            "hiddengenerationcost",
        }
        model_fields = set(AnonymizedGridState.model_fields.keys())
        leak = hidden_field_names & model_fields
        assert not leak, (
            f"AnonymizedGridState contains hidden field(s): {leak}"
        )

    def test_oracle_response_schema_has_no_hidden_fields(self) -> None:
        """
        The OracleSignalResponse Pydantic model must not expose per-agent
        hidden fields in its schema.
        """
        from app.schemas.oracle import OracleSignalResponse

        hidden_field_names = {
            "battery_capacity_kwh",
            "baseline_generation_cost",
            "agent_id",
        }
        schema_fields = set(OracleSignalResponse.model_fields.keys())
        leak = hidden_field_names & schema_fields
        assert not leak, (
            f"OracleSignalResponse exposes hidden field(s): {leak}"
        )
