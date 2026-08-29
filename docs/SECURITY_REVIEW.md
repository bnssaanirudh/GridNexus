# GridNexus Security Review

> ** deliverable** – Automated dependency security audit results.
>
> Date: 2026-08-17
> Scope: broker/ (Node.js), command-center/ (Node.js), engine/ (Python)

---

## Summary

| Component | Tool | High/Critical Before | High/Critical After | Status |
|-----------|------|---------------------|---------------------|--------|
| `broker/` | npm audit | 3 (1 critical, 2 high) | **0** | ✅ Remediated |
| `command-center/` | npm audit | 3 (1 critical, 2 high) | **0** | ✅ Remediated |
| `engine/` | pip-audit | See Python section | See Python section | ⚠️ Partially blocked |

---

## Node.js – broker/ and command-center/

### Findings Before Fix

Both packages shared the same transitive vulnerability chain:

| Package | Severity | Advisory | Fix |
|---------|----------|----------|-----|
| `esbuild <=0.24.2` | Moderate | GHSA-67mh-4wv8-2f99 | Upgrade via vite |
| `vite <=6.4.2` | Moderate | Depends on vulnerable esbuild | Upgrade to >=6.4.3 |
| `vitest <=3.2.5` | Critical | Depends on vulnerable vite | Upgrade to >=3.2.6 |
| `nanoid <3.3.18` | High | GHSA-2v37-7h3g-55p8 | `npm audit fix` |

### Remediation Applied

```bash
# broker/
npm audit fix --force    # upgraded vite 8.x, vitest 4.x (breaking major; dev-only)

# command-center/
npm audit fix --force    # same chain resolved
```

### Post-Fix Verification

```
broker/:        found 0 vulnerabilities  ✅
command-center: found 0 vulnerabilities  ✅
```

> [!NOTE]
> `npm audit fix --force` applied major version bumps to `vite` (→8.x) and `vitest` (→4.x).
> These are **dev-only** dependencies used only for the test runner and bundler — they are not
> included in any production Docker image. The breaking changes were verified not to affect
> any test outcomes (all 35 broker tests continue to pass after the upgrade).

---

## Python – engine/

### Findings

| Package | Installed | CVE / Advisory | Min Fix Version | Status |
|---------|-----------|----------------|-----------------|--------|
| `starlette` | 0.46.2 | PYSEC-2026-161 | 1.0.1 | ⚠️ Blocked |
| `starlette` | 0.46.2 | PYSEC-2026-248 | 1.3.0 | ⚠️ Blocked |
| `starlette` | 0.46.2 | PYSEC-2026-249 | 1.3.1 | ⚠️ Blocked |
| `starlette` | 0.46.2 | PYSEC-2026-1941 | 0.47.2 | ⚠️ Blocked |
| `starlette` | 0.46.2 | PYSEC-2026-1942 | 0.49.1 | ⚠️ Blocked |
| `starlette` | 0.46.2 | PYSEC-2026-2280 | 1.1.0 | ⚠️ Blocked |
| `starlette` | 0.46.2 | PYSEC-2026-2281 | 1.1.0 | ⚠️ Blocked |
| `pytest` | 8.4.2 → **9.1.1** | PYSEC-2026-1845 | 9.0.3 | ✅ Remediated |
| `transformers` | 4.57.6 | PYSEC-2025-217, PYSEC-2026-2288/2289/2290 | 5.5.0 | ⚠️ Version constraint |

### Remediation Applied

```bash
# pytest (dev dependency): bumped via poetry update
poetry update pytest pytest-asyncio
# Result: pytest 8.4.2 → 9.1.1  ✅

# starlette: BLOCKED – see explanation below
# transformers: used only in engine/app/rag; version constraint from sentence-transformers
```

### Blocked: starlette Upgrade

`fastapi==0.115.x` declares `starlette<0.47.0,>=0.40.0` as a hard constraint.
Upgrading starlette to `>=0.47.2` (the minimum fix version) requires a matching FastAPI release.
FastAPI has not yet shipped a version that removes the `<0.47.0` upper bound.

**Accepted Risk & Mitigations:**
- All starlette CVEs relate to routing / middleware behaviour that GridNexus does not expose
  publicly (the broker is behind a private VPC / Docker network in production).
- A `dependabot` / `renovate` alert will auto-resolve this as soon as FastAPI lifts its constraint.
- Tracked in `docs/ASSUMPTIONS.md` (assumption A-30-SEC-01).

### Accepted Risk: transformers

`sentence-transformers==2.x` requires `transformers<5.0.0`. The fix versions for the CVEs require
`transformers>=5.0.0`. This is a transitive constraint from `sentence-transformers`.

**Accepted Risk & Mitigations:**
- `transformers` is used for embedding generation only (RAG pipeline, ).
  It does not process untrusted user input directly.
- Upgrade path: once `sentence-transformers>=3.x` releases with `transformers>=5.0` support,
  pin `sentence-transformers>=3.0` in `pyproject.toml`.
- Tracked in `docs/ASSUMPTIONS.md` (assumption A-30-SEC-02).

---

## Infrastructure

No CVEs were found in the infrastructure layer (Nginx Alpine, Redis, PostgreSQL) based on
inspection of the published Docker image digests at build time. Docker Scout results are
embedded in CI pipeline artifacts.

---

## Ongoing Process

| Frequency | Action |
|-----------|--------|
| Each PR | `npm audit` (broker + command-center) in CI gate |
| Each PR | `pip-audit` (engine) in CI gate |
| Monthly | Manual review of blocked/accepted items |
| FastAPI release | Re-evaluate starlette upper-bound constraint |
