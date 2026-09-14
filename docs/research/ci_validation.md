# CI Validation Status

**Branch:** `research/q1-cs-safemappo`  
**Last Updated:** 2026-09-14  
**Status:** 🔶 PARTIAL — Core fixes applied; full green target in progress

---

## Engine Test Suite

### Before Batch A Fixes

```
39 failed, 186 passed, 27 warnings
```

Root causes identified:
| Issue | Root Cause | Fix Applied |
|-------|-----------|-------------|
| `StabilityResult(is_stable=True)` TypeError | `is_stable` was field removed from dataclass, only used in Schema/tests | Added `@property is_stable` + fixed all constructors |
| Route tests — `topology_revisions` table missing | Tests called real SQLite DB without mocking | Added `@patch(build_topology_from_db)` to all route tests |
| `StabilityVerifyResponse` missing `isStable` field | Router passed `isStable=` but schema had only `status` | Added `isStable: bool` field to schema |
| `oracle/training.py` used `StabilityResult(is_stable=False)` | Old constructor | Fixed to `status="BLOCKING_COALITION_FOUND"` |

### After Batch A Fixes (Target)

```
Target: 0 failed in engine/tests/test_reward_fn.py
Target: 0 failed in engine/tests/test_stability_solver.py
Target: 0 failed in engine/tests/test_participant_mapping.py (NEW)
Target: 0 failed in engine/tests/test_provenance.py (NEW)
```

### Remaining Known Failures

| Test File | Failure | Category | Fix Required |
|-----------|---------|----------|-------------|
| `test_routes.py::test_create_agent_valid` | `sqlalchemy.exc.OperationalError` — missing table | DB | Requires proper test DB migration to be run before tests |
| `test_routes.py::test_stability_valid` | Same DB issue | DB | Same |

**P2 issue** — these are in `test_routes.py` which requires PostgreSQL or a properly migrated SQLite fixture. Not a scientific integrity blocker.

---

## Broker Tests

**Status:** Cannot run in this environment (requires PostgreSQL + Redis).

Known requirement: `broker/prisma/schema.prisma` must be migrated before tests.

---

## Command Center Tests

**Status:** Not run. Requires `npm test` in `command-center/`.

---

## Coverage Target

Current engine coverage on patched modules: **~77%** (below 85% threshold).

Coverage gap locations:
- `engine/app/graph/planar_graph.py`: 64% — missing edge cases in `permissible_coalitions`
- `engine/app/stability/stability_solver.py`: 84% — missing error paths

**To fix:** New tests in `test_participant_mapping.py`, `test_provenance.py`, and `test_coalition_metrics.py` will add coverage.

---

## Scientific CI Requirements (Beyond Green Tests)

| Requirement | Status | Notes |
|------------|--------|-------|
| No hardcoded experiment outcomes | ✅ Fixed | `patent_technical_effect.py` rewrote |
| Every stability result uses enum status | ✅ Fixed | `StabilityResult.status` everywhere |
| `is_stable` property maps correctly | ✅ Fixed | Property added |
| Participant→DER→Bus binding exists | ✅ Added | `participant_mapping.py` |
| Experiment provenance system | ✅ Added | `provenance.py` |
| Coalition excess metric | ✅ Added | `coalition_metrics.py` |
| IEEE benchmark networks | ❌ TODO | Batch B |
| MARL V2 environment | ❌ TODO | Batch B |
| CS-SafeMAPPO | ❌ TODO | Batch B |
| Claim-evidence ledger | ❌ TODO | Batch D |
