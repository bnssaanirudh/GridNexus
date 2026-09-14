# GridNexus — Branch Strategy

**Document status:** ACTIVE  
**Base commit:** `e2447d0` (v1.0-research)  
**Created:** 2026-09-14

---

## Branches

### Public Research Branch

```
research/q1-cs-safemappo
```

**Purpose:** All public, reproducible Q1-journal research work.  
**Base:** `v1.0-research` @ `e2447d0`  
**Push policy:** All commits may be pushed to `origin`. This branch is public.  
**Contents:**
- MARL environment V2 (`GridNexusMarketEnvV2`)
- SafeMAPPO, CS-SafeMAPPO implementations
- IEEE benchmark networks (33/69/123-bus)
- Adversarial benchmark experiments
- Statistical analysis pipeline
- Publication figures and tables
- Claim-evidence ledger

### Private Patent Branch (LOCAL ONLY — DO NOT PUSH)

```
patent/dual-certificate-corrective-settlement
```

**Purpose:** Confidential, new patent-specific components NOT previously disclosed.  
**Base:** `research/q1-cs-safemappo` (at a stable checkpoint)  
**Push policy:** ❌ NEVER push to any public remote without explicit inventor authorization.  
**Contents (Prompts 19–23, 35–37, 48):**
- Corrective transaction projection
- State-bound dual certificates
- Topology-change certificate invalidation
- Closed-loop physical redispatch
- Post-dispatch telemetry rollback
- Technical-effect patent experiments
- Invention disclosure document

---

## Merge Policy

| From | To | Allowed | Condition |
|------|----|---------|-----------|
| `research/q1-cs-safemappo` | `v1.0-research` | ✅ | After paper acceptance; PR required |
| `patent/...` | Any public branch | ❌ | Never without filing decision |
| `v1.0-research` | `main` | ✅ | After full release gate passes |

---

## Experiment Tagging Policy

- Every paper-final experiment run must be tagged: `exp/<name>-v<N>-<YYYYMMDD>`
- Tags are annotated: `git tag -a exp/ablation-v1-20261001 -m "Final ablation seed 0-19"`
- Tags on `research/q1-cs-safemappo` may be pushed publicly.
- Tags on `patent/...` must remain local.

## Release Tagging Policy

- `v1.0-research` — current baseline (honesty overhaul)  
- `v1.1-q1-candidate` — after all Batch A+B+D experiments complete and readiness gate passes  
- `v1.0-patent` — LOCAL TAG ONLY on patent branch after filing decision

---

## Verification

Working tree must be clean before starting Batch B implementation:

```bash
git status             # should show nothing to commit
git log --oneline -3   # should show expected commits
```
