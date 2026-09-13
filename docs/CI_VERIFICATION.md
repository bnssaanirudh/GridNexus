# CI Verification Report

## Commands Executed

### Engine
- `poetry install --with dev --no-root`
- `poetry run pytest -v`
- `poetry run pytest tests/adversarial/ -v --no-cov`

### Command Center (Frontend)
- `npm ci`
- `npm run lint`
- `npm install --save-dev @testing-library/dom` (Resolved missing module error)
- `npm test`
- `npm run build`

## Test Results

### Passed Test Counts
- **Engine Unit Tests:** 213 tests passed
- **Engine Adversarial Tests:** 3 tests passed
- **Command Center Tests:** 70 tests passed (across 10 suites)

### Failed / Skipped Test Counts
- **Failed:** 0
- **Skipped:** 0

## Coverage
- **Engine:** 92.47% (exceeds the 85% requirement)

## Unresolved Environmental Limitations
- **Docker Daemon Missing locally**: The local environment does not have a running Docker daemon accessible (failed to spin up `postgres` and `redis` via `docker compose up postgres redis -d`). 
- As a result, the following jobs could not be verified locally:
  - Docker Compose Smoke Test
  - Broker Node.js integration tests (`broker/tests/integration`)
  - Golden-Path E2E tests
  - Tenant Isolation & Security Audit tests
These require a running Postgres vector DB and Redis cache to execute correctly, which CI handles by spinning up service containers.
