# GridNexus Project Completion Plan

**Fixed title:** GridNexus: Farsighted Coalitional Bargaining and Multi-Agent Reinforcement Learning for Privacy-Preserving Virtual Power Plants

**Goal:** Make the repository honest, reproducible, patent-package ready, and credible enough to develop into a Q1 journal or conference submission without GPU-only experiments.

## Phase 1: Evidence Hygiene and Integration Hardening

Status: completed for the first hardening pass.

Deliverables:
- Replace unsupported `SUPPORTED` labels with explicit unverified status until raw results exist.
- Remove silent physical-grid fallbacks from settlement.
- Require explicit buyer willingness-to-pay instead of deriving buyer value from generation cost.
- Fix queue naming so broker tests can import JointGate without BullMQ rejecting colon-containing queue names.
- Add focused regression tests for these defects.

Exit criteria:
- Focused broker and engine regression tests pass.
- `docs/research/final_claim_scope.md` no longer overclaims CS-SafeMAPPO, scalability, adversarial robustness, HIL, or patentability.

## Phase 2: CPU Reproducibility

Status: started. The first gate is implemented: publication tables and figures require a manifest and reject synthetic evidence.

Deliverables:
- Replace synthetic ablation and scalability scripts with CPU-safe runners that emit raw per-seed JSONL plus summarized CSV.
- Add committed experiment configs for IEEE-33 and smaller smoke fixtures.
- Make the CLI fail when a requested result file is missing or synthetic.
- Generate tables and figures only from real CSV/JSONL inputs.

Exit criteria:
- A clean checkout can run quick experiments on CPU in under 30 minutes.
- Every table row links to a script, config, seed, commit hash, and raw result file.

## Phase 3: Research Core

Status: pending.

Deliverables:
- Implement a real CS-SafeMAPPO class that couples MAPPO loss with physical-violation and coalition-instability penalties from the environment.
- Replace oracle-scalar environment rewards with calls into the grid feasibility and least-core/stability modules.
- Add baselines: greedy market clearing, IPPO, MAPPO, SafeMAPPO, and optimization-based clearing.
- Add adversarial scenarios with nonzero settled trades and explicit threat models for Sybil, collusion, and misreporting.

Exit criteria:
- The repository can produce multi-seed comparisons with confidence intervals.
- The manuscript only reports claims backed by the claim-evidence ledger.

## Phase 4: Patent Package

Status: pending.

Deliverables:
- Narrow invention disclosure around deterministic physical-feasibility certificates, state-bound settlement correction, and certificate invalidation/re-dispatch.
- Move broad AI-marketplace language out of the patent core.
- Add an inventor-review checklist and prior-art matrix.

Exit criteria:
- A patent attorney can review concrete claims, diagrams, implementation evidence, and prior-art distinctions without relying on marketing language.

## Phase 5: Submission Package

Status: pending.

Deliverables:
- Create one conference-short version and one journal-expanded version from the same evidence ledger.
- Add limitations, reproducibility appendix, and ethics/privacy discussion.
- Prepare target list for energy systems plus AI-for-energy venues.

Exit criteria:
- The conference version has a defensible demo and short-paper contribution.
- The journal version has enough experimental depth for Q1 review.
