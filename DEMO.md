# GridNexus Product Demo Walkthrough

> **Interactive Walkthrough & Clean-Checkout Guide**  
> Demonstrates the complete GridNexus multi-tenant autonomous energy marketplace from a fresh clone to live autonomous agent negotiation, admin governance, and cryptographic audit verification.

---

## Prerequisites

| Requirement | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | 20.x or higher | With `npm` |
| **Python** | 3.11 or higher | With `pip` (or `poetry`) |
| **Docker Desktop** | 24.x or higher | With Docker Compose v2 |
| **RAM** | 8 GB free | |
| **Disk** | 6 GB free | |

---

## 1. Quick Start (Simulation Mode)

### Step 1.1: Clone and Configure Environment
```bash
git clone https://github.com/bnssaanirudh/GridNexus.git
cd GridNexus

# Copy configuration files
cp broker/.env.example broker/.env
cp engine/.env.example engine/.env
```

### Step 1.2: Start Services via Docker Compose
```bash
docker compose up --build -d
```

Verify all services reach `Healthy` status:
```bash
docker compose ps
```

Expected healthy containers:
- `gridnexus-postgres` (Port 5432)
- `gridnexus-redis` (Port 6379)
- `gridnexus-engine` (Port 8000)
- `gridnexus-broker` (Port 3000)
- `gridnexus-command-center` (Port 5173)

---

## 2. Execute the 26-Step DER-Owner Golden Path Test

The single most comprehensive automated verification of the platform is the **End-to-End Golden Path Test**, covering registration, onboarding, administrative approval, transactional provisioning, agent credentialing, Oracle broadcasting, Rubinstein bargaining, StabilityGate, GridGate, idempotent settlement, and cross-tenant data isolation:

```bash
cd broker
npx vitest run tests/golden-path.test.ts
```

All 16 test stages execute sequentially against real database models and business logic:
- `1-2`: Create seller, buyer, and admin users; issue role-scoped JWTs.
- `3-5`: DER owners register sites and submit private constraints (encrypted with AES-256-GCM).
- `6-7`: Administrator approves the application; transactional provisioning fires.
- `8-11`: `Microgrid`, `DER`, `Agent`, and `UserMicrogridMembership` rows verified in Postgres.
- `12-14`: DER owners receive scoped access; internal agent runtime acquires short-lived credentials.
- `15-18`: Oracle signal triggers belief updates; autonomous agents load owner constraints and bargain.
- `19-20`: Trade passes StabilityGate (cutting-planes LP) and GridGate (OPF power balance).
- `21-23`: Atomic settlement commits; `EnergyTransfer` and `AuditEvent` records persist with SHA-256 chaining.
- `24-26`: Owners inspect only their own trades; admin views global grid state; unauthorized cross-tenant reads return 401/403.
- `BONUS`: Settlement idempotency guarantees zero double-settlement on identical idempotency keys.

---

## 3. Interactive Web Command Center Demo

Open your browser to `http://localhost:5173`.

### 3.1. Explore as DER Owner
1. Navigate to `/login` and sign in with demo credentials or register a new owner account.
2. Observe role-tailored navigation in the sidebar:
   - **⚡ My Agent**: Inspect autonomous agent status, active negotiation policies, and set pricing boundaries (e.g., minimum sell price: \$0.12/kWh, maximum buy price: \$0.08/kWh).
   - **⬡ My DER**: View nameplate ratings and operational power bounds of registered assets.
   - **⇄ My Trades**: Live WebSocket event feed of autonomous bargaining rounds.
   - **▣ My Settlements**: Real-time list of committed trades with energy transfers and pricing.
   - **⌁ My Audit**: Cryptographic SHA-256 hash chain explorer verifying your microgrid's immutable events.

### 3.2. Explore as Administrator / Grid Operator
1. Switch to an administrator session (role `ADMIN`).
2. Observe administrative governance consoles:
   - **🛡 Owner Approvals**: Review pending DER onboarding applications, inspect technical specs, and approve or suspend microgrids.
   - **⚛ Oracle Sources**: Add, verify, or revoke external weather and market tariff data feeds.
   - **⟁ Microgrids & Network Topology**: Visual planar graph showing bus voltages and AC/DC line loading margins.
   - **◌ System Health & Diagnostics**: Real-time service readiness probes and simulation vs. operational data classification.

---

## 4. Security & Sensitive Data Verification

GridNexus includes a dedicated security audit suite validating the absence of data leaks and strict tenant isolation:

```bash
cd broker
npx vitest run tests/authorization-and-sensitive-data-audit.test.ts
```

Verifications executed:
- Passwords are never returned in login/registration payloads.
- Secret operational variables (`hiddengenerationcost`, `hiddenbatterycapacity`) are encrypted at rest and never exposed over public or tenant APIs.
- Agent JWTs remain strictly internal to the backend worker runtime and are never delivered to the client browser.
- Explainability service answers queries without leaking competitor utility functions or raw LLM chain-of-thought.
- Database triggers strictly block `DELETE` operations on append-only audit tables.

---

## 5. Teardown

To cleanly shut down the demo environment:
```bash
docker compose down -v
```
*(The `-v` flag removes ephemeral database volumes for a clean reset).*
