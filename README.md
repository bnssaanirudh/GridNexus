# GridNexus: Multi-Tenant Autonomous Energy Marketplace

> **Decentralized Virtual Power Plant (VPP) Platform**  
> Enables Distributed Energy Resource (DER) owners (rooftop solar, community batteries, commercial storage, flexible loads) to participate in peer-to-peer and grid-coordinated energy trading through **autonomous AI agents** operating under strict human-owner constraints, physical grid stability gates, and tamper-proof cryptographic audit ledgers.

[![CI](https://github.com/bnssaanirudh/GridNexus/actions/workflows/ci.yml/badge.svg)](https://github.com/bnssaanirudh/GridNexus/actions/workflows/ci.yml)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1.0-2AA9FF)](./docs/api/index.html)
[![ADRs](https://img.shields.io/badge/Architecture-Decisions-22C55E)](./docs/DECISIONS.md)
[![Docs](https://img.shields.io/badge/Module-Reference-F5A623)](./docs/reference/index.md)

---

## Table of Contents

1. [What GridNexus Is](#what-gridnexus-is)
2. [Platform Architecture](#platform-architecture)
3. [User & System Workflows](#user--system-workflows)
   - [DER-Owner Workflow](#1-der-owner-workflow)
   - [Admin / Grid Operator Workflow](#2-admin--grid-operator-workflow)
   - [Autonomous Agent Workflow](#3-autonomous-agent-workflow)
4. [Safety, Physics & Settlement Gates](#safety-physics--settlement-gates)
   - [Grid Oracle & RAG Belief Pipeline](#grid-oracle--rag-belief-pipeline)
   - [Farsighted Rubinstein Bargaining & DQN](#farsighted-rubinstein-bargaining--dqn)
   - [StabilityGate (Cutting-Planes LP)](#stabilitygate-cutting-planes-lp)
   - [GridGate (Feasibility Certification)](#gridgate-feasibility-certification)
   - [Atomic Settlement & Append-Only Audit Ledger](#atomic-settlement--append-only-audit-ledger)
5. [Role Model & Access Matrix](#role-model--access-matrix)
6. [Security & Privacy Model](#security--privacy-model)
7. [Simulation vs. Production Modes](#simulation-vs-production-modes)
8. [Feature Status Matrix](#feature-status-matrix)
9. [Clean-Clone Setup & Quick Start](#clean-clone-setup--quick-start)
10. [Running the DER-Owner Golden Path](#running-the-der-owner-golden-path)
11. [Automated Test Suites](#automated-test-suites)

---

## What GridNexus Is

In conventional grids, small DER owners face high friction and opaque utility pricing. In traditional P2P prototypes, human users are unrealistically expected to manually bid on energy every 15 minutes, or expose their proprietary battery capacity and true generation cost to competitor algorithms.

**GridNexus productizes autonomous microgrid coordination**:
- **Humans set goals and boundaries** (maximum buy price, minimum sell price, risk tolerance, preferred trading windows).
- **Autonomous agents negotiate** 24/7 on behalf of their owners using game-theoretic strategies (Rubinstein alternating offers, Logit Quantal Response Equilibrium, MAPPO).
- **Physical grid safety is non-negotiable**: Every agreed trade must pass mathematical **StabilityGate** and **GridGate** verifications before any financial or physical settlement is committed.
- **Strict tenant isolation**: DER owners only see their own assets, agents, trades, settlements, and audit entries. Private generation costs and battery strategy parameters are encrypted at rest using AES-256-GCM.

```text
                         GRIDNEXUS
                             │
                 ┌───────────┴───────────┐
                 │                       │
             DER OWNER                 ADMIN
                 │                       │
          Register / Login         Secure Login
                 │                       │
        Register Energy Site       Network Overview
                 │                       │
       Verification / Approval     Approve DER Owners
                 │                       │
         Microgrid Provisioned     Manage Topology
                 │                       │
            DER Provisioned        Oracle Sources
                 │                       │
        AI Agent Provisioned       Grid Monitoring
                 │                       │
        Owner Preferences          Audit / Settlement
                 │                       │
                 └───────────┬───────────┘
                             │
                         GRID ORACLE
                             │
                       Belief Updates
                             │
                    Autonomous Agents
                             │
                  Farsighted Negotiation
                             │
                  Coalition / Stability
                             │
                         Grid Gate
                             │
                        Settlement
                             │
                        Audit Ledger
```

---

## Platform Architecture

The repository is organized into three decoupled layers:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                     LAYER 3: GEOSPATIAL COMMAND CENTER                        │
│          (React 18, Vite, TypeScript, R Shiny Leaflet, Power BI)              │
│  • Role-Aware Navigation (DER Owner vs Admin vs Auditor)                      │
│  • My Agent Dashboard & Autonomous Constraints                                │
│  • Admin DER Onboarding & Oracle Source Management                            │
│  • Live WebSocket Feed (/negotiate) & SHA-256 Audit Explorer                  │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │ WebSocket / REST
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                       LAYER 2: EVENT-DRIVEN STATE BROKER                      │
│            (Node.js 20, Express, TypeScript, Redis/BullMQ, PostgreSQL)        │
│  • Scoped Tenant Isolation (/api/me/*) & RBAC Middleware                      │
│  • Transactional Multi-Row Provisioning with Failure Rollback                 │
│  • Agent Runtime Auth (short-lived JWTs isolated from owner browser)          │
│  • Pre-Commit StabilityGate & GridGate Execution                              │
│  • Idempotent Settlement Service & Append-Only Hash Chain                     │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │ REST / JSON
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                    LAYER 1: MATHEMATICAL & AI CORE (ENGINE)                   │
│             (Python 3.11+, FastAPI, PyTorch, PettingZoo, NetworkX)            │
│  • LangChain LLM Bargaining wrapped in Deep Q-Network (DQN) Safety Guard      │
│  • MAPPO Multi-Agent Reinforcement Learning Grid Oracle with GAE              │
│  • Row-Constraint-Generation Linear Program for Farsighted Stability          │
│  • Planar Graph Network Topology Verification & AC/DC Line Physics            │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## User & System Workflows

### 1. DER-Owner Workflow
1. **Registration**: DER owner registers via `/auth/register` with role `DER_OWNER`.
2. **Site Registration**: Submits site details (location, grid bus, nameplate capacity, DER type). Private values (true marginal cost, battery reserve threshold) are encrypted with AES-256-GCM.
3. **Admin Verification**: Application enters `PENDING_APPROVAL` status. Owner dashboard shows onboarding progress.
4. **Automated Provisioning**: Upon admin approval, an ACID transaction automatically provisions:
   - `Microgrid` record linked to network topology.
   - `DER` record with rated and operational limits.
   - `Agent` record configured with initial policy hyperparameters.
   - `UserMicrogridMembership` binding the owner to the provisioned assets.
   - Default `TradingPreference` record.
5. **Preference Management**: The owner tunes autonomous trading preferences via **My Agent** (trading enabled/disabled, minimum sell price, maximum buy price, strategy mode).
6. **Autonomous Operations**: The owner does **not** manually click buy/sell buttons. Their autonomous agent negotiates continuously within the defined preferences.
7. **Scoped Monitoring**: The owner views only their own agent status, DER output, committed settlements, and cryptographically verified audit records.

### 2. Admin / Grid Operator Workflow
1. **Application Review**: Inspects pending DER onboarding submissions via `/api/admin/onboarding`.
2. **Approval & Provisioning**: Approves or rejects applications with an audit-logged administrative reason.
3. **Lifecycle Management**: Can suspend or reactivate misbehaving microgrids (e.g. physical maintenance or contract breach). Suspension instantly cuts off agent trading participation.
4. **Oracle Governance**: Configures, pauses, or revokes exogenous weather and grid price ingestion sources via `/api/admin/oracle/sources`.
5. **Grid Overview**: Monitors global microgrid topology, line loading percentages, system health probes, and the append-only transaction ledger.

### 3. Autonomous Agent Workflow
1. **Agent Credentialing**: The internal agent runtime requests short-lived agent JWTs (`Role.AGENT`). **The owner's browser never receives or stores agent credentials.**
2. **Connection & Handshake**: Agent connects to WebSocket `/negotiate` using `auth.token`. The broker validates that the agent belongs to an active, non-suspended microgrid.
3. **Preference Injection**: Before every round, the agent runtime loads the owner's active `TradingPreference`. Offers violating owner constraints are rejected before transmission.
4. **Alternating Offers**: Agents conduct Rubinstein bargaining. The LLM strategy is safeguarded by a Deep Q-Network (DQN) wrapper that forces concession or fallback if proposals become economically irrational.
5. **Safety Gate Verification**: When mutual agreement is reached, trade moves to `PROVISIONAL` and triggers StabilityGate and GridGate.

---

## Safety, Physics & Settlement Gates

### Grid Oracle & RAG Belief Pipeline
- Periodic BullMQ jobs trigger the MAPPO Grid Oracle to publish exogenous macro grid state (e.g., peak demand alert, wind surplus).
- Agents execute Bayesian belief update cycles (`BeliefUpdateService`) updating their prior probabilities before entering bargaining sessions.

### Farsighted Rubinstein Bargaining & DQN
- Alternating offers proceed under discrete round limits.
- If LLM output fails schema validation, retry loops engage (up to 3 retries).
- If retries fail or output violates safety thresholds, the DQN safety wrapper overrides the action with an economically safe fallback.

### StabilityGate (Cutting-Planes LP)
- Before any trade commits, the proposed power transfer is evaluated against the multi-agent coalitional game core.
- The Engine runs a Row-Constraint-Generation Linear Program to ensure the trade does not destabilize existing microgrid coalitions or violate line capacity constraints.

### GridGate (Feasibility Certification)
- Checks voltage magnitude limits (0.95–1.05 p.u.) and power flow balance across the planar grid topology.
- Issues a signed `GridFeasibilityCertificate` with input and result hashes.

### Atomic Settlement & Append-Only Audit Ledger
- Settlements are executed in an ACID transaction requiring unique `idempotencyKey` values.
- Re-executing a settlement with the same key returns the existing settlement without duplicate transfers.
- Every state transition appends an `AuditEvent` to a SHA-256 cryptographic hash chain where:
  $$\text{eventHash}_n = \text{SHA256}(\text{previousHash}_{n-1} + \text{payload} + \text{eventType} + \text{negotiationId} + \text{actorId})$$
- Database triggers strictly prohibit `UPDATE` or `DELETE` on settlements and audit tables.

---

## Role Model & Access Matrix

| Role | Onboarding | My Agent / Assets | Admin Onboarding | Admin Oracle | Grid Topology | Settlements & Audit |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **DER_OWNER** | Self Register / Status | Scoped Read/Write | ❌ Denied (403) | ❌ Denied (403) | Scoped | Tenant-Scoped |
| **ADMIN** | Read All | View All | Approve / Reject / Suspend | Ingest / Revoke / Config | Full Access | Global Access |
| **GRID_OPERATOR**| Read All | View All | Review / Suspend | Ingest / Manage | Full Access | Global Access |
| **AUDITOR** | Read All | Read All | Read-Only | Read-Only | Read-Only | Global Read-Only |
| **VIEWER** | Public Only | ❌ Denied (401) | ❌ Denied (403) | ❌ Denied (403) | Read-Only | Read-Only |
| **AGENT** | Internal Auth | Trade Execution | ❌ Denied | ❌ Denied | Internal Physics | Negotiate Namespace |

---

## Security & Privacy Model

1. **Zero Secret Leakage**:
   - `passwordHash` is excluded from all API responses and JSON serializers.
   - `hiddengenerationcost` and `hiddenbatterycapacity` are stored encrypted with AES-256-GCM and never returned over `/api/me/*`.
   - Agent JWTs are isolated within the backend runtime and never delivered to the client UI.
2. **Tenant Scoping**: All `/api/me/*` routes resolve microgrid access strictly through validated `UserMicrogridMembership` rows. Client-supplied microgrid IDs in request parameters are ignored.
3. **Reasoning-Deficit & Privacy-Preserving Explainability**:
   - The explainability service (`/api/me/explanations`) surfaces structured rationales (market surplus, preference margins, gate checks) without leaking opponent utility functions, raw LLM chains-of-thought, or rival bidding strategies.
4. **Tamper-Proof Audit Trail**: PostgreSQL triggers enforce append-only semantics on `settlements`, `audit_events`, and `energytransfers`.

---

## Simulation vs. Production Modes

Controlled by the `GRIDNEXUS_MODE` environment variable:

- **SIMULATION (`GRIDNEXUS_MODE=simulation` / Default)**:
  - Synthetic solar and wind profiles are generated for testing and demonstration.
  - If the Engine or hardware HSM is offline, mock solvers provide deterministic responses so the UI and business workflows remain testable.
  - UI prominently displays simulation environment banners.
- **PRODUCTION (`GRIDNEXUS_MODE=production`)**:
  - Requires all external dependencies (PostgreSQL, Redis, Engine, live telemetry connectors).
  - All mock solver fallbacks are strictly disabled. Any service interruption fails closed immediately.
  - Enforces minimum 32-character JWT secrets and 64-hexadecimal encryption keys.

---

## Feature Status Matrix

| Component / Capability | Status | Implementation Details |
| :--- | :---: | :--- |
| **DER-Owner Registration & Onboarding** | ✅ **Implemented** | Multi-step wizard, AES-256-GCM encrypted private values |
| **Admin Onboarding & Governance** | ✅ **Implemented** | Approval workflow, auto-provisioning transaction, suspensions |
| **Autonomous Agent Runtime** | ✅ **Implemented** | WebSocket `/negotiate`, short-lived tokens, membership checks |
| **Owner Preferences Engine** | ✅ **Implemented** | Bounded price and strategy constraints, SHA-256 preference audit |
| **Explainability Service** | ✅ **Implemented** | Privacy-preserving decision rationales without CoT leakage |
| **StabilityGate & GridGate** | ✅ **Implemented** | Row-Constraint-Generation LP solver & OPF feasibility checks |
| **Settlement & Audit Ledger** | ✅ **Implemented** | Idempotent transaction committer & SHA-256 hash-chained ledger |
| **Geospatial Command Center** | ✅ **Implemented** | Role-aware React 18 / Vite SPA with dark/light themes |
| **GridNexus Patent Demonstrations** | ✅ **Implemented** | Formal structural IP proofs and ablation studies (v1.0 evidence) |

---

## Clean-Clone Setup & Quick Start

### Prerequisites
- **Node.js** $\ge 20.x$ and `npm`
- **Python** $\ge 3.11$ and `pip` (or `poetry`)
- **Docker** and Docker Compose v2 (recommended for full stack)

### 1. Clone the Repository
```bash
git clone https://github.com/bnssaanirudh/GridNexus.git
cd GridNexus
```

### 2. Configure Environment
```bash
# Broker configuration
cp broker/.env.example broker/.env

# Engine configuration
cp engine/.env.example engine/.env
```

### 3. Run with Docker Compose
```bash
docker compose up --build -d
```
Access points:
- **Command Center UI**: `http://localhost:5173`
- **Broker API**: `http://localhost:3000` (Health: `http://localhost:3000/ready`)
- **Engine Core API**: `http://localhost:8000` (Docs: `http://localhost:8000/docs`)

---

## Running the DER-Owner Golden Path

GridNexus includes an end-to-end integration test exercising all 26 product lifecycle steps (registration, site submission, admin approval, microgrid provisioning, agent credentialing, Oracle broadcast, bargaining, gate checks, idempotent settlement, and cross-tenant verification):

```bash
cd broker
npx vitest run tests/golden-path.test.ts
```

Expected output:
```text
✓ tests/golden-path.test.ts (16 tests)
  ✓ 1-2. Create users (seller, buyer, admin) and obtain auth tokens
  ✓ 3-5. DER-Owner onboarding application workflow
  ✓ 6-7. Admin approves onboarding and triggers provisioning
  ✓ 8-11. Microgrid, DER, Agent, and Membership exist
  ✓ 12. Owner sees only their own dashboard data
  ✓ 13. Second DER owner onboarded and provisioned
  ✓ 14. Both agents receive internal short-lived credentials
  ✓ 15. Oracle signal exists in the system
  ✓ 16-18. Negotiation session starts and constraints are loaded
  ✓ 19-20. StabilityGate and GridGate pass for the agreed trade
  ✓ 21-23. Settlement commits with EnergyTransfer and AuditEvent persistence
  ✓ 24. Both owners see only their own relevant trade information
  ✓ 25. Admin sees the global settlement and energy transfer
  ✓ 26. Unauthorized cross-tenant reads fail
  ✓ BONUS: Settlement idempotency — same key returns existing record

Test Files  1 passed (1)
Tests       16 passed (16)
```

---

## Automated Test Suites

GridNexus maintains comprehensive automated test suites across all layers:

### 1. Broker Vitest Suite (TypeScript)
```bash
cd broker
npx vitest run
```
*Result: 27 test files passed, 186/186 tests passing (including red-team security and authorization audit).*

### 2. Engine Pytest Suite (Python)
```bash
cd engine
python -m pytest
```
*Result: 27 test modules passed, 213/213 tests passing with 92.47% code coverage.*

### 3. Command Center Suite (React / Vite)
```bash
cd command-center
npm test
npm run build
```
*Result: 10 test files passed, 70/70 tests passing, production bundle builds cleanly with TypeScript validation.*

---

## License

Proprietary – GridNexus Development Team.
