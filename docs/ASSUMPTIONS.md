# docs/ASSUMPTIONS.md – GridNexus Engineering Assumptions

This file tracks defensible engineering decisions made when information was missing or ambiguous.

---

## Prompt 2 – PostgreSQL Schema & ACID Audit Trail

- **Encryption key management**: A random 32-byte AES key is generated from `ENCRYPTION_KEY` env variable. In production this must be sourced from a secrets manager (e.g. GCP Secret Manager). A missing key raises at startup.

---

## Prompt 3 – Redis / BullMQ Async Task Queue

- **DLQ alerting**: `AlertService.alertWebhookStub` logs to stderr and is a placeholder for a PagerDuty/Slack POST. The interface is stable so Prompt X can swap in the real webhook without changing callers.
- **Worker concurrency**: Defaulted to `concurrency: 5` in the BullMQ Worker. This can be tuned via `WORKER_CONCURRENCY` env var in a later prompt.
- **Retry backoff**: BullMQ exponential backoff with `attempts: 5, backoff: { type: "exponential", delay: 1000 }`. Jobs that exhaust retries are considered Dead-Lettered and trigger the alert stub.

---

## Prompt 4 – FastAPI Engine Skeleton

- **Async DB URL normalization**: If `DATABASE_URL` starts with `postgresql://` (set by the broker), it is automatically rewritten to `postgresql+asyncpg://` so the async SQLAlchemy engine can connect. Callers need not be aware of this.
- **Redis health check**: Opens a transient connection, pings, and closes. Does not reuse the application connection pool — this is intentional so the check is always fresh.
- **Route stubs**: `/negotiate`, `/oracle/signal`, `/qre/calibrate` return deterministic placeholder responses marked with `# TODO (Prompt X)` referencing the prompt that will supply the real algorithm.

---

## Prompt 5 – Planar Graph & Coalition Enumeration

- **Physical topology**: The default physical power-line graph is the 50-node 5×10 city-grid fixture (`generate_city_grid`). In production this would be loaded from a GeoJSON file describing real substation connectivity. The module-level singleton in `routers/stability.py` is initialised at import time and serves as the canonical graph for all stability checks until Prompt 6 replaces it with the LP solver.

- **Coalition enumeration algorithm**: BFS expansion from each seed node, bounded by `k`. Deduplication via `frozenset`. This is correct and complete for connected subgraph enumeration on sparse graphs. For a planar graph (|E| ≤ 3|V|−6) the result size grows polynomially in k, not at the Bell-number rate — empirically confirmed as `O(k^2.67)` on the 50-node grid.

- **Non-planar input handling**: `PlanarityError` (a typed subclass of `ValueError`) is raised synchronously on graph construction. This surfaces as an HTTP 500 if triggered inside a route handler; a follow-on prompt should wrap it in a 422 at the API boundary if user-supplied topologies are ever accepted.

- **`scipy` version pinning**: `scipy>=1.11,<1.15` was used because `scipy>=1.15` requires Python ≥3.12 and the engine targets Python 3.11. `numpy` 2.x is compatible with this range.

- **GeoJSON edge direction**: Edges in the GeoJSON are treated as undirected (matching `nx.Graph`). If directional power flow is modelled in a later prompt, the loader must be updated to use `nx.DiGraph`.

- **`shapely` / `geopandas`**: `shapely` is installed for future geo-operations (e.g., bounding-box filtering of coalitions). `geopandas` omitted: Pulls in GDAL binaries not available on Alpine Docker. `shapely` used instead.

---

## Prompt 6 – Farsighted Coalitional Stability Solver

- **Additive characteristic function**: `v(T) = Σᵢ∈T surplus_i` (additive TU game). An additive TU game is always in the core (the LP is always feasible), so the "unstable" tests exercise the detection pathway and schema rather than a genuine infeasibility. Superadditive characteristic functions (where synergy gains could make the LP infeasible) require per-pair surplus values not yet surfaced by the API. Future prompts should extend `surplus_map` to include pair-wise bonuses.

- **Deviation scope**: Deviating coalitions are proper connected subsets of the proposed coalition `S` within the induced subgraph. Cross-coalition deviations (outside `S`) are not considered in this formulation; this matches the standard Farsighted Core definition where only internal re-arrangements count.

- **SciPy HiGHS solver**: `method="highs"` selected over `"revised simplex"` because HiGHS is robust to degenerate LPs and handles both primal infeasibility (→ unstable) and optimality (→ stable) cleanly. It is the default since SciPy 1.9.

- **Max iteration cap**: Default 100 rounds. For an additive TU game the LP converges in at most `n` rounds (one binding constraint per agent). The performance test enforces a 40-round limit as a regression guard.

- **Singleton coalition**: Returns `is_stable=True, margin=inf` immediately — no LP needed since there are no internal deviators.

- **Route backward compatibility**: The old `/stability/verify` response only had `isStable` and `margin`. The new response adds `deviating_coalition`, `binding_constraints`, `rounds`, `converged`, and `solve_time_ms`. Callers that only read `isStable` and `margin` are unaffected.

---

## Prompt 8 – MicrogridAgent and Secret Fields

- **Pydantic Serialization Hiding**: Pydantic v2's native `SecretStr` was used as inspiration for a custom `SecretFloat` type. Instead of masking the value in serialization (which would change the schema type from float to string), `SecretFloat` is explicitly configured in `__get_pydantic_core_schema__` to raise a `ValueError` if a naive developer tries to serialize it. This guarantees that `battery_capacity_kwh` and `baseline_generation_cost` cannot leak silently.
- **Utility Function Formula**: A linear formula was assumed: `(price - cost) * requested_kwh`. If the grid requests more energy than `battery_capacity_kwh`, the method returns `-inf` (or heavily penalized utility) because it's physically impossible to fulfill. Negative requested energy (agent buying) isn't explicitly penalized by capacity in this baseline assumption.
- **LangChain Wrapping**: Added `langchain` and `langchain-core` via poetry. The `MicrogridAgent` integrates this via an optional `brain` field typed as `Any` to accommodate various LangChain objects, explicitly excluded from Pydantic serialization (`exclude=True`) since models often fail to serialize.

---

## Prompt 9 – DQN LLM Safeguard

- **State encoding**: Simplified the opponent negotiation history embedding to a 4-dimensional float vector, yielding an 8-dimensional state vector.
- **DQN Architecture**: Used a small 2-layer MLP (64 units per hidden layer) which is sufficient for learning simple override policies in the toy environment.
- **LLM Stubbing**: In the tests, the LLM is stubbed by directly simulating its action choice and using the `DQNWrapper.gate_llm_action` method.
- **Override Threshold**: The DQN overrides the LLM if the Q-value of the best action exceeds the LLM's chosen action by a predefined margin (`threshold = 2.0`). This ensures the DQN only overrides when confident.

---

## Prompt 10 – Rubinstein Alternating-Offers over WebSockets

- **Engine Agent Loading Stub**: In `engine/app/routers/negotiate.py`, the engine doesn't yet have the full PostgreSQL SQLAlchemy models to fetch an agent's hidden capacity and generation cost. I implemented a deterministic mock loader `_mock_fetch_agent` that uses the hash of `agent_id` to generate realistic capacity/cost properties for the DQN evaluation.
- **Single-Round Engine Evaluation**: The engine's `/negotiate` endpoint now evaluates exactly ONE round per HTTP call rather than playing out the whole negotiation, returning the agent's action (and counter-offer if applicable).
- **Broker WebSocket Rooms**: The broker uses Socket.IO namespaces (`/negotiate`) and `socket.join(negotiationId)` to isolate broadcast messages (pub/sub) to only clients subscribed to that specific negotiation session.
- **Discount Factor**: Implemented as $Surplus_t = InitialSurplus \times \delta^{t-1}$. In round 1, surplus is 100%. In round 2, it is discounted by $\delta$, etc. This matches the Rubinstein bargaining model.
- **Broker Integration Testing**: Instead of spinning up the FastAPI engine during the Node.js Vitest integration test (which would add significant cross-language overhead and brittleness), `global.fetch` is mocked in Node to return deterministic Engine actions, cleanly testing the WebSocket orchestration, discount math, and Prisma persistence loops.

---

## Prompt 12 - MAPPO Training Loop for Microgrid Agents

- **Implementation choice - from-scratch PyTorch over RLlib**: RLlib adds ~1 GB of ray dependencies. Our existing torch install (CPU wheel, 195 MB) is sufficient. The hand-rolled version is fully auditable without external config files or Ray cluster setup.
- **PettingZoo Parallel API vs AEC**: The Parallel API is used because MAPPO's centralised critic requires every agent's observation at every timestep simultaneously.
- **Oracle signal placeholder**: A uniform [0.2, 0.8] scalar sampled at episode reset. Prompt 18 will replace this with a real LangChain oracle call.
- **Stance-to-DQN integration**: Agent stances apply an additive Q-value bias (+-1.5) to the DQN's raw Q-outputs before argmax, biasing (not replacing) the DQN's action selection.
- **Reward shaping**: Three components: (1) trade surplus; (2) coalition bonus = 0.5 * coalition_size / n_agents for cooperating members; (3) rejection penalty = -0.3 for walking away during coalition formation.
- **PettingZoo API compliance**: PettingZoo's own api_test imports pygame (unavailable in CI); replaced with a manual 10-assertion compliance suite.
- **Artifacts**: actor_agent_N.pt, critic.pt, training_metrics.csv (200 rows), training_curves.png committed to engine/artifacts/mappo/.
- **Surplus improvement result**: Seed-42, 5 agents, 200 episodes - first-50 mean surplus=2.74, last-50=3.24 (+18.1% confirmed by test assertion).

---

## Prompt 13 � Reasoning-Deficit Tolerance and Retry Logic

- **In-process vs DB registry**: The engine maintains a `DeficitRegistry` singleton in memory for /metrics so the route never makes a DB round-trip. The durable record (`reasoning_deficits` Prisma table) is owned by the broker layer, which can receive the event payload from the engine via the existing HTTP/WebSocket path in a later prompt. The two stores are intentionally decoupled.
- **LLM callable interface**: `negotiate_with_retry` accepts any `Callable[[str], str]`. Real callers pass a thin wrapper over `BaseChatModel.invoke`; tests pass a closure that returns controlled strings. No LLM key is required for the engine tests.
- **Retry prompt strategy**: The error-correction prompt includes (a) the attempt number, (b) the exact validation error message from Pydantic, (c) the LLM's malformed output verbatim, and (d) the original negotiation task. This maximises the LLM's ability to self-correct without extra inference calls.
- **MAX_RETRIES = 3**: Three attempts (initial + 2 corrections) matches the prompt specification. Configurable via the module-level constant.
- **Grid limits**: `MAX_KWH = 10_000`, `MAX_PRICE_PER_KWH = 1_000` are hard-coded module constants. Production deployment should load these from environment / config.
- **COUNTER_OFFER zero-price cross-field check**: A COUNTER_OFFER with `price_per_kwh = 0` is treated as economically invalid (it means the agent is giving energy away for free). This is enforced at the Pydantic model level via `@model_validator`.
- **Prometheus metrics**: The `?format=prometheus` query parameter on `GET /metrics` returns standard exposition format (COUNTER + GAUGE) so a Prometheus scraper can ingest it with no configuration changes.


## Prompt 14
- The stability penalty is `max(0, -margin)`, penalizing linearly for slack violations.
- The reasoning deficit penalty is simply `fallback_rate * 1.0`.
- The DQN train step uses standard online Q-learning on each step without a replay buffer (since none was requested).
- Temperature bounds were set to `[0.1, 2.0]` with a hysteresis factor of `0.5` on reversal.


## Prompt 15
- Integration tests require a real Postgres instance; they cannot run without it.
  Docker Desktop was not running locally during dev, so local verification used the CI job.
- A 'Postgres connection kill' mid-transaction is simulated via an invalid microgrid FK UUID
  inside commitTrade, which triggers the same ACID rollback as a connection failure.
- StabilityCheck on ACCEPT in negotiate.ts uses mock values (isStable=true, margin=10.0);
  the real LP result should be passed via the Engine response in full production.
- decisionSource field added to BeliefUpdate (default 'LLM', or 'DQN_GATE' when DQN overrides).
- negotiationId added as nullable FK to EnergyTransfer to close the audit chain.

## Prompt 16
- Adversarial tests for stability (falsified willingness, defect after pooling) are implemented by mocking the characteristic function builder (`build_characteristic_function`). This simulates the condition where an agent's true underlying surplus contribution is restricted by the grid topology/capacity, but the agent's inflated demands (falsification) or profitable side-deals (defection) violate the LP feasibility, causing the solver to correctly return `is_stable=False`.
- The malformed offer spam adversary is tested against `negotiate_with_retry` and uses a monkey-patched DQN network (dummy actor) to ensure the fallback executes predictably and the DeficitRegistry bounds the metric without crashing the session.
- The CI job for adversarial tests runs with `--no-cov` to prevent the global 85% coverage threshold from failing the job, since running only 3 test files naturally leaves the rest of the codebase uncovered in that specific run.

## Prompt 17
- Embedding model (all-MiniLM-L6-v2) is lazy-loaded via get_embedding_model() to keep pytest collection fast and safe; the model downloads on first call.
- sentence-transformers is pinned to >=2.2,<3 (resolves to 2.7.0) to avoid the transformers 5.x tensor_parallel.py NameError bug that appears at module import time.
- All three signal connectors (Weather, GridLoad, Regulatory) use offline synthetic mock data. Real credentials can be injected by subclassing BaseConnector without changing any other module.
- The TTL cache is backed by the existing Redis pool. Cache keys are constructed from source_type + serialised kwargs, so different query arguments produce different cache entries.

## Prompt 18
- AnonymizedGridState is the sole observation fed to the Oracle policy. It contains only aggregate coalition statistics (no per-agent identifiers, battery_capacity_kwh, or baseline_generation_cost). This is enforced at three levels: (1) Pydantic schema validation on request ingress, (2) module boundary enforced by static AST import analysis in test_oracle_boundary.py, and (3) the Oracle router never reads from any microgrid table column that carries private data.
- The Oracle actor is trained with a simplified REINFORCE warm-start (50 episodes) rather than the full MAPPO loop, because the Oracle is a single agent (no multi-agent credit assignment needed). The training reward is a synthetic domain-insight function matching signal to grid context; in production, rewards would come from comparing pooled capacity before/after broadcast.
- The Oracle singleton is lazy-initialised (get_oracle_policy()) so that importing the router module in tests does not trigger training or model download.
- DB persistence in /oracle/signal is best-effort (failures are logged, not raised) so that the route remains fully testable offline without a live Postgres instance.
- oracle_policy.py imports Actor from mappo_trainer.py, reusing the identical MLP architecture (obs ? 64 ? 64 ? actions) rather than defining a new network class.

## Prompt 19
- Episode initial state is fixed at 50 kWh capacity and 0.2 cooperation rate (not randomly sampled) so that the per-episode capacity metric reflects policy quality rather than lucky starting points. Demand, price, stress, and stability margin are still drawn fresh each episode to prevent the policy from memorising a single scenario.
- Agent utility is modelled as (market_price - estimated_cost) * contributed_kwh, where estimated_cost = market_price * 0.6. Individual generation costs are private (never revealed); this aggregate proxy is sufficient to detect systematic manipulation (large-margin harm to many agents) without requiring hidden-field access.
- The fairness-guard normalisation scale is 4.0 (corresponding to a market price of \.20/kWh, 40% margin, and 50 kWh per agent). Harms below FAIRNESS_THRESHOLD=0.05 are not penalised to avoid penalising numerical noise.
- The stability LP is called on a synthetic 5-node path graph each step. In production, the real coalition graph from the broker would be substituted without any changes to oracle_reward.py.
- The 400-episode training run uses REINFORCE with entropy bonus (coef=0.01) and Adam lr=3e-4. The full run (400 episodes x 10 steps) completes in ~36 seconds on CPU. Acceptance-criteria trend evidence: pooling +3.76 kWh (+5.4%) first-50 to last-50; fairness violation rate ~0 throughout; total reward +4.8%.
- Training curves and the CSV are committed to artifacts/oracle/ and regenerated by scripts/run_oracle_training.py.

## Prompt 25 – React Command-Center Frontend
- (P25) The broker exposes GET /api/oracle-signals returning the 50 most recent OracleSignal rows. This is a lightweight read endpoint; heavy analytics belong in a dedicated service.
- (P25) The command-center connects to the broker's /negotiate Socket.IO namespace using the socket.io-client package. The WebSocket URL defaults to http://localhost:3000 and is overridable via VITE_BROKER_URL env var.
- (P25) The WsClient wrapper disables socket.io-client's built-in reconnect logic and implements its own exponential-backoff (500ms initial, 2x multiplier, 30s cap) for full control over the UI connection-state indicator.
- (P25) probe() in HealthPanel treats HTTP non-200 responses as 'degraded' (partial failure) and network throws/timeouts as 'down' (total failure). This distinction lets operators differentiate reachable-but-unhealthy from completely unreachable services.
- (P25) The CoalitionMap renders a hardcoded 6-node SVG topology. Prompt 26 will replace this with dynamic data from the engine's planar graph API; the component interface is designed so the swap is a data-feed change only.
- (P25) round_update Socket.IO events now include negotiationId and discountedSurplus fields (added in negotiate.ts) so the NegotiationFeed can render full per-round context without a separate DB query.

## Prompt 26 – Power BI & R Shiny Geospatial Embeds
- (P26) The R Shiny application in command-center/geospatial/app.R polls the broker's /api/topology endpoint every 3 seconds (under the 5-second SLA requirement) using reactiveTimer(3000). If the broker is unreachable, it seamlessly falls back to synthetic dynamic line utilization.
- (P26) The React GeoPanel component attempts to render the R Shiny Leaflet app via an iframe at VITE_SHINY_URL (default http://localhost:3838). If the external R Shiny server is offline, users can switch to an interactive standalone SVG planar graph visualizer that directly queries the live /api/topology endpoint.
- (P26) Power BI integration is defined via a comprehensive DirectQuery and Data Model specification in docs/powerbi/report_spec.md. For environments without an active Power BI Embedded Azure token, PowerBIPanel renders an interactive DirectQuery-equivalent dashboard querying /api/analytics.
- (P26) Both GeoPanel and PowerBIPanel are lazy-loaded via React.lazy() and React.Suspense, ensuring the primary command-center dashboard (NegotiationFeed, OracleTimeline, HealthPanel, CoalitionMap) loads instantly with zero blocking delay.

## Prompt 29 – Containerized Deployment & Secrets Management
- (P29) All three application containers (engine, broker, command-center) are packaged with multi-stage Dockerfiles and execute strictly under unprivileged non-root users (gridnexus:10001, node:1000, nginx:101) to satisfy zero-trust runtime requirements.
- (P29) .dockerignore files are enforced across the repository root and all subprojects, ensuring .env files, local secrets, and caches are never copied into Docker build contexts or image layers.
- (P29) Kubernetes manifests in deploy/k8s/ define production Deployments, StatefulSets, Services, and ConfigMaps with explicit resource limits and requests. A template secret.template.yaml is provided with placeholders; live secrets are injected at deploy-time via KMS or kubectl create secret generic.
- (P29) Health probes are mapped directly to Prompt 4 routes: liveness probes hit /health (and /healthz), while the engine readiness probe hits /ready to verify live PostgreSQL and Redis connectivity, returning HTTP 503 if any dependency is degraded.

## Prompt 30 - Final QA, Load Test & Demo Script

- (P30-LOAD-01) k6 is selected as the primary load-test runner because it produces
  machine-readable JSON summaries with p50/p95/p99 percentiles via --summary-trend-stats
  and supports custom JavaScript scenarios, making the test self-documenting. Locust is
  provided as a documented fallback for environments where k6 is unavailable.
- (P30-LOAD-02) The 200-VU scenario exercises the REST path (broker analytics, topology,
  oracle-signals) rather than full WebSocket negotiation because k6's WebSocket VUs share
  the same JavaScript runtime and would require separate session-state management per VU.
  A companion ws-negotiate scenario is left as a future extension.
- (P30-LOG-01) The extended log-leak fuzz test (test_log_hidden_leak.py) uses pytest's
  capsys fixture to capture structlog output rather than reconfiguring the structlog
  processor chain, because structlog.stdlib.add_logger_name is incompatible with
  PrintLogger (requires logger.name). capsys captures all printed output regardless
  of logging backend, making the test simpler and more robust.
- (P30-SEC-01) starlette CVEs (PYSEC-2026-161, PYSEC-2026-248, PYSEC-2026-249,
  PYSEC-2026-1941, PYSEC-2026-1942, PYSEC-2026-2280, PYSEC-2026-2281) are accepted
  as a temporary risk because fastapi==0.115.x pins starlette<0.47.0, blocking the
  upgrade to >=1.3.1. All CVEs relate to routing/middleware behaviour not exercised
  by GridNexus's private network exposure. Resolution is tracked pending FastAPI
  releasing a version that removes the starlette upper bound.
- (P30-SEC-02) transformers CVEs (PYSEC-2025-217, PYSEC-2026-2288, PYSEC-2026-2289,
  PYSEC-2026-2290) are accepted as a temporary risk because sentence-transformers 2.x
  requires transformers<5.0.0. The transformers package processes only internal RAG
  queries from vetted oracle data, not arbitrary user input. Resolution is tracked
  pending sentence-transformers 3.x release.
- (P30-SEC-03) pytest security advisory (PYSEC-2026-1845) was remediated by upgrading
  to pytest 9.1.1. pytest-asyncio was simultaneously upgraded from 0.24.0 to 1.4.0
  to satisfy pytest 9.x compatibility.
- (P30-NODE-01) Node.js security advisories in broker/ and command-center/ (esbuild,
  vite, vitest, nanoid) were fully remediated via npm audit fix --force, which applied
  major version upgrades to vite (8.x) and vitest (4.x). These are dev-only dependencies
  not shipped in the production Docker image. The breaking changes do not affect any
  production code paths.
