# GridNexus — Current State Audit
**Generated:** 2026-09-14 | **Baseline Branch:** `v1.0-research` | **Commit:** `e2447d0`

---

## Component Status Matrix

| Component | Implemented | Tested | Validated | Claim-safe | Problems | Priority |
|-----------|:-----------:|:------:|:---------:|:----------:|----------|----------|
| **DER-Owner Registration/Onboarding** | ✅ | ✅ | ✅ | ✅ | None | — |
| **Admin Onboarding/Governance** | ✅ | ✅ | ✅ | ✅ | None | — |
| **Autonomous Agent Runtime (WebSocket)** | ✅ | ✅ | ✅ | ✅ | None | — |
| **Tenant Isolation / RBAC** | ✅ | ✅ | ✅ | ✅ | None | — |
| **Audit Ledger (SHA-256 hash-chain)** | ✅ | ✅ | ✅ | ✅ | None | — |
| **AES-256-GCM Encryption** | ✅ | ✅ | ⚠️ | ⚠️ | Tests prove decryption exists but not that encrypted values correctly influence engine computations | P1 |
| **Stability Solver (Least-Core LP)** | ✅ | ✅ | ⚠️ | ⚠️ | `StabilityResult` lacks `.is_stable` property — breaks 20+ tests | **P0** |
| **Stability Status Enum** | ✅ | ❌ | ❌ | ❌ | Tests still reference `result.is_stable` (bool) not `result.status` (str) | **P0** |
| **Separation Oracle** | ✅ | ✅ | ⚠️ | ⚠️ | Large-N heuristic is correctly labeled; exact-vs-heuristic boundary correctly defined | P1 |
| **AC Power Flow (pandapower)** | ✅ | ⚠️ | ⚠️ | ⚠️ | Implementation exists; integration into JointGate not verified | P1 |
| **DC Power Flow** | ✅ | ✅ | ✅ | ✅ | None | — |
| **SOCP Power Flow** | ✅ | ⚠️ | ❌ | ❌ | cvxpy optional dep; no integration tests | P2 |
| **Participant→DER→Bus Binding** | ❌ | ❌ | ❌ | ❌ | No `ParticipantDERBusMapping` — trades use equal-dispatch shortcuts | **P0** |
| **Patent Technical Effect Experiment** | ⚠️ | ❌ | ❌ | ❌ | Contains `gridnexus_accepted = False` shortcut; still partially fabricated | **P0** |
| **MARL Environment V1 (GridNexusEnv)** | ✅ | ✅ | ⚠️ | ❌ | Coalition membership doesn't genuinely change economic outcomes; JOIN/LEAVE trivial | **P0** |
| **MARL Environment V2** | ❌ | ❌ | ❌ | ❌ | Not implemented; required for Q1 | P0 |
| **IPPO Trainer** | ✅ | ✅ | ⚠️ | ⚠️ | From-scratch PyTorch loop; no trained checkpoints beyond test smoke | P1 |
| **MAPPO Trainer** | ✅ | ✅ | ⚠️ | ⚠️ | Centralised critic implemented; no trained checkpoints; uses V1 env | P1 |
| **SafeMAPPO** | ❌ | ❌ | ❌ | ❌ | Not implemented | P0 |
| **CS-SafeMAPPO** | ❌ | ❌ | ❌ | ❌ | Not implemented — is the main research contribution | **P0** |
| **Corrective Settlement Controller** | ❌ | ❌ | ❌ | ❌ | Patent-specific; not implemented | P0 (patent) |
| **Dual Certificate** | ❌ | ❌ | ❌ | ❌ | Patent-specific; not implemented | P0 (patent) |
| **Least-Core Payment Mechanism** | ✅ | ✅ | ✅ | ✅ | Exists; allocate_shapley capped at N≤10 with explicit warning | — |
| **Jain/Gini/Nash Metrics** | ⚠️ | ❌ | ❌ | ❌ | Script exists but not wired to any experiment output | P1 |
| **Experiment Provenance System** | ❌ | ❌ | ❌ | ❌ | No manifest generator; no unique run dirs | P1 |
| **IEEE Benchmark Networks (33/69/123-bus)** | ❌ | ❌ | ❌ | ❌ | Not implemented | P1 |
| **Scenario Generator** | ❌ | ❌ | ❌ | ❌ | Not implemented | P1 |
| **Claim-Evidence Ledger (CSV)** | ❌ | ❌ | ❌ | ❌ | No `research/claims/claim_evidence.csv` | P1 |
| **Statistical Analysis Pipeline** | ❌ | ❌ | ❌ | ❌ | Not implemented | P2 |
| **Reproducibility CLI** | ❌ | ❌ | ❌ | ❌ | `reproduce_research.bat` exists but makes unsupported claims | P1 |
| **CI (GitHub Actions)** | ⚠️ | — | — | — | Engine tests fail due to is_stable breakage; broker tests need PostgreSQL/Redis | P0 |
| **LLM Bargaining / DQN Wrapper** | ✅ | ✅ | ✅ | ✅ | Well-tested with fallback metrics | — |
| **RAG Oracle Pipeline** | ✅ | ✅ | ✅ | ✅ | Implemented and tested | — |
| **QRE (Quantal Response)** | ✅ | ✅ | ✅ | ✅ | Implemented; tested | — |

---

## Key Problem Areas

### P0 — Scientific Validity Blockers (MUST FIX FIRST)

#### P0-1: `StabilityResult.is_stable` property missing
**Impact:** 20+ tests fail immediately. `StabilityResult` was refactored to use `status: str` enum values, but no backward-compatible `.is_stable` property was added. All existing tests and callers use `result.is_stable`.
**Fix:** Add `@property def is_stable(self) -> bool: return self.status == "EXACT_STABLE"` to `StabilityResult` dataclass.

#### P0-2: Participant→DER→Bus binding absent
**Impact:** All trade proposals use equal power dispatch shortcuts. Physical grid verification cannot be meaningful without mapping `participant_id → DER_id → bus_id → P_injection`.
**Fix:** Implement `ParticipantDERBusBinding` dataclass; replace shortcuts in `jointGate.ts` and `patent_technical_effect.py`.

#### P0-3: Patent technical effect experiment still partially fabricated
**Impact:** Line 68 in `patent_technical_effect.py`: `gridnexus_accepted = False` when `naive_violation = True` is a shortcut that does not actually run GridNexus verification on each trade independently.
**Fix:** Remove the shortcut. Run actual grid verification for each condition independently.

#### P0-4: MARL Environment V1 — coalition formation doesn't change economics
**Impact:** `JOIN` action in V1 env doesn't meaningfully change allocated value or market dynamics. Research claim about coalition stability requires V2 environment where coalition membership propagates through clearing/allocation.
**Fix:** Implement `GridNexusMarketEnvV2`.

#### P0-5: SafeMAPPO and CS-SafeMAPPO not implemented
**Impact:** The principal contribution of the Q1 paper is CS-SafeMAPPO. Nothing exists.
**Fix:** Implement SafeMAPPO (Lagrangian constrained RL) then CS-SafeMAPPO (adds coalition-instability constraint).

---

### P1 — Scientific Quality Issues

#### P1-1: Encrypted values not proven to influence computation
Tests confirm `crypto.ts` decrypts but no integration test verifies the decrypted cost flows through to coalition value calculation and produces a different result than a default.

#### P1-2: IPPO/MAPPO checkpoints not trained
Trainers exist and are architecturally correct, but no trained checkpoint files exist for the final benchmark seeds.

#### P1-3: No experiment provenance system
No manifest generator. Raw results can be overwritten silently.

#### P1-4: No IEEE standard benchmark networks
The 33-bus, 69-bus, 123-bus networks required for reproducible P2P energy trading experiments are absent.

#### P1-5: Claim-evidence ledger absent
No `research/claims/claim_evidence.csv` to trace quantitative claims to raw evidence files.

---

### P2 — Documentation & Polish

#### P2-1: FedAvg / LSTM references partially cleaned but UI workflow description still confusing
The `WorkflowPage.tsx` no longer shows FEDAVG/LSTM as active models but description text still uses "FedMAPPO" in one place.

#### P2-2: `reproduce_research.bat` makes unsupported success claims
The script does not programmatically verify each artifact before printing success.

---

## Prioritized Remediation List

### Immediate (P0) — Batch A

1. **Add `is_stable` property to `StabilityResult`** to fix all test failures
2. **Implement `ParticipantDERBusBinding`** in `engine/app/grid/participant_mapping.py`
3. **Rewrite `patent_technical_effect.py`** to route every trade through real verification
4. **Create research branch** `research/q1-cs-safemappo` and document branch strategy

### Short-term (P1) — Batch B

5. Implement `GridNexusMarketEnvV2`
6. Implement `SafeMAPPO` (Lagrangian RL)
7. Implement `CS-SafeMAPPO`
8. Create IEEE 33-bus / 69-bus benchmark networks
9. Implement experiment provenance manifest generator
10. Create `research/claims/claim_evidence.csv`
11. Train IPPO/MAPPO/SafeMAPPO checkpoints on V2 env

### Medium-term (P2) — Batches D/E

12. Factorial scenario generator
13. Adversarial sweep experiments (Sybil, collusion, misreporting)
14. Statistical analysis pipeline
15. Publication-quality figure generation scripts
16. Draft Q1 manuscript from verified evidence

---

## Engineering Baseline Recommendation

**Branch:** `v1.0-research`  
**Commit:** `e2447d0`  
**Rationale:** Most technically complete. Contains correct stability semantics (status enum), AES-256-GCM crypto, MAPPO/IPPO from-scratch PyTorch trainers, SOCP+AC power flow, and full broker integration. The P0 `is_stable` property gap must be fixed before any tests run.
