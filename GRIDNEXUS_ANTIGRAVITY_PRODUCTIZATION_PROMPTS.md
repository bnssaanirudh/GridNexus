# GridNexus Product Completion Playbook for Antigravity

Repository: `bnssaanirudh/GridNexus`

Goal: turn GridNexus from a research-oriented prototype into a **proper, runnable, multi-tenant autonomous energy marketplace** with:

- a working clean-clone runtime
- green CI
- DER-owner registration and onboarding
- secure owner-to-microgrid ownership mapping
- automatic microgrid / DER / agent provisioning
- personal DER-owner dashboard
- owner-configurable constraints and preferences
- strict tenant isolation
- admin approval and governance
- Oracle-source administration
- explainable autonomous-agent decisions
- verified end-to-end negotiation → grid safety → settlement → audit flow

---

# Non-Negotiable Rules

Apply these rules to **every prompt** below.

1. Work against the current repository state; inspect files before modifying them.
2. Do not invent APIs, tables, routes, environment variables, or test results.
3. Do not claim completion unless the relevant commands actually pass.
4. Do not weaken:
   - authentication
   - authorization
   - tenant isolation
   - WebSocket participant validation
   - StabilityGate
   - GridGate
   - settlement checks
   - audit integrity
   - Prisma constraints
   - test assertions
   - coverage thresholds
5. Do not disable or skip failing tests to get green CI.
6. Do not lower the Engine coverage requirement.
7. Do not replace real end-to-end validation with mocks.
8. Use transactions for multi-row provisioning workflows.
9. Never expose private generation cost, private battery constraints, strategy values, secrets, or agent credentials to unauthorized clients.
10. Prefer additive, backward-compatible changes unless a breaking change is clearly required.
11. Every completed phase must end with:
    - files changed
    - commands run
    - exact test results
    - remaining failures
    - whether the phase is PASS or NOT COMPLETE
12. If a phase fails, continue fixing that phase before moving to the next one.

---

# Final Product Definition

The final GridNexus product should behave like this:

```text
                         GRIDNEXUS
                             |
                 +-----------+-----------+
                 |                       |
             DER OWNER                 ADMIN
                 |                       |
          Register / Login         Secure Login
                 |                       |
        Register Energy Site       Network Overview
                 |                       |
       Verification / Approval     Approve DER Owners
                 |                       |
         Microgrid Provisioned     Manage Topology
                 |                       |
            DER Provisioned        Oracle Sources
                 |                       |
        AI Agent Provisioned       Grid Monitoring
                 |                       |
        Owner Preferences          Audit / Settlement
                 |                       |
                 +-----------+-----------+
                             |
                         GRID ORACLE
                             |
                       Belief Updates
                             |
                    Autonomous Agents
                             |
                  Farsighted Negotiation
                             |
                  Coalition / Stability
                             |
                         Grid Gate
                             |
                        Settlement
                             |
                        Audit Ledger
```

The DER owner sets **constraints and preferences**.

The human owner does **not** manually perform bargaining actions.

The autonomous agent negotiates within owner constraints.

The administrator supervises, approves, audits, manages topology and Oracle inputs, but does not manually negotiate on behalf of agents.

---

# PHASE 0 — BASELINE AND BRANCH SAFETY

## Prompt 0.1 — Establish exact baseline

Paste this first:

```text
You are working on:

https://github.com/bnssaanirudh/GridNexus

Do not modify code yet.

Inspect the current default branch completely enough to establish the exact baseline.

Report:

1. current branch
2. current commit SHA
3. latest GitHub Actions run
4. status of:
   - Engine Tests
   - Broker Tests
   - Adversarial Stress Tests
   - Command Center
   - Docker Compose Smoke
   - Full Trade-Loop Integration
   - Golden Path Oracle -> Ledger
   - Merge Gate
5. current auth architecture
6. current User/Microgrid/Agent/DER schema
7. current registration flow
8. current broker API authorization
9. current WebSocket agent authentication
10. current demo-negotiation implementation
11. current runtime modes
12. current Docker compose services
13. current known failing tests

Do not rely on README claims if code disagrees.

Create a branch named:

feature/der-owner-productization

from the current default branch HEAD.

Do not modify main directly.

Return:
BASELINE COMPLETE
only after the branch exists and all baseline facts are verified.
```

---

# PHASE 1 — FIX THE EXISTING PROJECT FIRST

Do not add product features while the current base is red.

## Prompt 1.1 — Fix Engine tests

```text
Stay on feature/der-owner-productization.

Your only task in this phase is to make the complete Engine test suite pass.

Run the actual Engine tests using the repository's documented environment.

Preferred commands:

cd engine
poetry install --with dev --no-root
poetry run pytest -x -vv

Fix the FIRST real failure.

Then rerun.

Continue iteratively until:

poetry run pytest -v

passes completely.

Important:

- do not lower --cov-fail-under
- do not remove tests
- do not weaken assertions
- do not mark failures xfail just to pass
- do not bypass production logic
- do not replace meaningful code with hard-coded test values
- preserve current Engine APIs unless a real bug requires a compatible fix

At the end report:

- exact failing tests found
- root causes
- files changed
- complete pytest result
- total passed/failed/skipped
- final coverage percentage
- whether the existing >=85% coverage gate passes

Do not proceed to Broker work until Engine is green.

Return exactly:
ENGINE PHASE PASS
only if the entire Engine suite passes.
```

## Prompt 1.2 — Fix Broker tests

```text
Now fix the complete Broker test suite.

Set up PostgreSQL/pgvector and Redis exactly as required by the repository.

Run:

cd broker
npm ci
npx prisma generate
npx prisma migrate deploy
npx vitest run --bail=1 --reporter=verbose

Fix the FIRST real failure.

Repeat until the complete Broker suite passes.

Pay special attention to:

- Prisma foreign-key cleanup ordering
- transaction lifecycle
- asynchronous teardown
- Redis/BullMQ cleanup
- WebSocket authentication
- negotiation participants
- settlement relationships
- DER/Microgrid dependencies
- audit persistence

Do not:

- delete assertions
- skip integration tests
- loosen database constraints
- catch and ignore legitimate errors
- bypass JWT validation
- replace relational cleanup with unsafe cascade assumptions unless schema intentionally defines them

After fixing first-failure mode, run:

npm test

and ensure the full suite passes.

Report:

- each real root cause
- files changed
- full Vitest result
- passed/failed/skipped counts

Return exactly:
BROKER PHASE PASS
only when the complete Broker suite passes.
```

## Prompt 1.3 — Repair simulation/runtime semantics

```text
Audit GridNexus runtime-mode semantics.

The product contract is:

GRIDNEXUS_MODE=production
=> strict fail-closed production behavior

GRIDNEXUS_MODE=simulation
=> simulation-safe fallback behavior where explicitly designed

NODE_ENV=test
=> test-only bypasses

NODE_ENV=production
must NOT automatically force GridNexus domain behavior into production mode when GRIDNEXUS_MODE=simulation.

Inspect broker/src/ws/negotiate.ts and every other location that mixes NODE_ENV with GridNexus runtime-mode decisions.

Refactor so:

- domain/runtime mode is determined by the existing config/isProduction mechanism
- NODE_ENV=test remains usable for test-only bypasses
- Docker's NODE_ENV=production is allowed for optimized Node runtime without changing GridNexus simulation semantics

Add or update tests proving:

1. GRIDNEXUS_MODE=simulation + NODE_ENV=production behaves as simulation
2. GRIDNEXUS_MODE=production behaves fail-closed
3. NODE_ENV=test bypasses only what tests intentionally require

Run the Broker test suite afterward.

Return:
RUNTIME MODE PHASE PASS
only if all tests pass.
```

## Prompt 1.4 — Fix authenticated demo negotiation

```text
Rewrite the existing broker demo-negotiation flow so it proves the REAL authenticated architecture.

Do not use query-string agent identity in normal runtime.

The final demo must:

1. use operational seeded data
2. use real seeded agent IDs
3. determine seller/buyer from actual Agent records rather than assuming fake demo IDs
4. authenticate as a seeded ADMIN or GRID_OPERATOR using the Engine
5. request short-lived agent JWTs from:
   POST /auth/agent-token/{agent_id}
6. connect to:
   /negotiate
   using:
   auth: { token: agentToken }
7. wait until both sockets are authenticated and connected
8. start a real negotiation
9. process your_turn events
10. submit COUNTER_OFFER / ACCEPT through the normal protocol
11. wait for final outcome
12. verify:
    - StabilityGate result exists
    - GridGate certificate exists
    - settlement exists when committed
    - EnergyTransfer exists when committed
    - AuditEvent exists
13. exit non-zero on any failed acceptance criterion
14. exit zero only after successful end-to-end verification

Do not mock the final trade path.

If the script needs API reads for verification, use authenticated server-side/API access.

Add tests where practical.

Run the Broker test suite after changes.

Return:
AUTHENTICATED DEMO PHASE PASS
only when the script is consistent with production authentication semantics.
```

## Prompt 1.5 — Clean-clone runtime

```text
Make GridNexus runnable from a clean clone in simulation mode without requiring large research datasets.

Requirements:

1. default simulation compose path must not require:
   - OPSD household dataset
   - India TMY HDF5
   unless explicitly enabled

2. move large real-data mounts behind:
   - an optional compose override
   OR
   - a Docker Compose profile

3. retain real-data support for experiments

4. correct DEMO.md environment setup.

The documented Windows flow must work conceptually as:

Copy-Item .\engine\.env.example .\engine\.env
Copy-Item .\broker\.env.example .\broker\.env

powershell -ExecutionPolicy Bypass -File .\scripts\configure-local-env.ps1 -Mode simulation

docker compose down -v
docker compose up --build -d

5. document Linux/macOS equivalents

6. document:
   - seed command
   - dashboard URL
   - Engine health URL
   - Broker health URL
   - authenticated demo command

7. do not document commands that require nonexistent root files.

Validate Docker Compose configuration.

Run all currently available automated checks.

Return:
CLEAN CLONE PHASE PASS
only when the documented simulation path is internally consistent.
```

---

# PHASE 2 — IDENTITY AND TENANT MODEL

## Prompt 2.1 — Design proper DER-owner ownership model

```text
Now begin productization.

Inspect the current Prisma and SQLAlchemy User, Microgrid, DER, Agent and topology models.

Implement a proper multi-tenant ownership model.

Do NOT merely trust a nullable User.microgridId string forever.

Preferred design:

User
Microgrid
UserMicrogridMembership

UserMicrogridMembership should support at least:

- id
- userId
- microgridId
- role:
  OWNER
  OPERATOR
  VIEWER
- createdAt
- updatedAt if appropriate

Requirements:

1. preserve backward compatibility with existing User.microgridId where practical
2. create migration(s)
3. create relationships and indexes
4. enforce uniqueness rules preventing duplicate identical memberships
5. preserve ADMIN / GRID_OPERATOR / AUDITOR platform-level roles
6. DER_OWNER users must have membership-based access to their microgrids
7. architecture must allow:
   - one user -> multiple microgrids
   - one microgrid -> multiple authorized users
8. update Engine models if both ORM layers mirror the same DB
9. update auth user serialization where needed
10. add tests for membership creation and access lookup

Do not remove existing working data paths without migration compatibility.

Return:
TENANT MODEL PHASE PASS
only after migrations and tests pass.
```

---

# PHASE 3 — DER-OWNER ONBOARDING

## Prompt 3.1 — Add onboarding state machine

```text
Implement DER-owner onboarding lifecycle.

Use explicit states equivalent to:

REGISTERED
PROFILE_INCOMPLETE
PENDING_VERIFICATION
APPROVED
MICROGRID_PROVISIONED
AGENT_PROVISIONED
ACTIVE
REJECTED
SUSPENDED

Use a proper model/field design appropriate to the existing schema.

Requirements:

- existing generic registration continues to work
- new users remain non-privileged until onboarding is approved
- users cannot self-promote to ADMIN or GRID_OPERATOR
- DER ownership is not activated before approval
- every state transition must be validated server-side
- invalid transitions return explicit errors
- record timestamps for important approval/provisioning events
- record approver identity for admin actions

Add tests for valid and invalid transitions.

Return:
ONBOARDING STATE PHASE PASS
only if tests pass.
```

## Prompt 3.2 — Create DER-owner onboarding API

```text
Implement secure DER-owner onboarding endpoints.

Design routes consistent with the existing Engine/Broker separation.

Required capabilities:

1. authenticated user starts DER-owner onboarding
2. user submits public site information:
   - site/microgrid name
   - location
   - DER type
   - grid-connection information where required
3. user submits private operational information separately:
   - capacity
   - battery limits
   - generation cost / reserve parameters where applicable
4. private fields must never be returned to unauthorized users
5. sensitive values already modeled as encrypted fields must continue to use application-level encryption
6. simulation mode may generate safe synthetic defaults ONLY when the user explicitly chooses simulation/demo onboarding
7. production mode must never silently invent real private asset parameters
8. validation must prevent impossible values:
   - negative capacity
   - efficiency outside valid range
   - min power > max power
   - invalid coordinates
   - malformed DER types

Add endpoints such as, or functionally equivalent to:

POST /api/onboarding/der-owner
GET  /api/onboarding/status
PUT  /api/onboarding/der-owner

Do not expose privileged approval controls here.

Add tests.

Return:
DER ONBOARDING API PHASE PASS
only when tests pass.
```

---

# PHASE 4 — ADMIN APPROVAL

## Prompt 4.1 — Add admin approval APIs

```text
Implement administrative DER-owner review and approval.

Only ADMIN and, if appropriate to current RBAC design, GRID_OPERATOR may approve.

Required endpoints/capabilities:

GET /api/admin/onboarding
GET /api/admin/onboarding/{id}
POST /api/admin/onboarding/{id}/approve
POST /api/admin/onboarding/{id}/reject
POST /api/admin/onboarding/{id}/suspend

Requirements:

- explicit RBAC
- audit every approval/rejection/suspension
- include actor user ID
- include reason
- protect private fields from roles that do not require them
- prevent a DER_OWNER from approving themselves
- prevent VIEWER/AUDITOR from mutating onboarding state
- make actions idempotent where sensible

Add authorization tests for every role.

Return:
ADMIN APPROVAL API PHASE PASS
only when tests pass.
```

---

# PHASE 5 — TRANSACTIONAL PROVISIONING

## Prompt 5.1 — Provision Microgrid + DER + Agent safely

```text
Implement transactional provisioning after approval.

The provisioning workflow must atomically create or link:

approved onboarding
    ->
Microgrid
    ->
DER
    ->
MicrogridBusMapping where appropriate
    ->
Agent
    ->
UserMicrogridMembership
    ->
onboarding state update

Requirements:

1. use a database transaction
2. rollback all rows if any provisioning step fails
3. be idempotent
4. repeated approval/provisioning calls must not create duplicate agents or DERs
5. generate stable relationships
6. assign valid agent type/policy metadata using existing architecture
7. do not automatically create arbitrary topology if topology mapping is unavailable
8. if bus assignment requires admin input, introduce a clear PENDING_GRID_MAPPING state rather than guessing
9. record provisioning audit events
10. never expose agent JWT secrets during provisioning

Add tests for:
- success
- failure rollback
- retry/idempotency
- duplicate prevention
- unauthorized provisioning

Return:
PROVISIONING PHASE PASS
only if all tests pass.
```

---

# PHASE 6 — OWNER DATA ISOLATION

## Prompt 6.1 — Build scoped owner APIs

```text
Implement explicit DER-owner scoped APIs.

Prefer:

GET /api/me/microgrids
GET /api/me/ders
GET /api/me/agent
GET /api/me/negotiations
GET /api/me/trades
GET /api/me/settlements
GET /api/me/analytics
GET /api/me/audit

Requirements:

1. derive ownership from authenticated user membership
2. NEVER trust a client-supplied microgridId for authorization
3. owner data must only include their authorized microgrids
4. ADMIN may retain global endpoints
5. GRID_OPERATOR may retain operational global views
6. AUDITOR access should remain read-only according to existing RBAC
7. private strategy/cost fields must never be serialized to DER-owner list endpoints unless specifically intended for their own secure settings view
8. paginate unbounded history endpoints
9. add sensible ordering
10. preserve current admin/global API compatibility

Add tests proving owner A cannot read owner B data.

Return:
OWNER API PHASE PASS
only if tests pass.
```

## Prompt 6.2 — Tenant-isolation red-team tests

```text
Create a dedicated tenant-isolation security test suite.

At minimum test:

1. DER owner A cannot read microgrid B
2. DER owner A cannot read DER B
3. DER owner A cannot read settlement B
4. DER owner A cannot read negotiation B
5. DER owner A cannot read audit B
6. DER owner A cannot modify microgrid B
7. DER owner A cannot alter DER B
8. DER owner cannot promote themselves
9. DER owner cannot access admin onboarding controls
10. DER owner cannot access Oracle admin controls
11. DER owner cannot mint arbitrary agent credentials
12. DER owner cannot connect WebSocket as another agent
13. query-string microgridId cannot bypass access control
14. malformed JWT cannot access scoped APIs
15. inactive/suspended users lose access

Keep these tests permanently in CI.

Return:
TENANT SECURITY PHASE PASS
only if all security tests pass.
```

---

# PHASE 7 — OWNER PREFERENCES, NOT MANUAL TRADING

## Prompt 7.1 — Add owner trading constraints

```text
Implement owner-configurable trading preferences and safety constraints.

The DER owner must NOT manually perform negotiation actions.

Create a TradingPreference / AgentConstraint model appropriate to the existing schema.

Support fields equivalent to:

- tradingEnabled
- minimumBatteryReservePct
- maximumDailyExportKwh
- minimumPreferredSalePrice
- maximumPreferredBuyPrice
- riskProfile:
  CONSERVATIVE
  BALANCED
  AGGRESSIVE
- optional maximum transaction size
- updatedAt

Requirements:

1. validate all numeric ranges
2. owner may edit only preferences for their own microgrid
3. agent must consume these preferences before proposing/accepting trades
4. preferences must not override GridGate or StabilityGate
5. owner constraints must be enforced server-side
6. if a proposed action violates owner constraints, the agent/broker must reject or adjust it
7. record reason in decision/audit trail
8. add tests proving constraint enforcement

Do NOT add manual:
BUY
SELL
ACCEPT
COUNTER OFFER
buttons for DER owners.

Return:
OWNER CONSTRAINT PHASE PASS
only when tests prove constraints are enforced.
```

---

# PHASE 8 — DER-OWNER DASHBOARD

## Prompt 8.1 — Build My Energy Agent dashboard

```text
Build a DER-owner-specific dashboard in command-center.

After login:

ADMIN / GRID_OPERATOR
-> existing global Command Center

DER_OWNER
-> My Energy Agent dashboard

VIEWER / AUDITOR
-> appropriate existing read-only experience

DER-owner dashboard should contain:

1. Agent status
2. Trading enabled/disabled state
3. Today's energy sold
4. Today's energy bought
5. revenue / cost
6. average price
7. DER state
8. battery state if available and authorized
9. current seller/buyer/net position
10. recent negotiations
11. recent committed trades
12. rejected/grid-failed trades
13. active owner constraints
14. current Oracle signal summary
15. agent explanation panel

Use the new /api/me/* endpoints.

Requirements:

- never fetch global data and filter only in the browser
- role-based navigation
- loading states
- empty states
- error states
- mobile-safe layout
- accessible labels
- no private server secrets in frontend
- no agent credential in browser storage

Add frontend tests.

Return:
OWNER DASHBOARD PHASE PASS
only when Command Center lint, tests and build pass.
```

---

# PHASE 9 — AGENT EXPLAINABILITY

## Prompt 9.1 — Explain every significant agent decision

```text
Add an explainability layer for DER owners without exposing hidden chain-of-thought.

Do NOT store or display private LLM chain-of-thought.

Instead provide structured decision explanations.

Each significant negotiation decision should expose fields equivalent to:

decision
offeredPrice
energyKwh
confidence
decisionSource
topFactors[]
ownerConstraintsSatisfied
stabilityStatus
gridStatus
oracleSignalIds
timestamp

Example factors:

- expected solar output
- demand forecast
- grid congestion
- battery reserve
- owner minimum price
- Bayesian opponent belief
- DQN override
- LLM fallback/reasoning deficit

Use existing:
- BeliefUpdate
- ReasoningDeficit
- OracleSignal
- StabilityCheck
- GridFeasibilityCertificate
- NegotiationRound
where possible.

Create a structured explanation endpoint under /api/me/.

Requirements:

- no raw hidden chain-of-thought
- no private opponent strategy leakage
- no encrypted private values belonging to another owner
- trace explanation to persisted evidence
- include IDs for auditability

Add frontend explanation card.

Return:
EXPLAINABILITY PHASE PASS
only when backend/frontend tests pass.
```

---

# PHASE 10 — ADMIN PRODUCTIZATION

## Prompt 10.1 — Admin onboarding console

```text
Add an Admin DER Onboarding page.

Admin must be able to:

- view pending owners
- inspect submitted public site/DER metadata
- inspect only the private information required for verification
- approve
- reject with reason
- suspend
- view provisioning status
- view resulting microgrid
- view resulting DER
- view resulting agent
- view audit history

Requirements:

- strict RBAC
- confirmation for destructive/suspension actions
- no direct trading controls
- audit every mutation
- frontend tests

Return:
ADMIN ONBOARDING UI PHASE PASS
only when Command Center tests/build pass.
```

## Prompt 10.2 — Oracle source management

```text
Create an Admin Oracle Source Management feature on top of the existing RAG/EmbeddedDocument architecture.

Admin capabilities:

1. view existing sources
2. view:
   - sourceType
   - sourceName
   - sourceUri
   - publisher
   - observedAt
   - validFrom
   - validUntil
   - trustScore
   - connector version
   - embedding model/version
   - ingestion time
3. manually submit approved Oracle information
4. disable/revoke a source where architecture permits
5. trigger re-ingestion where safe
6. inspect retrieval/audit metadata

Requirements:

- ADMIN/GRID_OPERATOR only for mutation
- AUDITOR may be read-only if consistent with RBAC
- sanitize submitted content
- validate URIs
- bound payload size
- require source provenance
- require trust metadata
- audit every manual ingestion/mutation
- do not allow the admin UI to silently inject untraceable text
- preserve automated connectors

Add backend/frontend tests.

Return:
ORACLE ADMIN PHASE PASS
only when tests pass.
```

---

# PHASE 11 — AGENT RUNTIME INTEGRATION

## Prompt 11.1 — Make provisioned owner agents actually participate

```text
Connect newly provisioned DER-owner agents to the existing autonomous negotiation architecture.

Requirements:

1. provisioned agent has a valid Agent DB row
2. internal runtime can obtain a short-lived agent JWT
3. DER owner's browser NEVER receives that agent JWT
4. agent connects to Broker /negotiate using auth.token
5. agent identity comes from verified JWT sub
6. broker validates participant membership
7. owner constraints are loaded before decisions
8. Oracle/Belief updates feed the decision process
9. StabilityGate still executes
10. GridGate still executes
11. settlement/audit behavior is unchanged and enforced
12. suspended owners or disabled trading preferences prevent new participation
13. agent restart/reconnect is safe

Add integration tests for a provisioned owner agent.

Return:
OWNER AGENT RUNTIME PHASE PASS
only if integration tests pass.
```

---

# PHASE 12 — END-TO-END PRODUCT TEST

## Prompt 12.1 — Build a real DER-owner golden path

```text
Add a new end-to-end product golden-path test.

Scenario:

1. create user
2. login
3. start DER-owner onboarding
4. submit site information
5. submit DER information
6. admin approves
7. provisioning transaction runs
8. Microgrid exists
9. DER exists
10. Agent exists
11. membership exists
12. owner sees only their own dashboard data
13. second DER owner is provisioned
14. both agents receive internal short-lived credentials
15. Oracle signal exists
16. negotiation starts
17. bargaining proceeds
18. owner constraints are respected
19. StabilityGate passes
20. GridGate passes
21. settlement commits
22. EnergyTransfer persists
23. AuditEvent persists
24. both owners see only their own relevant trade information
25. admin sees the global transaction
26. unauthorized cross-tenant reads fail

Use real service logic wherever possible.

Do not replace the end-to-end path with isolated mocks.

Add this test to CI.

Return:
DER OWNER GOLDEN PATH PASS
only if the test passes.
```

---

# PHASE 13 — UI POLISH AND PRODUCT STORY

## Prompt 13.1 — Role-based navigation and product polish

```text
Polish GridNexus into a coherent product.

Create role-aware navigation:

DER OWNER:
- My Agent
- My DER
- My Trades
- My Settlements
- My Preferences
- My Audit

ADMIN / GRID_OPERATOR:
- Overview
- Microgrids
- DER Assets
- Network Topology
- Agents
- Negotiations
- Coalitions
- Settlements
- Oracle
- Owner Approvals
- Audit / Integrity

AUDITOR:
- read-only governance and audit views

Requirements:

- reuse existing visual system
- do not create a completely unrelated UI style
- clear page titles
- consistent terminology
- readable empty states
- no demo-only fake metrics in production mode
- clearly label simulation data
- clearly label real/operational data
- show role in account menu
- show current runtime mode in admin diagnostics

Run lint/tests/build.

Return:
PRODUCT UI PHASE PASS
only when frontend quality gates pass.
```

---

# PHASE 14 — SECURITY HARDENING

## Prompt 14.1 — Full authorization audit

```text
Perform a full authorization audit after all product features are implemented.

Create an endpoint-by-endpoint access matrix for:

ADMIN
GRID_OPERATOR
DER_OWNER
AUDITOR
VIEWER
AGENT

For every route verify:

- authentication required?
- allowed roles
- tenant scoping
- mutation permission
- response redaction
- audit requirement

Check:

- Engine routes
- Broker routes
- Socket.IO namespaces/events
- onboarding APIs
- owner APIs
- admin APIs
- Oracle APIs
- settlement APIs
- topology APIs
- demo endpoints

Fix any privilege escalation or cross-tenant leakage.

Add tests for every high-risk route.

Return:
AUTHORIZATION AUDIT PASS
only if security tests pass.
```

## Prompt 14.2 — Sensitive data review

```text
Perform a sensitive-data exposure review.

Verify that the following never leak to unauthorized users:

- passwordHash
- encryption keys
- JWT secrets
- agent JWTs
- hidden generation cost
- hidden battery strategy values
- opponent private utility
- private negotiation policy internals
- raw chain-of-thought
- database credentials
- Redis credentials
- full internal stack traces

Inspect:

- API serializers
- Prisma includes/selects
- Engine Pydantic response models
- WebSocket payloads
- frontend API contracts
- logs
- audit records
- demo scripts

Add regression tests for any discovered exposure.

Return:
SENSITIVE DATA AUDIT PASS
only when verified.
```

---

# PHASE 15 — DOCUMENTATION

## Prompt 15.1 — Rewrite product documentation

```text
Update project documentation to describe the product truthfully.

Update at least:

README.md
DEMO.md
architecture documentation
API documentation if present

README should explain:

1. What GridNexus is
2. DER-owner workflow
3. admin/operator workflow
4. autonomous-agent workflow
5. Oracle/RAG role
6. farsighted bargaining
7. StabilityGate
8. GridGate
9. settlement
10. audit/integrity
11. simulation vs production modes
12. clean-clone setup
13. role model
14. security model
15. how to run the DER-owner golden path

Clearly distinguish:

- implemented features
- simulation features
- experimental/research features
- future work

Do not claim real-world deployment or benchmark results that are not demonstrated.

Return:
DOCUMENTATION PHASE PASS
only when docs match current code.
```

---

# PHASE 16 — COMPLETE QUALITY GATE

## Prompt 16.1 — Run every quality gate

```text
Run the complete repository quality gate from a clean state.

Required checks:

ENGINE
- install
- full pytest
- coverage gate

BROKER
- npm ci
- prisma generate
- prisma migrate deploy
- complete tests

COMMAND CENTER
- npm ci
- lint
- tests
- build

DOCKER
- docker compose config
- clean simulation startup
- health checks

INTEGRATION
- authenticated trade demo
- existing Full Trade-Loop
- existing Golden Path Oracle -> Ledger
- new DER-owner golden path
- tenant-isolation tests

SECURITY
- adversarial tests
- authorization tests
- sensitive-data regression tests

Report exact results.

Do not say COMPLETE if any required job fails or is skipped due to dependency failure.

Return:
QUALITY GATE PASS
only if all required checks pass.
```

---

# PHASE 17 — CLEAN-CLONE ACCEPTANCE TEST

## Prompt 17.1 — Final clean-clone simulation acceptance

```text
Perform a final clean-clone acceptance test in simulation mode.

Use a fresh working directory and fresh database volumes.

The target sequence is conceptually:

git clone https://github.com/bnssaanirudh/GridNexus.git
cd GridNexus

create engine/.env from example
create broker/.env from example
configure simulation secrets
docker compose down -v
docker compose up --build -d

verify:
- PostgreSQL healthy
- Redis healthy
- Engine healthy
- Broker healthy
- Command Center healthy
- worker running

seed a small deterministic operational dataset

then verify:

1. admin login
2. DER-owner registration
3. DER-owner onboarding
4. admin approval
5. microgrid provisioning
6. DER provisioning
7. agent provisioning
8. owner dashboard
9. second owner provisioning
10. Oracle signal
11. authenticated agent negotiation
12. StabilityGate
13. GridGate
14. settlement
15. EnergyTransfer
16. audit record
17. DER owner A cannot see B-only data
18. admin can see global state
19. dashboard reflects trade

Capture exact commands and outputs.

Return:
CLEAN CLONE ACCEPTANCE PASS
only if the entire path works.
```

---

# PHASE 18 — CI ACCEPTANCE

## Prompt 18.1 — Require fully green GitHub Actions

```text
Push the completed feature branch.

Inspect the resulting GitHub Actions workflow.

The project is NOT complete unless all required jobs are green.

Required:

Engine Tests                         PASS
Broker Tests                         PASS
Adversarial Stress Tests             PASS
Command Center                       PASS
Docker Compose Smoke Test            PASS
Broker Integration Full Trade-Loop   PASS
Golden Path Oracle -> Ledger          PASS
DER Owner Golden Path                PASS
Tenant Isolation Security            PASS
Merge Gate                           PASS

If any job fails:

1. inspect the exact log
2. reproduce locally if possible
3. fix root cause
4. push
5. rerun
6. repeat

Do not weaken CI.

Return:
CI FULLY GREEN
only when the current branch's latest workflow run is fully green.
```

---

# PHASE 19 — FINAL RED-TEAM REVIEW

## Prompt 19.1 — Try to break the finished system

```text
Act as a senior security engineer, distributed-systems reviewer, energy-market reviewer and hostile QA engineer.

Try to break the completed GridNexus product.

Attack categories:

AUTH
- token forgery
- expired token
- wrong-role token
- user token used as agent token
- agent token used as user token

TENANCY
- owner A accesses B
- forged microgridId
- guessed IDs
- pagination leakage

ONBOARDING
- self-approval
- duplicate provisioning
- replayed approval
- malformed DER
- invalid topology assignment

NEGOTIATION
- non-participant connects
- replayed action
- invalid action
- counter-offer outside constraints
- disabled owner agent trades
- suspended owner trades

SAFETY
- StabilityGate bypass
- GridGate bypass
- settlement without certificates

DATA
- private cost leakage
- hidden battery leakage
- agent token leakage
- password hash leakage

RAG/ORACLE
- untrusted source injection
- invalid provenance
- oversized payload
- admin audit omission

DATABASE
- partial provisioning
- orphaned rows
- duplicate settlement
- broken FK cleanup

RUNTIME
- Redis restart
- Broker restart
- Engine restart
- duplicate worker
- reconnect behavior

For every discovered defect:
- reproduce
- fix
- add regression test

Return:
RED TEAM PASS
only when no known high/critical issue remains.
```

---

# PHASE 20 — FINAL COMPLETION REPORT

## Prompt 20.1 — Produce final engineering report

```text
Generate the final GridNexus product-completion report.

Include:

1. final commit SHA
2. branch
3. changed files
4. schema changes
5. migration names
6. new APIs
7. new UI pages
8. role/access model
9. onboarding lifecycle
10. provisioning workflow
11. owner preference model
12. explainability architecture
13. admin Oracle workflow
14. security controls
15. tenant isolation design
16. runtime architecture
17. tests added
18. total Engine tests
19. Engine coverage
20. total Broker tests
21. Command Center tests
22. integration tests
23. security tests
24. Docker validation
25. clean-clone validation
26. latest CI run ID
27. CI status
28. known limitations
29. future work

The report must clearly separate:

VERIFIED
from
NOT VERIFIED

Do not claim anything that was not actually executed.

Only write:

GRIDNEXUS PRODUCTIZATION COMPLETE

if:

- full CI is green
- clean-clone simulation acceptance passes
- DER-owner golden path passes
- tenant-isolation tests pass
- authenticated agent negotiation passes
- StabilityGate passes
- GridGate passes
- settlement persists
- audit persists
- dashboard reflects the transaction

Otherwise write:

GRIDNEXUS PRODUCTIZATION NOT COMPLETE

and list the exact remaining blockers.
```

---

# Final Acceptance Checklist

Do not consider the project finished until all of these are true:

## Existing platform

- [ ] Engine test suite passes
- [ ] Engine coverage >= existing required threshold
- [ ] Broker test suite passes
- [ ] Command Center lint passes
- [ ] Command Center tests pass
- [ ] Command Center build passes
- [ ] Docker smoke passes
- [ ] adversarial tests pass
- [ ] existing Full Trade-Loop passes
- [ ] existing Golden Path passes

## DER-owner product

- [ ] user can register
- [ ] user can start DER-owner onboarding
- [ ] admin can approve
- [ ] provisioning is transactional
- [ ] Microgrid created
- [ ] DER created
- [ ] Agent created
- [ ] owner membership created
- [ ] no duplicate provisioning
- [ ] owner sees personal dashboard
- [ ] owner can set constraints
- [ ] owner cannot manually negotiate
- [ ] owner cannot access another tenant
- [ ] browser never receives agent credentials
- [ ] provisioned agent can authenticate internally
- [ ] autonomous trade executes
- [ ] owner constraints enforced
- [ ] StabilityGate executes
- [ ] GridGate executes
- [ ] settlement persists
- [ ] EnergyTransfer persists
- [ ] audit persists
- [ ] explanation is available without chain-of-thought leakage

## Admin product

- [ ] pending onboarding list
- [ ] approval/rejection/suspension
- [ ] provisioning visibility
- [ ] global microgrid view
- [ ] global DER view
- [ ] global negotiation view
- [ ] global settlement view
- [ ] Oracle source management
- [ ] audit and integrity views
- [ ] no manual human negotiation controls

## Security

- [ ] tenant-isolation suite passes
- [ ] RBAC suite passes
- [ ] agent identity cannot be forged
- [ ] owner cannot mint arbitrary agent token
- [ ] private fields do not leak
- [ ] raw chain-of-thought never exposed
- [ ] settlement cannot bypass safety gates
- [ ] audit records all privileged mutations

## Final proof

- [ ] clean clone works
- [ ] simulation mode works without optional large research datasets
- [ ] documented setup matches actual code
- [ ] GitHub Actions fully green
- [ ] latest commit SHA recorded
- [ ] exact executed results recorded

---

# Recommended Execution Order

Use this order exactly:

```text
0. Baseline
1. Fix Engine
2. Fix Broker
3. Fix runtime mode
4. Fix authenticated demo
5. Fix clean-clone simulation
6. Tenant model
7. Onboarding state
8. Onboarding API
9. Admin approval API
10. Transactional provisioning
11. Owner APIs
12. Tenant-isolation tests
13. Owner constraints
14. Owner dashboard
15. Explainability
16. Admin onboarding UI
17. Oracle management
18. Owner agent runtime
19. DER-owner golden path
20. UI polish
21. Authorization audit
22. Sensitive-data audit
23. Documentation
24. Full quality gate
25. Clean-clone acceptance
26. Fully green CI
27. Red-team
28. Final completion report
```

Do not skip directly to frontend work before the runtime and security foundation is green.
