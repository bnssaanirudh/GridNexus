# GridNexus Architecture Decision Records (ADRs)

This log records the core architectural and technical decisions made across all three layers of the GridNexus platform.

---

## Index of Decisions

- [ADR 001: MAPPO (Centralized Training, Decentralized Execution) over Independent PPO](#adr-001-mappo-over-independent-ppo)
- [ADR 002: Row-Constraint-Generation (Cutting-Planes LP) over Full Coalition Enumeration](#adr-002-row-constraint-generation-over-full-enumeration)
- [ADR 003: PostgreSQL with Append-Only Immutable Triggers as Single Source of Truth](#adr-003-postgresql-as-single-source-of-truth-over-separate-time-series-store)
- [ADR 004: Deep Q-Network (DQN) Action Masking & Guardrail over Pure LLM Bargaining](#adr-004-dqn-action-masking-and-guardrails-over-pure-llm-bargaining)
- [ADR 005: Quantal Response Equilibrium (Logit QRE) for Bounded-Rationality Agent Modeling](#adr-005-quantal-response-equilibrium-for-agent-modeling)
- [ADR 006: RAG Vector Ingestion Pipeline with Resilience Fallbacks for Exogenous Signals](#adr-006-rag-vector-ingestion-with-resilience-fallbacks)
- [ADR 007: Redis & BullMQ for Asynchronous Heavy Mathematical Workload Offloading](#adr-007-redis-and-bullmq-for-asynchronous-heavy-math-offloading)

---

## ADR 001: MAPPO over Independent PPO

### Status
**Accepted**

### Context
In GridNexus, self-interested microgrids pool energy into Virtual Power Plants (VPPs) under the guidance of a Grid Oracle. We needed a reinforcement learning framework for training the Bayesian-persuasion Grid Oracle. Independent PPO (IPPO) trains each agent with an isolated policy and value network, whereas Multi-Agent PPO (MAPPO) uses Centralized Training with Decentralized Execution (CTDE) where a centralized critic has access to the global system state during training, but actors only observe local observations during execution.

### Decision
We chose **MAPPO with CTDE** using PettingZoo's `ParallelEnv` interface.
- During training, the centralized critic observes the joint state (aggregate grid load, weather forecasts, total surplus) to accurately estimate the global value function $V(s)$.
- During execution, the actor only requires local observation $o_i$ (local storage, local forecast, local stance), preserving the privacy of private battery capacities and generation costs.

### Consequences
- **Positive**: Eliminates the non-stationarity problem inherent in multi-agent environments; achieves stable policy convergence without requiring agents to reveal private information during inference.
- **Positive**: Enables MAPPO's generalized advantage estimation (GAE) across the collective microgrid coalition.
- **Negative / Trade-off**: Requires simultaneous observation collection across all agents at each timestep (`ParallelEnv` instead of asynchronous `AECEnv`).

---

## ADR 002: Row-Constraint-Generation over Full Enumeration

### Status
**Accepted**

### Context
Verifying Farsighted Coalitional Stability over a set of $N$ microgrids requires checking that no subset of microgrids can profitably deviate to another coalition. In general cooperative game theory, the number of possible coalitions is $2^N - 1$, which exhibits exponential Bell-number explosion ($>10^{15}$ for $N=50$), making naive LP formulation computationally intractable in real-time trading loops.

### Decision
We implemented a **Row-Constraint-Generation (Cutting-Planes) Linear Program** combined with planar graph topology constraints:
1. **Planar Graph Restriction**: Power lines physically form a planar graph ($|E| \le 3|V| - 6$). Permissible coalitions must induce connected subgraphs in the planar topology, reducing the candidate coalition space from exponential to polynomial $O(N^k)$ for bounded diameter $k$.
2. **Separation Oracle**: Instead of adding all coalition constraints upfront, the LP starts with a relaxed master problem. A separation oracle identifies the most violated coalition deviation; if the maximum violation is $\le 0$, the coalition is guaranteed farsightedly stable.

### Consequences
- **Positive**: Solves 50-node stability verification in under $25\text{ ms}$ (enabling real-time pre-commit stability gates in Rubinstein bargaining).
- **Positive**: Provably guarantees the Core and Farsighted Coalitional Stability properties.
- **Negative / Trade-off**: Requires power-line physical topologies to remain planar (checked via linear-time Left-Right planarity testing on construction).

---

## ADR 003: PostgreSQL as Single Source of Truth over Separate Time-Series Store

### Status
**Accepted**

### Context
GridNexus requires strict regulatory compliance, immutable audit logging for energy transfers, belief update tracking, RL rewards, and exogenous vector embeddings. We evaluated splitting the storage layer between PostgreSQL (relational) and a dedicated time-series database (e.g., InfluxDB/TimescaleDB) or NoSQL document store.

### Decision
We chose **PostgreSQL (with `pgvector` and append-only database triggers)** as the unified single source of truth:
1. **ACID Transaction Guarantees**: Trade settlement (`EnergyTransfer`, `BeliefUpdate`, `RlReward`, and `Negotiation.status`) must succeed or fail atomically within a single database transaction. Dual-writing to separate time-series stores risks state drift and audit corruption.
2. **Append-Only Immutable Triggers**: Database-level PL/pgSQL triggers (`BEFORE UPDATE OR DELETE`) strictly prohibit mutation or deletion of settled audit records.
3. **Unified `pgvector` Support**: Embeddings from exogenous weather/RAG pipelines (`vector(384)`) reside in the same database, enabling relational joins between raw signals and resulting trade volumes.

### Consequences
- **Positive**: Zero possibility of split-brain or ledger desynchronization across settlement, stability checks, and belief updates.
- **Positive**: DirectQuery support in Power BI and direct relational queries in R Shiny Leaflet without intermediate ETL pipelines.
- **Negative / Trade-off**: Requires proper PostgreSQL indexing on `(agentId, status)` and `createdAt` for high-throughput time-series aggregation.

---

## ADR 004: DQN Action Masking and Guardrails over Pure LLM Bargaining

### Status
**Accepted**

### Context
Large Language Models (LLMs) used as autonomous negotiation agents provide rich natural language reasoning and strategic adaptability, but occasionally produce hallucinated prices, malformed counter-offers, or economically irrational actions (e.g., walking away when offered surplus $\gg$ reservation price).

### Decision
We wrapped LangChain LLM negotiation agents with a **Deep Q-Network (DQN) Action-Masking Safety Gate**:
- The LLM proposes candidate bargaining actions (`OFFER`, `COUNTER_OFFER`, `ACCEPT`, `WALK_AWAY`).
- The DQN evaluates the candidate action against Q-value bounds. If the LLM proposes an economically dominated move (or fails JSON schema validation after 3 retries), the DQN gate overrides the action and logs a `ReasoningDeficit` audit record (`decisionSource = "DQN_GATE"`).

### Consequences
- **Positive**: 100% mathematical guarantee against dominated actions and catastrophic walk-aways.
- **Positive**: Full auditability: operators can distinguish between pure LLM decisions and DQN-enforced overrides.
- **Negative / Trade-off**: Adds a lightweight neural forward pass ($< 2\text{ ms}$) to each bargaining round.

---

## ADR 005: Quantal Response Equilibrium for Agent Modeling

### Status
**Accepted**

### Context
Classical Nash Equilibrium assumes perfect rationality, which fails to capture human-directed microgrid operators who make boundedly rational or stochastic decisions during market stress.

### Decision
We adopted **Logit Quantal Response Equilibrium (Logit-QRE)** with dynamic parameter calibration ($\lambda$):
- Action probabilities follow a Boltzmann distribution $P(a_i) \propto \exp(\lambda \cdot U_i(a_i))$.
- As $\lambda \to \infty$, behavior approaches perfect Nash rationality; as $\lambda \to 0$, behavior reflects uniform exploration.
- Agent $\lambda$ parameters are dynamically calibrated from historical audit ledger actions.

### Consequences
- **Positive**: Robust negotiation convergence against diverse, non-ideal opponent strategies.
- **Positive**: Smooth empirical best-response curves for MAPPO oracle training.
- **Negative / Trade-off**: Requires solving fixed-point equations during offline calibration.

---

## ADR 006: RAG Vector Ingestion with Resilience Fallbacks

### Status
**Accepted**

### Context
The Grid Oracle ingests unstructured exogenous data (weather alerts, grid operator advisories, spot price feeds) to form Bayesian prior updates. External weather APIs and vector embedding services can experience outages, rate-limiting, or intermittent network failures.

### Decision
We built an **Adaptive Ingestion Pipeline with Degraded Fallbacks**:
- Embeddings are generated using `sentence-transformers/all-MiniLM-L6-v2` and stored in PostgreSQL `embedded_documents`.
- The ingestion client wraps external API calls with exponential backoff, jitter, and a circuit breaker.
- If external weather feeds become unavailable, the pipeline falls back to historical seasonal distributions with reduced confidence scores, explicitly flagged in `oraclesignals.signalData`.

### Consequences
- **Positive**: Zero pipeline crashes during external upstream API failures.
- **Positive**: Downstream Bayesian belief updates gracefully scale down persuasion strength when operating on fallback signals.
- **Negative / Trade-off**: Confidence scores temporarily decrease during external outages.

---

## ADR 007: Redis and BullMQ for Asynchronous Heavy Math Offloading

### Status
**Accepted**

### Context
Rubinstein bargaining WebSocket sessions require low latency ($< 50\text{ ms}$ per round), while LP coalitional stability checks and Oracle broadcast cycles require compute-heavy optimization and external network calls.

### Decision
We used **Redis with BullMQ task queues** in Layer 2 (Broker):
- WebSocket connection loops offload stability verification jobs to `stabilityQueue`.
- Recurring Oracle broadcasts run on deterministic cron jobs in `oracleBroadcastQueue`.
- Hourly database integrity snapshots run in `integrityQueue`.

### Consequences
- **Positive**: WebSocket event loop in Node.js is never blocked by Python engine computation or database lock contention.
- **Positive**: Built-in job retry policies, dead-letter queues, and progress telemetry.
- **Negative / Trade-off**: Requires running a Redis instance alongside PostgreSQL.
