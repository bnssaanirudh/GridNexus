# GridNexus Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move GridNexus from a prototype with overclaimed evidence to a reproducible research and patent-preparation project.

**Architecture:** Keep the existing engine, broker, and command-center boundaries. Harden the broker/engine integration first, then replace synthetic experiment outputs with CPU-safe reproducible runners, then implement the real CS-SafeMAPPO research core.

**Tech Stack:** Python/FastAPI/PyTorch/Pytest, TypeScript/Node/Prisma/BullMQ/Vitest, Markdown research docs, CSV/JSONL evidence ledgers.

**Spec:** `docs/research/project_completion_plan.md`

## Global Constraints

- The paper title remains unchanged.
- Do not claim publication, patentability, or Q1 acceptance as guaranteed.
- Do not label synthetic or placeholder experiment outputs as supported evidence.
- Prefer CPU-safe experiments and smoke fixtures before any GPU-scale training.
- Every quantitative claim must trace to script, config, seed, raw result file, and commit hash.

---

### Task 1: Integration Safety Fixes

**Files:**
- Modify: `engine/app/routers/settlement.py`
- Modify: `engine/tests/test_settlement.py`
- Create: `broker/src/services/jointGatePayload.ts`
- Modify: `broker/src/services/jointGate.ts`
- Create: `broker/tests/joint-gate-payload.test.ts`

**Interfaces:**
- Produces: `buildJointGatePayload(input: BuildJointGatePayloadInput): JointGatePayload`
- Produces: settlement `/settlement/propose` returns HTTP 400 when seller or buyer IDs are not grid node IDs.

- [x] Write the failing settlement test for unknown grid-node mapping.
- [x] Run the settlement test and confirm it fails by falling through to dispatch verification.
- [x] Write the failing broker payload test for explicit buyer value.
- [x] Run the broker payload test and confirm it fails because the builder is absent.
- [x] Implement strict settlement mapping.
- [x] Implement `buildJointGatePayload`.
- [x] Wire `JointGate` to the shared queue and payload builder.
- [x] Rerun focused broker and engine tests.

### Task 2: Claim Hygiene

**Files:**
- Modify: `research/claims/claim_evidence.csv`
- Modify: `docs/research/final_claim_scope.md`
- Create: `docs/research/project_completion_plan.md`

**Interfaces:**
- Produces: evidence labels that distinguish supported code-level claims from unverified synthetic experiment claims.

- [x] Mark current quantitative experiment claims as `UNVERIFIED_SYNTHETIC`.
- [x] Replace broad supported claims with code-level supported claims and qualified research claims.
- [x] Preserve the fixed paper title in the project completion plan.

### Task 3: CPU Reproducibility Gate

**Files:**
- Modify: `engine/gridnexus_cli.py`
- Modify: `engine/scripts/experiments/run_ablation_study.py`
- Modify: `engine/scripts/experiments/run_scalability_sweep.py`
- Create: `engine/scripts/experiments/evidence_manifest.py`
- Create: `engine/tests/test_reproducibility_cli.py`

**Interfaces:**
- Produces: CLI exits nonzero when requested tables/figures depend on missing or synthetic evidence.
- Produces: manifest entries with `script`, `config`, `seed`, `commit_hash`, `raw_result_file`, and `synthetic`.

- [x] Write a failing CLI test showing `--tables` rejects synthetic or missing evidence.
- [x] Add the evidence manifest reader.
- [x] Make table and figure generation require real manifest-backed inputs.
- [x] Rerun CLI tests with coverage disabled for targeted checks.

### Task 4: CS-SafeMAPPO Research Core

**Files:**
- Create: `engine/app/rl/cs_safe_mappo.py`
- Modify: `engine/app/rl/gridnexus_env.py`
- Modify: `engine/scripts/experiments/run_marl_benchmarks.py`
- Create: `engine/tests/test_cs_safe_mappo.py`

**Interfaces:**
- Produces: `CSSafeMAPPOTrainer` with explicit physical and coalition constraint signals.
- Produces: benchmark runner that cannot call SafeMAPPO “CS-SafeMAPPO” unless the CS constraint path is active.

- [ ] Write a failing test that rejects aliasing SafeMAPPO as CS-SafeMAPPO.
- [ ] Add constraint metrics to the environment step output.
- [ ] Implement the CS penalty path in the trainer.
- [ ] Update benchmark configs and raw output schema.
- [ ] Run smoke training on CPU.

### Task 5: Patent and Submission Package

**Files:**
- Modify: `docs/patent/invention_disclosure.md`
- Modify: `docs/patent/prior_art_search.md`
- Modify: `docs/paper/manuscript.md`
- Create: `docs/research/submission_targets.md`

**Interfaces:**
- Produces: a narrow patent-review package and two submission routes: conference-short and journal-expanded.

- [ ] Rewrite invention disclosure around state-bound certificates, corrective dispatch, and invalidation.
- [ ] Expand prior-art matrix with claim-by-claim distinctions.
- [ ] Replace manuscript placeholders with evidence-backed claims only.
- [ ] Add target venue table with fit, evidence needed, and page constraints.
