# GridNexus outcome-readiness runbook

## Implemented operational path

The system now has a real persisted path from the engine and datasets through the broker to the command center:

1. The engine loads the OPSD household CSV and India spectral TMY HDF5 inputs through validated adapters.
2. Oracle, negotiation, coalition, grid-physics, settlement, audit, DER, topology, analytics, and metrics routes expose persisted state.
3. Agent actions are authenticated, validated, bound to the socket identity, physics-gated, and mapped from agents to microgrids before settlement.
4. Dashboard clients connect as read-only WebSocket observers and cannot initiate or alter trades.
5. The command center uses authenticated, timeout-controlled API requests and normalizes response contracts.
6. Production Nginx provides same-origin API, engine, and WebSocket routing.
7. Liveness and readiness are separate. Readiness fails when PostgreSQL, Redis, or the engine is unavailable.

Simulation mode remains explicit and visibly labelled. It may use deterministic fallbacks when dependencies are unavailable. Production mode fails closed.

## Local outcome/demo startup

Prerequisites: Docker Desktop with Compose v2.

```powershell
# Synchronizes local user/agent signing keys without printing them.
.\scripts\configure-local-env.ps1 -Mode simulation

docker compose up -d --build
docker compose exec broker npm run seed
```

Open `http://localhost:5173`. The operational seed is idempotent and creates 1,000 microgrids across 25 buses, 40 lines, typed buyer/seller agents, DER assets, an oracle signal, and sample committed settlements.

## Production configuration

Copy `.env.production.example` to a secure, untracked location or inject the same names through a secrets manager. Do not reuse the user JWT secret as the agent JWT secret.

```powershell
docker compose --env-file .env.production `
  -f docker-compose.yml `
  -f docker-compose.prod.yml config --quiet

docker compose --env-file .env.production `
  -f docker-compose.yml `
  -f docker-compose.prod.yml up -d --build
```

For Kubernetes, replace the placeholders in `deploy/k8s/secret.template.yaml` through a secrets manager and replace the example public origin in `deploy/k8s/configmap.yaml`. Redis is password protected, non-root, AOF-backed, and uses persistent storage.

## Verification completed on 2026-08-31

- Command-center production build: passed.
- Command-center unit and route smoke tests: 40/40 passed.
- Broker TypeScript production build: passed.
- Broker production fail-closed/simulation fallback tests: 5/5 passed.
- Broker liveness, integrity, and privacy tests: 11/11 passed.
- Engine dataset, health, and route tests: 19/19 passed.
- Operational 1,000-microgrid seed: standalone TypeScript check passed.
- Production Docker Compose merge: configuration validation passed.
- Kubernetes manifests: all 15 YAML documents parsed successfully.

## Remaining deployment gates

This repository is outcome-ready for a controlled demonstration or staging deployment. Utility/market production certification still requires external work that cannot be established from source code alone:

- run full end-to-end and load tests against live PostgreSQL, Redis, and container networking;
- establish a forward-only migration baseline for the target production database and rehearse backup/restore;
- provision real model artifacts and LLM/RAG credentials, then run accuracy, robustness, and drift evaluations;
- perform independent security testing, threat modelling, key management, and dependency scanning;
- validate market rules, metering, grid codes, privacy obligations, and operator approval procedures for the intended jurisdiction;
- connect alert delivery to the organization’s incident-management platform.

No simulated result should be represented as live-grid evidence. The UI displays the active environment to prevent that confusion.
