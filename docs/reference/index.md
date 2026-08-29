# GridNexus Module Reference

Comprehensive docstring-derived reference for all major modules across Layer 1 (Engine), Layer 2 (Broker), and Layer 3 (Command Center).

---

## Table of Contents

- [Layer 1: Mathematical & AI Core (Python / FastAPI)](#layer-1-engine)
  - [`engine.app.graph.planar_graph`](#engineappgraphplanar_graph)
  - [`engine.app.stability.stability_solver`](#engineappstabilitystability_solver)
  - [`engine.app.stability.separation_oracle`](#engineappstabilityseparation_oracle)
  - [`engine.app.rl.gridnexus_env`](#engineapprlgridnexus_env)
  - [`engine.app.rl.mappo_trainer`](#engineapprlmappo_trainer)
  - [`engine.app.rl.reward_fn`](#engineapprlreward_fn)
  - [`engine.app.rl.temperature_policy`](#engineapprltemperature_policy)
  - [`engine.app.agents.dqn_wrapper`](#engineappagentsdqn_wrapper)
  - [`engine.app.agents.microgrid_agent`](#engineappagentsmicrogrid_agent)
  - [`engine.app.qre.calibration`](#engineappqrecalibration)
  - [`engine.app.qre.qre_solver`](#engineappqreqre_solver)
  - [`engine.app.rag.resilience`](#engineappragresilience)
- [Layer 2: Event-Driven State Broker (Node.js / Express / TypeScript)](#layer-2-broker)
  - [`broker/src/ws/negotiate.ts`](#brokersrcwsnegotiatets)
  - [`broker/src/queues/oracleBroadcastQueue.ts`](#brokersrcqueuesoraclebroadcastqueuets)
  - [`broker/src/queues/integrityQueue.ts`](#brokersrcqueuesintegrityqueuets)
  - [`broker/src/queues/stabilityQueue.ts`](#brokersrcqueuesstabilityqueuets)
- [Layer 3: Geospatial Command Center (React / TypeScript / R Shiny)](#layer-3-command-center)
  - [`command-center/src/lib/wsClient.ts`](#command-centersrclibwsclientts)
  - [`command-center/src/components/GeoPanel.tsx`](#command-centersrccomponentsgeopaneltsx)
  - [`command-center/src/components/PowerBIPanel.tsx`](#command-centersrccomponentspowerbipaneltsx)

---

## Layer 1: Engine

### `engine.app.graph.planar_graph`
**File**: `engine/app/graph/planar_graph.py`  
**Purpose**: Planar-graph construction, verification, and polynomial coalition enumeration.

#### Key Functions
- `load_geojson(path: str | Path) -> nx.Graph`: Reads a GeoJSON FeatureCollection containing `Point` (microgrids) and `LineString` (power lines) geometries, builds a NetworkX graph, and checks Left-Right planarity.
- `verify_planarity(G: nx.Graph) -> nx.Graph`: Runs linear-time Left-Right planarity testing; raises `PlanarityError` if non-planar.
- `permissible_coalitions(graph: nx.Graph, k: int) -> list[frozenset]`: Computes all connected subgraphs of size $\le k$ via BFS expansion from each seed node. Bounded by polynomial $O(|V|^k)$ complexity due to planar sparsity ($|E| \le 3|V| - 6$).
- `build_from_adjacency(nodes: list[str], edges: list[tuple[str, str]]) -> nx.Graph`: Convenience helper for constructing and verifying planar graphs from adjacency lists.

---

### `engine.app.stability.stability_solver`
**File**: `engine/app/stability/stability_solver.py`  
**Purpose**: Row-Constraint-Generation Linear Program solving for Farsighted Coalitional Stability.

#### Key Functions
- `solve_stability(graph: nx.Graph, surplus_map: dict[str, float], k: int = 3) -> StabilityResult`: Formulates and solves the Master LP problem using cutting planes. Calls the separation oracle iteratively until no violating coalitional deviation exists.
- `verify_core_membership(allocation: dict[str, float], characteristic_fn: dict[frozenset, float]) -> bool`: Confirms that the allocated surplus satisfies all coalitional rationality inequalities $\sum_{i \in S} x_i \ge v(S)$.

---

### `engine.app.stability.separation_oracle`
**File**: `engine/app/stability/separation_oracle.py`  
**Purpose**: Separation oracle for identifying the most violated coalition inequality.

#### Key Functions
- `find_most_violating_deviation(graph: nx.Graph, current_allocation: dict[str, float], k: int) -> tuple[frozenset | None, float]`: Evaluates candidate connected coalitions and returns the subset $S^*$ with maximum positive deviation deficit $v(S^*) - \sum_{i \in S^*} x_i$.

---

### `engine.app.rl.gridnexus_env`
**File**: `engine/app/rl/gridnexus_env.py`  
**Purpose**: PettingZoo `ParallelEnv` implementing the multi-agent microgrid bargaining and VPP pooling environment.

#### Key Classes & Methods
- `GridNexusEnv(ParallelEnv)`: Multi-agent environment with simultaneous step execution.
  - `reset(seed=None, options=None)`: Reinitializes agent battery levels, reservation prices, and grid stress state.
  - `step(actions: dict[str, int])`: Advances state by processing joint bargaining stances (`CONCEDE`, `MAINTAIN`, `AGGRESSIVE`, `COOPERATIVE`).
  - `observation_space(agent: str)`: Returns Box observation space containing private battery state, price signals, and exogenous weather index.

---

### `engine.app.rl.mappo_trainer`
**File**: `engine/app/rl/mappo_trainer.py`  
**Purpose**: Multi-Agent PPO (MAPPO) with Centralized Training and Decentralized Execution.

#### Key Classes & Methods
- `MAPPOTrainer`: Manages centralized critic and decentralized actor networks.
- `train_step(batch)`: Computes generalized advantage estimation (GAE), actor surrogate loss, and centralized value function loss.

---

### `engine.app.rl.reward_fn`
**File**: `engine/app/rl/reward_fn.py`  
**Purpose**: Multi-objective reward function balancing total pooled energy surplus, pricing fairness, and coalition stability bonuses.

---

### `engine.app.rl.temperature_policy`
**File**: `engine/app/rl/temperature_policy.py`  
**Purpose**: Dynamic exploration temperature decay and Boltzmann action selection policy.

---

### `engine.app.agents.dqn_wrapper`
**File**: `engine/app/agents/dqn_wrapper.py`  
**Purpose**: Deep Q-Network safety wrapper and action-masking gate for LLM bargaining agents.

#### Key Classes & Methods
- `DQNWrapper`:
  - `evaluate_action(state: np.ndarray, proposed_action: str) -> ActionValidationResult`: Evaluates candidate LLM action against estimated Q-values $Q(s, a)$.
  - `mask_dominated_actions(state: np.ndarray) -> list[str]`: Returns allowable actions strictly excluding dominated walk-aways or negative-surplus concessions.
  - `fallback_action(state: np.ndarray) -> str`: Selects greedy $\arg\max_a Q(s, a)$ when LLM retries are exhausted.

---

### `engine.app.agents.microgrid_agent`
**File**: `engine/app/agents/microgrid_agent.py`  
**Purpose**: LangChain-powered autonomous microgrid bargaining agent.

#### Key Classes & Methods
- `MicrogridAgent`:
  - `propose_initial_offer(surplus_kwh: float, reservation_price: float) -> NegotiationOffer`: Formulates initial opening price and requested quantity.
  - `respond_to_offer(incoming_offer: NegotiationOffer, context: MarketContext) -> NegotiationAction`: Generates structured LLM response (`ACCEPT`, `COUNTER_OFFER`, or `WALK_AWAY`) grounded in private battery capacity constraints.

---

### `engine.app.qre.calibration`
**File**: `engine/app/qre/calibration.py`  
**Purpose**: Maximum Likelihood Estimation (MLE) of bounded-rationality parameter $\lambda$.

#### Key Functions
- `calibrate_lambda(observed_actions: list[int], payoffs: np.ndarray) -> float`: Optimizes log-likelihood of observed bargaining decisions under the Boltzmann logit choice model.

---

### `engine.app.qre.qre_solver`
**File**: `engine/app/qre/qre_solver.py`  
**Purpose**: Fixed-point solver for Logit Quantal Response Equilibrium.

#### Key Functions
- `solve_qre(payoff_matrix: np.ndarray, lambda_param: float) -> np.ndarray`: Solves the fixed-point Quantal Response Equilibrium system.

---

### `engine.app.rag.resilience`
**File**: `engine/app/rag/resilience.py`  
**Purpose**: Resilient exogenous data connectors with circuit breakers and fallback distributions.

#### Key Classes & Methods
- `ResilientConnector`: Wraps external weather and grid telemetry APIs with automatic retry, jitter, and fallback to historical baseline models on upstream failure.

---

## Layer 2: Broker

### `broker/src/ws/negotiate.ts`
**File**: `broker/src/ws/negotiate.ts`  
**Purpose**: WebSocket Socket.IO `/negotiate` namespace implementing the Rubinstein alternating-offers bargaining loop.

#### Key Handlers
- `setupNegotiationNamespace(io: Server)`: Configures `/negotiate` connection lifecycle, handles `start_negotiation`, verifies belief update status with `BeliefUpdateService`, executes round-by-round engine queries, invokes `StabilityGate.check()`, and calls `commitTrade()` on transaction settlement.

---

### `broker/src/queues/oracleBroadcastQueue.ts`
**File**: `broker/src/queues/oracleBroadcastQueue.ts`  
**Purpose**: BullMQ task queue running periodic Grid Oracle weather and grid-stress broadcasts.

#### Key Functions
- `scheduleOracleBroadcast()`: Registers recurring cron job executing oracle evaluations against `/oracle/signal` on the engine and persisting broadcasts to PostgreSQL `oraclesignals`.

---

### `broker/src/queues/integrityQueue.ts`
**File**: `broker/src/queues/integrityQueue.ts`  
**Purpose**: BullMQ audit trail integrity verification queue.

#### Key Functions
- `scheduleIntegrityCheck()`: Executes hourly cryptographic checksum hashing over `energytransfers`, `beliefupdates`, and `stabilitychecks` tables, logging snapshots in `integrity_snapshots`.

---

### `broker/src/queues/stabilityQueue.ts`
**File**: `broker/src/queues/stabilityQueue.ts`  
**Purpose**: BullMQ asynchronous task queue for offloading heavy LP stability calculations.

---

## Layer 3: Command Center

### `command-center/src/lib/wsClient.ts`
**File**: `command-center/src/lib/wsClient.ts`  
**Purpose**: Managed WebSocket client wrapping `socket.io-client` with exponential-backoff reconnection and reactive state.

#### Key Exports
- `createWsClient(brokerUrl: string) -> WsClient`: Instantiates a managed connection with custom backoff (500ms initial, 2x multiplier, 30s cap) and reactive `.onStateChange()` atom.

---

### `command-center/src/components/GeoPanel.tsx`
**File**: `command-center/src/components/GeoPanel.tsx`  
**Purpose**: Lazy-loaded panel embedding R Shiny Leaflet app and interactive standalone planar graph visualizer.

---

### `command-center/src/components/PowerBIPanel.tsx`
**File**: `command-center/src/components/PowerBIPanel.tsx`  
**Purpose**: Lazy-loaded panel embedding Power BI DirectQuery report or native audit analytics dashboard.
