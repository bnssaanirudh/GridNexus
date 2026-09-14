# GridNexus Q1 Journal + Patent Antigravity Prompt Pack

Use these prompts **in order**. Do not ask Antigravity to simply “make GridNexus Q1-worthy and patentable.” The project should progress through engineering validity, scientific validation, experiments, evidence, and only then writing.

**Important:** Q1 acceptance cannot be guaranteed, and an AI coding agent cannot determine legal patentability. Keep the genuinely new patent-specific corrective-settlement work private until you have made a filing decision.

---

## PHASE 0 — Global Master Instruction

### PROMPT 0 — Global master instruction

```text
You are the principal research engineer, senior distributed-systems engineer, power-systems researcher, multi-agent reinforcement-learning researcher, mechanism-design researcher, QA engineer, and reproducibility auditor for GridNexus.

Repository:
https://github.com/bnssaanirudh/GridNexus

MISSION

Transform GridNexus from an advanced research prototype into:

A. a scientifically defensible Q1-journal-grade research system, and
B. a technically grounded patent candidate based on a new cyber-physical corrective-settlement mechanism.

IMPORTANT:

Do not treat "more features" as progress.

The target scientific contribution is:

"Coalition-Stable Safe Multi-Agent Reinforcement Learning for Network-Constrained Peer-to-Peer Energy Trading."

The target patent-oriented technical contribution is:

"Topology-Aware Dual-Certificate Corrective Settlement for Distributed Energy Transactions."

GLOBAL RULES

1. Never fabricate experimental results.
2. Never hard-code desirable values for metrics.
3. Never label simulated values as empirical measurements.
4. Never modify generated CSV values simply to make results look better.
5. Never claim a test passed unless it actually ran and passed.
6. Never claim Q1 readiness merely because code exists.
7. Never claim patentability.
8. Clearly distinguish:
   - implemented,
   - tested,
   - experimentally validated,
   - mathematically proven,
   - heuristic,
   - proposed only.
9. Use tests before or alongside implementation.
10. Preserve reproducibility.
11. Record seeds, configurations, environment versions and commit hashes.
12. Do not silently catch scientific errors and substitute default values.
13. Fail loudly if an experiment is scientifically invalid.
14. Avoid placeholder metrics.
15. Avoid synthetic "SUCCESS" statements unless every required validation actually passed.
16. Do not remove negative experimental findings.
17. Negative results must remain available and documented.
18. Every quantitative paper claim must eventually map to reproducible raw evidence.
19. Do not break existing working features unnecessarily.
20. Prefer small commits with descriptive messages.
21. Preserve backward compatibility where reasonable.
22. Add typing, validation and tests for critical scientific paths.
23. Avoid unrelated refactoring.
24. Check the actual latest repository state before assuming older findings are still true.

PATENT CONFIDENTIALITY RULE

The existing public repository may continue to contain already-public work.

However, genuinely NEW patent-specific components including:
- corrective transaction projection,
- state-bound dual certificates,
- topology-change certificate invalidation,
- closed-loop physical redispatch,
- post-dispatch telemetry rollback,
- hierarchical physical certification optimizations developed specifically for the new invention

must NOT be pushed to a public remote without explicit user authorization.

Create them in a local/private branch or private repository.

Do not create a public PR containing undisclosed patent-specific material.

CORE RESEARCH SYSTEM

The final system should investigate this central question:

Can a multi-agent energy market jointly maintain:
1. high economic welfare,
2. nonlinear electrical-network feasibility,
3. coalition stability,
4. fairness,
5. robustness against strategic manipulation,
6. scalability?

CORE ALGORITHM TARGET

Implement and evaluate:

CS-SafeMAPPO
Coalition-Stable Safe Multi-Agent Proximal Policy Optimization.

The intended objective should conceptually combine:

J = economic reward
    - physical-safety cost
    - coalition-instability cost
    - optional fairness cost

using scientifically justified constrained-RL techniques rather than arbitrary penalties wherever possible.

EXPECTED FINAL EVIDENCE

The final package should include:

- green CI,
- deterministic unit/integration tests,
- trained Random/IPPO/MAPPO/SafeMAPPO/CS-SafeMAPPO baselines,
- nonlinear grid validation,
- exact small-N coalition verification,
- properly labeled approximate large-N verification,
- manipulation/adversarial experiments,
- multi-seed experiments,
- statistical significance/effect sizes,
- ablation studies,
- scaling experiments,
- raw CSV/JSON results,
- experiment manifests,
- figures,
- tables,
- claim-evidence ledger,
- reproducibility command,
- journal-ready technical documentation,
- separate patent evidence package.

WORKFLOW

Before changing code:

1. fetch repository state;
2. inspect all branches;
3. identify current default branch;
4. compare main, v1.0-completion and relevant feature branches;
5. inspect CI;
6. inspect current results;
7. produce a short implementation-status report;
8. create a safe working branch.

Do NOT begin broad implementation until repository state is understood.

For every subsequent task report:

FILES CHANGED
TESTS RUN
TEST RESULTS
SCIENTIFIC ASSUMPTIONS
KNOWN LIMITATIONS
REMAINING WORK
COMMIT HASH

Wait for the next task after completing each requested phase.
```

---

# PHASE I — Make the Existing Project Trustworthy

## PROMPT 1 — Complete branch and repository audit

```text
Perform a fresh forensic audit of the entire GridNexus repository before modifying anything.

Inspect:

- main
- v1.0-completion
- every feature/fix branch
- commit history
- open pull requests if accessible
- GitHub Actions
- Docker Compose
- engine
- broker
- command-center
- agent-node
- tests
- experiment scripts
- generated results
- trained models
- documentation
- manuscript-related artifacts

Compare branches using actual commit ancestry and diffs.

Determine:

1. which branch currently contains the most complete implementation;
2. which improvements are already merged;
3. which branches are obsolete;
4. which branches genuinely contain unique useful changes;
5. what is broken;
6. what is untested;
7. what research claims are currently supported;
8. what claims are currently unsupported;
9. what experiments are scientifically invalid;
10. what code paths are dormant.

Do NOT modify code yet.

Create:

docs/research/current_state_audit.md

It must contain a matrix:

Component | Implemented | Tested | Validated | Claim-safe | Problems | Priority

Also produce a prioritized P0/P1/P2 remediation list.

Do not infer success from file names or comments. Inspect implementation and tests.

Finish only after reporting the exact branch/commit that should become the engineering baseline.
```

## PROMPT 2 — Create safe development structure

```text
Using the audit from the previous task, establish a clean development structure.

For PUBLIC Q1 research work create a branch such as:

research/q1-cs-safemappo

based on the most technically complete verified public branch.

For NEW PATENT-SPECIFIC work create a LOCAL OR PRIVATE branch such as:

patent/dual-certificate-corrective-settlement

Do NOT push the patent branch to a public remote.

Document the branch strategy in:

docs/research/branch_strategy.md

Include:

- base commit,
- public research branch,
- private patent branch,
- merge policy,
- experiment-tagging policy,
- release-tagging policy.

Do not rewrite repository history.

Verify the working tree is clean before proceeding.
```

## PROMPT 3 — Repair CI completely

```text
Make the Q1 research branch CI-clean.

Inspect every failing workflow and fix root causes, not symptoms.

Required areas:

ENGINE
- Python dependency installation
- lockfile/project consistency
- linting if configured
- unit tests
- integration tests
- adversarial tests

BROKER
- dependency installation
- Prisma migrations
- PostgreSQL test environment
- Redis test environment
- Jest tests
- worker tests

COMMAND CENTER
- TypeScript
- lint
- tests
- build

DOCKER
- docker-compose build
- service startup
- health checks
- broker-worker startup
- database readiness
- Redis readiness

INTEGRATION
- negotiation path
- stability gate
- grid gate
- joint gate
- settlement
- DER-owner flow
- tenant isolation

Do not disable failing tests merely to obtain green CI.

Do not add blanket continue-on-error.

Do not weaken assertions.

If a test is obsolete, demonstrate why before replacing it.

Create:

docs/research/ci_validation.md

Record every failing job found and its resolution.

Acceptance criterion:

All required CI jobs that represent production/research correctness must actually pass.
```

---

# PHASE II — Fix the Scientific Blockers

## PROMPT 4 — Fix encrypted private-value flow

```text
Audit private economic parameter handling end-to-end.

Current intended flow is approximately:

DER owner
→ broker
→ encrypted database field
→ negotiation/stability computation
→ settlement.

Determine whether encrypted numeric values such as generation cost, battery capacity or other hidden parameters are being interpreted correctly by the engine.

The system must NEVER do this:

encrypted string
→ float conversion fails
→ silently substitute arbitrary default.

Design a secure explicit contract.

Preferred architecture:

broker owns decryption authorization;
engine receives only the minimum validated numeric values required for computation through an authenticated internal API/message contract.

Requirements:

1. no plaintext secrets written to logs;
2. no silent numerical fallback;
3. schema validation;
4. authorization boundary;
5. authenticated service communication if already supported;
6. tests proving encrypted stored values influence the calculation correctly;
7. corruption/decryption failure produces explicit error;
8. audit trail without leaking secrets.

Add unit and integration tests.

Document threat model and data flow.

Do not weaken encryption merely to make integration easier.
```

## PROMPT 5 — Participant → DER → bus electrical binding

```text
Implement a rigorous participant-to-physical-grid mapping.

Every market participant participating in a trade must map to:

participant_id
DER_id
bus_id
resource_type
P limits
Q limits
SOC state if storage
availability
telemetry timestamp

A transaction must produce physically meaningful electrical injections.

Implement:

seller/buyer transaction
→ DER quantities
→ bus injections
→ delta P
→ delta Q where applicable
→ network model.

Remove equal-dispatch shortcuts from scientific validation paths unless explicitly used as a named baseline.

Validate:

- nonexistent DER,
- nonexistent bus,
- duplicate mapping,
- stale telemetry,
- unavailable DER,
- power beyond limits,
- storage SOC violation.

Add deterministic tests using a small known network.

Document the mapping contract.
```

## PROMPT 6 — Correct stability semantics

```text
Refactor coalition-stability verification so outputs never overstate mathematical certainty.

Implement explicit result classes/status values:

EXACT_STABLE
BLOCKING_COALITION_FOUND
HEURISTIC_NO_VIOLATION_FOUND
UNVERIFIED
ERROR

For exact small-N verification report:

- number of coalitions examined,
- maximum coalition excess,
- blocking coalition if present,
- tolerance,
- solver information,
- runtime.

For scalable heuristic/separation-oracle verification report:

- search strategy,
- number of candidate coalitions examined,
- seeds,
- depth,
- best excess found,
- runtime,
- search budget.

Never return stable=true merely because no violation was found by a heuristic search.

Remove any size-based shortcut that automatically labels large systems stable.

Add tests demonstrating the distinction.

Update API schemas and downstream broker logic accordingly.
```

## PROMPT 7 — Build a proper coalition stability metric

```text
Implement a scientifically meaningful coalition-instability metric.

For allocation x and characteristic function v(C), calculate coalition excess:

e(C,x) = v(C) - sum_{i in C} x_i

Define:

epsilon_coal = max_C e(C,x)

for exact tractable cases.

For large cases calculate and label the best detected lower-bound/heuristic excess according to the separation oracle.

Expose:

maximum_excess
blocking_coalition
num_candidates_checked
verification_mode
epsilon_tolerance

Write unit tests on hand-constructed cooperative games where the true answer is analytically known.

These tests should include:

- stable core allocation,
- unstable allocation,
- multiple blocking coalitions,
- numerical tolerance boundary.
```

## PROMPT 8 — Rebuild joint physical/economic verification

```text
Refactor the current joint gate into a coherent verification pipeline.

Target flow:

TradeProposal
→ schema validation
→ participant/DER/bus resolution
→ economic value construction
→ coalition-stability check
→ physical dispatch construction
→ DC/SOCP/AC feasibility check
→ structured decision.

Return:

APPROVED
CORRECTION_REQUIRED
REJECTED_ECONOMIC
REJECTED_PHYSICAL
UNVERIFIED
ERROR

Each result must contain machine-readable reasons.

Do not use unrelated hard-coded seller/buyer values.

Physical verification must use actual trade-derived bus injections.

Economic verification must use validated participant parameters.

Add integration tests connecting broker and engine.
```

---

# PHASE III — Remove Invalid Evidence

## PROMPT 9 — Delete the artificial 34% → 0% result

```text
Audit the patent technical-effect experiment and every documentation/paper claim derived from it.

Any experiment that predetermines:

baseline_violation = condition
gridnexus_violation = false

without actually executing physical validation is scientifically invalid.

Remove such fabricated/predetermined outcome logic.

Do NOT preserve a desired 34% → 0% number.

Replace the experiment with an actual evaluation where every proposed trade passes through the real grid verification pipeline.

For every trade record:

scenario_id
seed
trade
seller DER
buyer DER
bus mapping
before-state
proposed injection
power-flow method
convergence
voltage violation
thermal violation
SOC violation
corrected action if applicable
final outcome
runtime

Regenerate results only from execution.

Update documentation to explicitly state that previous predetermined technical-effect numbers were invalid and superseded.

Do not conceal the correction.
```

## PROMPT 10 — Build research result provenance

```text
Create an immutable experiment provenance system.

Every experiment run must generate a manifest containing:

experiment_name
UTC timestamp
git_commit
git_dirty
Python version
Node version if relevant
package versions
OS
device
GPU
seed
configuration
dataset/network
algorithm
checkpoint hash
output files
runtime
status

Store manifests beside experiment results.

Raw results must not be overwritten silently.

Use unique run directories.

Create a validator that checks:

- required metadata exists,
- result files exist,
- seeds are recorded,
- commit is known,
- checkpoint hashes match,
- summary tables correspond to raw runs.

Add tests for the validator.
```

---

# PHASE IV — Redesign the MARL Environment

## PROMPT 11 — Audit the current MARL environment

```text
Perform a scientific audit of the current GridNexus PettingZoo/MARL environment.

Do not modify it yet.

Examine:

state space
observations
actions
transition dynamics
coalition representation
market-clearing behavior
reward function
physical constraints
battery dynamics
forecast uncertainty
counter-offers
JOIN/LEAVE behavior
termination
agent heterogeneity
future utility
switching costs.

Answer:

1. Does coalition formation genuinely change economic outcomes?
2. Does JOIN have meaningful consequences?
3. Is coalition membership persistent?
4. Are payments coalition-dependent?
5. Does network topology affect rewards/actions?
6. Are storage dynamics temporally correct?
7. Can strategic manipulation occur?
8. Can an agent benefit from long-term farsighted coalition decisions?
9. Are constraints merely post-processing?
10. Is the environment Markov-consistent?

Create:

docs/research/marl_environment_audit.md

Then propose a revised environment specification.

Do not implement until the specification is internally consistent.
```

## PROMPT 12 — Implement GridNexus research environment v2

```text
Implement a new research environment without destroying the legacy environment.

Name it clearly, for example:

GridNexusMarketEnvV2

The environment must support genuine temporal coalition bargaining.

STATE should include as appropriate:

- local demand
- local generation
- forecast
- DER constraints
- battery SOC
- current price
- market history
- coalition membership
- coalition allocation
- relevant network state
- congestion indicators
- previous commitments
- uncertainty indicators.

ACTIONS should meaningfully support:

- BUY/SELL quantity
- price/bid parameters
- JOIN coalition
- LEAVE coalition
- ACCEPT
- REJECT
- COUNTER-OFFER
- storage dispatch where applicable.

Transitions must update:

- coalition membership,
- energy positions,
- SOC,
- market commitments,
- physical state,
- payment/allocation state.

Rewards must be decomposable into:

economic utility
physical safety cost
coalition stability cost
fairness component if used
switching/transaction cost.

Return each reward component separately for analysis.

Do not hide reward terms inside one opaque scalar.

Write deterministic environment tests.
```

---

# PHASE V — Establish Baselines First

## PROMPT 13 — Create robust baseline framework

```text
Implement a common policy/training/evaluation interface for:

1. Random
2. Rule-based market policy
3. IPPO
4. MAPPO
5. SafeMAPPO
6. CS-SafeMAPPO

Design the interface so additional baselines such as MASAC/MADDPG or optimization-based methods can be added without changing the evaluator.

All algorithms must receive the same scenario when compared.

All stochastic algorithms must use controlled seeds.

Evaluation must be separate from training.

Checkpoints must contain metadata.

Do not compare trained GridNexus against randomly initialized IPPO or MAPPO.

If a checkpoint is missing, the experiment must FAIL or explicitly label the model UNTRAINED.

Never silently continue with random initialization.
```

## PROMPT 14 — Properly train and validate IPPO

```text
Make IPPO a genuine trained baseline.

Implement/review:

actor network
critic/value network
GAE
PPO clipping
entropy
mini-batches
advantage normalization
checkpointing
evaluation
deterministic seed handling.

Train using the same environment and reasonable compute budget as the main models.

Generate:

training curves
evaluation curves
checkpoints
hyperparameter manifest
seed-specific output
aggregate metrics.

Add a sanity scenario where IPPO should learn better than random.

Do not claim the implementation works based only on decreasing loss.
```

## PROMPT 15 — Revalidate MAPPO

```text
Audit and retrain MAPPO on the new research environment.

Verify:

centralized critic
decentralized actors
correct observation/action shapes
correct done handling
GAE
value clipping if used
entropy
gradient clipping
advantage normalization
checkpoint save/load
evaluation without exploration leakage.

Run learning sanity tests.

Create trained MAPPO checkpoints for all final benchmark seeds.

Never use legacy checkpoint results in the new paper unless environment/configuration compatibility is proven.
```

---

# PHASE VI — Build the Actual Research Algorithm

## PROMPT 16 — Implement SafeMAPPO

```text
Implement SafeMAPPO as a constrained-RL baseline.

The physical safety signal must come from actual model constraints, including as relevant:

voltage violations
thermal loading
battery SOC
power balance
invalid dispatch
non-convergent physical state.

Do not merely add arbitrary reward penalties and call it constrained RL.

Implement a principled constrained approach such as a Lagrangian/primal-dual formulation where appropriate.

Track separately:

reward objective
constraint cost
dual variables
constraint violations.

Document equations in:

docs/research/safemappo_method.md

Create analytical/small deterministic tests proving constraint costs are triggered when expected.
```

## PROMPT 17 — Implement CS-SafeMAPPO

```text
Implement the principal proposed algorithm:

CS-SafeMAPPO
Coalition-Stable Safe Multi-Agent PPO.

Combine:

1. economic objective;
2. physical safety constraint;
3. coalition-deviation constraint;
4. optional fairness regularization only if scientifically justified.

Use coalition excess:

epsilon_coal = max_C [v(C) - sum_{i in C} x_i]

for exact tractable settings.

For large settings use the scalable separation oracle while clearly distinguishing approximate verification.

The algorithm must expose:

economic return
physical constraint cost
coalition-instability cost
maximum detected excess
fairness metrics
dual variables
constraint satisfaction rate.

Do not merely call the existing MAPPO after a stability gate and rename it CS-SafeMAPPO.

Coalition/safety information must actually affect learning or constrained action selection.

Document the algorithm with:

pseudocode
objective
constraints
complexity
assumptions
failure modes.

Add targeted tests.
```

---

# PHASE VII — Payment / Mechanism Design

## PROMPT 18 — Strengthen allocation and payment mechanism

```text
Audit the current proportional, Nash and Shapley allocation mechanisms.

Implement a coalition-resistant payment/allocation baseline such as:

- least-core,
- nucleolus approximation,
- core-selecting payment,
or another defensible method suitable for the GridNexus formulation.

Do not claim strategy-proofness unless mathematically demonstrated.

Measure:

individual rationality
budget balance
coalition excess
fairness
social welfare
manipulation regret
runtime.

For small games, validate results against analytically known examples.

For large games, document approximation status.

Keep every allocation mechanism selectable through one common interface.
```

---

# PHASE VIII — Patent-Specific Invention

**Run Prompts 19–23 only on the private/local patent branch.**

## PROMPT 19 — Design corrective settlement

```text
CONFIDENTIAL PATENT DEVELOPMENT TASK.

Do not push this work to a public remote.

Design and implement a new cyber-physical corrective-settlement controller.

Current simple behavior:

trade proposal
→ verify
→ approve/reject.

New behavior:

trade proposal
→ resolve physical resources
→ evaluate economic stability
→ evaluate electrical constraints
→ if infeasible, compute the nearest feasible economically acceptable corrected transaction
→ reverify
→ generate certified DER setpoints
→ dispatch/return control instruction.

Formulate corrective projection approximately as:

minimize distance(corrected_action, proposed_action)
+ economically justified correction costs

subject to:

power balance
DER limits
SOC constraints
voltage bounds
thermal bounds
network feasibility
market constraints
coalition/stability constraints where tractable.

Implement as a separate well-defined component.

Do not claim novelty or patentability in code/comments.

Document technical behavior and interfaces.
```

## PROMPT 20 — Hierarchical physical certification

```text
CONFIDENTIAL PATENT DEVELOPMENT TASK.

Implement hierarchical electrical feasibility certification to avoid unnecessarily running expensive AC power flow for every harmless transaction.

Design stages such as:

Stage 1:
cheap analytical/DC screening.

Stage 2:
convex/SOCP network check where appropriate.

Stage 3:
full AC power-flow validation for uncertain/critical cases.

The routing decision must be scientifically justified and configurable.

Measure:

false-safe rate
false-reject rate
verification latency
AC invocation rate
total computational cost.

The final safety-critical decision must never rely on a lower-fidelity stage when that stage cannot guarantee the necessary condition.

Add unit/integration tests.
```

## PROMPT 21 — Dual certificate

```text
CONFIDENTIAL PATENT DEVELOPMENT TASK.

Create a state-bound dual-certificate structure.

The certificate should bind the approved/corrected transaction to relevant state including:

trade ID
participants
DER IDs
bus IDs
transaction quantity
corrected quantity if applicable
topology identifier/hash
telemetry timestamp/window
economic stability status/margin
physical feasibility status/margins
solver/method
model version
configuration version
certificate timestamp
integrity hash/signature mechanism appropriate to current architecture.

Settlement must refuse stale/inconsistent certificates.

Do not store secrets inside the certificate.

Add tamper tests and stale-state tests.
```

## PROMPT 22 — Topology / telemetry invalidation

```text
CONFIDENTIAL PATENT DEVELOPMENT TASK.

Implement certificate invalidation when the physical state used for verification is no longer sufficiently valid.

Examples:

topology changed
line unavailable
DER became unavailable
telemetry exceeded freshness window
SOC changed beyond tolerance
power injection deviated beyond tolerance.

Behavior:

certificate
→ state mismatch
→ invalidate
→ recompute feasibility
→ correct/reissue or reject.

Implement deterministic state-versioning.

Add tests proving an old certificate cannot authorize settlement against incompatible network state.
```

## PROMPT 23 — Closed-loop rollback / re-dispatch

```text
CONFIDENTIAL PATENT DEVELOPMENT TASK.

Extend corrective settlement into closed-loop physical-state verification.

After an approved dispatch, compare expected versus measured/updated physical state.

Define an explicit residual or deviation measure.

If deviation exceeds configured safety tolerance:

1. suspend/finalize settlement according to transactional state machine;
2. invalidate certificate;
3. recompute safe dispatch;
4. issue corrective DER setpoints;
5. reverify;
6. record the full auditable transition.

Do not pretend simulated telemetry is physical hardware evidence.

Keep simulation, HIL and real telemetry modes explicitly distinct.

Implement failure-safe behavior.
```

---

# PHASE IX — Real Experimental Benchmark Infrastructure

## PROMPT 24 — Standard grid benchmark suite

```text
Build a standardized GridNexus benchmark suite.

Include open, reproducible power-system networks where licensing permits.

Target at least:

IEEE-style 33-bus
69-bus
123-bus or appropriate available equivalent

and optionally a larger network for scalability.

For each network define:

bus data
line/branch data
loads
DER locations
renewable profiles
storage
limits
scenario generator.

Validate that the power-flow solver produces sensible baseline states before attaching MARL.

Document dataset/source/provenance.

Do not fabricate IEEE parameters.
```

## PROMPT 25 — Scenario generator

```text
Build a reproducible factorial scenario generator.

Variables should include:

agent count:
25, 50, 100, 250, 500, 1000 where computationally feasible.

renewable penetration:
20%, 40%, 60%, 80%, 100%.

forecast error:
0%, 5%, 10%, 20%, 30%.

malicious/strategic agent fraction:
0%, 5%, 10%, 20%, 30%.

storage penetration:
none, low, medium, high.

network topology/scenario:
radial, weakly meshed, meshed where physically meaningful.

demand level:
low, nominal, peak.

All scenarios must be generated from a recorded seed.

Generate scenario manifests independent of algorithms so every algorithm receives exactly the same test case.
```

---

# PHASE X — Adversarial Robustness

## PROMPT 26 — Sybil benchmark

```text
Convert the existing Sybil experiment from a single toy example into a proper parameter sweep.

Vary:

number of identities
capacity split
bidding strategy
market concentration
coalition size
network location
pricing environment
random seed.

Measure:

honest utility
attack utility
attack gain
market welfare impact
fairness impact
coalition stability
physical violations.

Report distributions and confidence intervals.

Do not generalize "Sybil resistant" from a single negative attack gain.
```

## PROMPT 27 — Collusion benchmark

```text
The previous simple collusion result indicated that collusion can be highly profitable.

Do not hide this.

Turn it into a rigorous research experiment.

Vary:

colluding fraction
coalition composition
bid coordination
geographical/network proximity
market concentration
demand level
renewable uncertainty.

Compare:

baseline market
MAPPO
SafeMAPPO
CS-SafeMAPPO
coalition-resistant payment mechanism.

Measure collusion gain:

G_collusion =
combined utility under collusion
-
combined honest utility.

Also measure:

welfare
fairness
physical safety
prices
blocking coalitions.

Determine where the proposed mechanism succeeds and where it fails.
```

## PROMPT 28 — Misreporting benchmark

```text
Build a systematic strategic misreporting benchmark.

Allow agents to perturb private values such as:

cost
capacity
generation forecast
storage availability
reservation value

within explicit attack models.

Measure manipulation regret/gain.

Sweep perturbation magnitude.

Run multiple seeds.

Compare all relevant mechanisms.

Never claim strategy-proofness unless gains are theoretically impossible or sufficiently proven.

If profitable manipulation remains, report it.
```

---

# PHASE XI — Ablations and Baselines

## PROMPT 29 — Full ablation study

```text
Create a controlled ablation study for GridNexus.

Compare at minimum:

A. Random
B. Rule-based
C. IPPO
D. MAPPO
E. SafeMAPPO
F. CS-SafeMAPPO

Then proposed-system ablations:

G. CS-SafeMAPPO without coalition constraint
H. CS-SafeMAPPO without physical safety constraint
I. CS-SafeMAPPO without corrective projection
J. CS-SafeMAPPO without advanced allocation mechanism
K. full proposed system.

When practical include:

optimization/ADMM benchmark
MASAC or MADDPG benchmark
core-selecting non-RL mechanism.

Ensure common scenarios and seeds.

Output both raw per-run results and aggregated tables.
```

---

# PHASE XII — Statistics

## PROMPT 30 — Statistical analysis pipeline

```text
Implement a reproducible statistical-analysis pipeline.

For every primary metric report:

N
mean
standard deviation
median
95% confidence interval.

For primary paired algorithm comparisons, use a statistically appropriate paired test after checking assumptions.

Where applicable report:

effect size
adjusted p-values for multiple comparisons.

Do not mechanically use t-tests without checking whether they are suitable.

Separate:

exploratory metrics
primary hypothesis metrics.

Do not use statistical significance as a substitute for practical effect size.

Generate machine-readable tables plus publication-ready tables.
```

---

# PHASE XIII — Scalability

## PROMPT 31 — Scientific scalability benchmark

```text
Replace simplistic scaling demonstrations with a rigorous scaling benchmark.

Measure independently:

policy inference
coalition-value evaluation
exact stability verification
heuristic stability verification
DC screening
SOCP verification
AC verification
corrective projection
broker transaction
end-to-end settlement.

Sweep:

agents
grid size
coalition search budget
transaction concurrency.

Report:

median
p95
p99 latency
throughput
memory
CPU/GPU usage where available
solver failures.

Do not label an in-process ASGI benchmark as full end-to-end distributed-system throughput.

Explicitly identify benchmark scope.
```

---

# PHASE XIV — Metrics

## PROMPT 32 — Replace all placeholder metrics

```text
Search the entire repository for:

hard-coded metric values
placeholder zeroes
dummy fairness values
dummy stability margins
mock benchmark numbers
manually authored result values.

For every research metric, trace its computation to raw state.

Implement real metrics including:

social welfare
prosumer utility
energy cost
renewable utilization
curtailment
Jain fairness
Gini coefficient
maximum coalition excess
blocking coalition count
Sybil gain
collusion gain
misreporting gain/regret
voltage violation rate
thermal overload rate
AC convergence failure
SOC violation
network losses
settlement success
correction rate
verification latency.

Create unit tests for metrics using hand-calculable examples.
```

---

# PHASE XV — Reproducibility

## PROMPT 33 — One-command research reproduction

```text
Create a reproducibility CLI/script that does NOT make premature success claims.

It should support:

quick smoke reproduction
paper-table reproduction
full experiment reproduction
specific figure reproduction.

Example semantics:

gridnexus reproduce --quick
gridnexus reproduce --table 2
gridnexus reproduce --figure 4
gridnexus reproduce --full

Every stage must return:

PASS
FAIL
SKIPPED
MISSING_ARTIFACT
NOT_RUN

Never print:

"All research claims reproduced"

unless the script has programmatically verified every declared required artifact.

Document expected compute requirements.
```

---

# PHASE XVI — Claim / Evidence Ledger

## PROMPT 34 — Build claim-to-evidence system

```text
Create:

research/claims/claim_evidence.csv

For every quantitative or technical claim intended for the paper, record:

claim_id
claim_text
claim_type
algorithm
dataset/network
experiment_script
config
seeds
raw_result_files
aggregation_script
table_or_figure
commit_hash
verification_status
limitations.

Allowed verification statuses:

SUPPORTED
PARTIALLY_SUPPORTED
UNSUPPORTED
SUPERSEDED
NOT_TESTED.

Create a validator that fails release checks if a quantitative paper claim marked SUPPORTED has no raw evidence path.

Do not manually mark claims supported without verification.
```

---

# PHASE XVII — Patent Technical-Effect Experiments

## PROMPT 35 — Corrective-settlement technical-effect study

```text
CONFIDENTIAL PATENT DEVELOPMENT TASK.

Design a genuine technical-effect experiment comparing:

1. no physical gate;
2. reject-only AC verification;
3. SafeMAPPO;
4. corrective projection without hierarchical verification;
5. full dual-certificate corrective-settlement controller.

Measure:

voltage violations
thermal overloads
AC convergence
SOC violations
unsafe dispatch rate
successful settlements
corrected settlements
renewable curtailment
welfare retained after correction
verification latency
AC solver invocation rate
end-to-end latency.

Every number must derive from actual simulation execution.

Do not force the proposed method to produce zero violations.

If it fails, preserve the result.

Use multiple networks and multiple seeds.

Generate raw evidence suitable for a patent technical-effect appendix and research paper supplementary material.
```

## PROMPT 36 — Patent invention disclosure

```text
CONFIDENTIAL.

Prepare a technical invention disclosure for review by the inventors/patent professional.

Do NOT call the invention patentable.

Do NOT make legal conclusions.

Include:

1. technical problem;
2. limitations of conventional trade verification;
3. system architecture;
4. participant-to-DER-to-bus binding;
5. hierarchical physical certification;
6. coalition/economic certification;
7. corrective projection;
8. state-bound dual certificate;
9. topology/telemetry invalidation;
10. post-dispatch verification;
11. rollback/re-dispatch;
12. technical effects demonstrated experimentally;
13. alternative embodiments;
14. implementation variants;
15. diagrams needed;
16. inventor contribution questions;
17. already-public GridNexus material;
18. newly developed confidential material;
19. chronology of conception/implementation;
20. supporting experiment references.

Clearly separate:
ALREADY PUBLIC
NEW/CONFIDENTIAL
UNCONFIRMED.

Do not publish or push this document to the public repository.
```

## PROMPT 37 — Prior-art search package

```text
CONFIDENTIAL PATENT RESEARCH TASK.

Perform a structured technical prior-art search for the proposed invention.

Search both patent and non-patent literature for combinations involving:

peer-to-peer energy trading
distributed energy resources
virtual power plants
corrective dispatch
transaction feasibility
AC power-flow verification
hierarchical power-flow screening
state-bound transaction certificates
grid-topology-aware settlement
MARL energy trading
coalition-stable energy markets
core-selecting energy payments
automatic redispatch
post-settlement physical verification.

Do not search only exact title phrases.

Create a claim-element matrix:

Prior-art reference
publication/priority date
technical elements disclosed
missing elements
similarities
differences.

Do not conclude:
"novel"
"patentable"
"clear to file"

Instead identify:
HIGH OVERLAP
MEDIUM OVERLAP
LOW OVERLAP
NEEDS PROFESSIONAL REVIEW.

Include working links/identifiers and verify every citation.
```

---

# PHASE XVIII — Publication-Quality Results

## PROMPT 38 — Final experiment campaign

```text
Freeze the final algorithms and experiment configuration before producing publication results.

Do NOT tune hyperparameters using final test scenarios.

Run the final campaign using predetermined seeds.

Target at least 10 independent seeds for primary results; use 20 where compute permits.

Execute:

algorithm comparison
grid-size comparison
renewable uncertainty study
agent-scaling study
physical-safety study
coalition-stability study
Sybil study
collusion study
misreporting study
ablation study
corrective-settlement study
latency/scalability study.

Store raw runs immutably.

If an experiment crashes, record failure rather than silently excluding it.

Generate:

results/raw/
results/processed/
results/manifests/
results/tables/
results/figures/

Ensure every table can be regenerated from raw outputs.
```

---

# PHASE XIX — Q1 Figures

## PROMPT 39 — Generate publication figures

```text
Generate clear publication-quality figures strictly from verified experiment outputs.

Potential figures:

1. GridNexus architecture
2. CS-SafeMAPPO algorithm flow
3. dual-certificate verification flow
4. training convergence
5. welfare comparison
6. physical-violation comparison
7. coalition excess
8. collusion/Sybil/misreporting robustness
9. scalability
10. ablation
11. corrective-settlement effectiveness
12. hierarchical verification latency.

Rules:

- no decorative fake data;
- no misleading truncated axes;
- include uncertainty/error bars where appropriate;
- use readable labels;
- export vector PDF/SVG where possible;
- maintain consistent style;
- include source-data file path in figure metadata/documentation.

Create scripts, not manually edited charts.
```

---

# PHASE XX — Q1 Tables

## PROMPT 40 — Generate tables automatically

```text
Generate journal-ready tables directly from processed experiment data.

Tables should include, where appropriate:

algorithm comparison
physical safety
economic performance
fairness
coalition stability
adversarial robustness
ablation
scalability
statistical tests
complexity comparison.

Every table-generation script must record source files.

Highlight best/second-best only when statistically and scientifically meaningful.

Do not manually type experimental numbers into LaTeX.
```

---

# PHASE XXI — Paper Writing

## PROMPT 41 — Freeze the scientific contribution

```text
Before writing the manuscript, review all validated evidence and determine exactly what GridNexus can claim.

The paper should focus on no more than four central contributions:

1. coalition-constrained energy-market formulation;
2. CS-SafeMAPPO;
3. physically certified/corrective settlement;
4. large-scale adversarial and grid-constrained evaluation.

Do not make LLM, RAG, FedAvg, LSTM, differential privacy, blockchain or HIL central contributions unless they were actually validated through dedicated experiments.

Create:

docs/research/final_claim_scope.md

List:

SUPPORTED CLAIMS
QUALIFIED CLAIMS
UNSUPPORTED CLAIMS TO REMOVE

Do not begin final manuscript drafting until this is complete.
```

## PROMPT 42 — Mathematical-method audit

```text
Audit all equations and definitions needed by the paper.

Define consistently:

agents
states
actions
observations
coalitions
characteristic function
allocation
coalition excess
physical constraint cost
social welfare
fairness
constrained objective
MAPPO objective
CS-SafeMAPPO objective
dual updates
corrective projection
network constraints.

Check notation for overloading.

Ensure exact versus approximate coalition stability is explicit.

Ensure assumptions are stated before theorems/propositions.

Do not invent convergence guarantees.

If no formal theorem can be proven, present empirical/algorithmic claims honestly.
```

## PROMPT 43 — Related-work and novelty audit

```text
Perform a rigorous literature review for the manuscript.

Focus on:

P2P energy trading
MARL energy markets
safe/constrained MARL
network-constrained energy trading
coalition formation
cooperative game theory
core-selecting mechanisms
virtual power plants
DER coordination
federated energy RL where relevant
corrective dispatch.

Prioritize recent high-quality journal literature plus foundational work.

For every claimed novelty statement, identify the closest competing works.

Produce a novelty matrix:

Work
MARL
network physics
AC validation
coalition stability
adversarial robustness
corrective settlement
scalability
our difference.

Do not invent DOI, title, author or citation.

Verify references.
```

## PROMPT 44 — Draft the Q1 manuscript

```text
Draft the research manuscript using ONLY validated evidence.

Suggested title:

"GridNexus: Coalition-Stable Safe Multi-Agent Reinforcement Learning for Network-Constrained Peer-to-Peer Energy Trading"

Suggested structure:

1. Abstract
2. Introduction
3. Related Work
4. Problem Formulation
5. GridNexus Architecture
6. CS-SafeMAPPO
7. Coalition Stability and Payment Mechanism
8. Physical Feasibility and Corrective Settlement
9. Experimental Methodology
10. Results
11. Ablation and Adversarial Robustness
12. Scalability
13. Discussion
14. Limitations
15. Threats to Validity
16. Conclusion.

Rules:

Do not oversell.

Do not call heuristic stability exact.

Do not call simulation deployment.

Do not call simulated HIL real hardware.

Do not claim collusion resistance unless supported.

Do not claim strategy-proofness unless supported.

Do not report unsupported technical-effect numbers.

Every quantitative sentence must map to claim_evidence.csv.

Every table and figure must be regenerated from raw data.
```

---

# PHASE XXII — Reproducibility Package

## PROMPT 45 — Research artifact package

```text
Build the final reproducibility artifact.

Include:

README
environment setup
Docker instructions
requirements/lockfiles
datasets/network sources
scenario generation
training commands
evaluation commands
trained checkpoints
experiment configs
raw-result metadata
table reproduction
figure reproduction
claim-evidence ledger
known limitations.

A new researcher should be able to reproduce at least the principal tables without reading internal developer knowledge.

Add a fast smoke mode and a full compute-heavy mode.

Do not package confidential patent-specific disclosure files into the public artifact before authorization.
```

---

# PHASE XXIII — Final Engineering Review

## PROMPT 46 — Red-team the system

```text
Act as a hostile Q1 reviewer and senior software reviewer.

Attempt to disprove GridNexus's claims.

Inspect:

data leakage
incorrect baselines
random initialized models
cherry-picked seeds
invalid significance tests
reward leakage
train/test contamination
unfair compute budgets
hard-coded results
simulation assumptions
unstable power-flow cases
false coalition-stability labels
silent fallbacks
security shortcuts
reproducibility gaps.

For every issue assign:

CRITICAL
MAJOR
MINOR.

Do not fix results by hiding weaknesses.

Create:

docs/research/red_team_review.md

Then fix CRITICAL and MAJOR implementation defects and rerun affected experiments.
```

## PROMPT 47 — Q1 reviewer simulation

```text
Review the completed manuscript and artifact as three independent hypothetical reviewers:

Reviewer 1:
power systems expert.

Reviewer 2:
multi-agent reinforcement learning expert.

Reviewer 3:
game theory/mechanism-design expert.

For each reviewer provide:

summary
strengths
major concerns
minor concerns
missing experiments
questionable claims
accept/minor/major/reject-style recommendation.

Then create a consolidated remediation list.

Do not make the reviewers artificially positive.
```

---

# PHASE XXIV — Final Patent Technical Review

## PROMPT 48 — Patent-oriented engineering red team

```text
CONFIDENTIAL.

Attack the proposed technical invention from an engineering/prior-art perspective.

Ask:

1. Is the mechanism just a business rule?
2. Is it merely an algorithm executed on generic hardware?
3. What physical grid state actually changes?
4. What DER/controller output is produced?
5. What measurable electrical technical effect exists?
6. Which components are already publicly disclosed?
7. Which components appear genuinely new relative to our prior-art matrix?
8. Can the architecture be implemented without one alleged inventive element?
9. Are the technical steps sufficiently specific?
10. Are experiments actually measuring the claimed effects?

Create:

patent_review/red_team_invention_review.md

Do not provide a legal conclusion.

Mark issues for professional patent counsel.
```

---

# PHASE XXV — Final Release Gate

## PROMPT 49 — Do not declare done until this passes

```text
Run a final release/readiness gate.

Q1 ENGINEERING REQUIREMENTS

[ ] CI green
[ ] no silent experimental fallbacks
[ ] no placeholder research metrics
[ ] trained IPPO checkpoint exists
[ ] trained MAPPO checkpoint exists
[ ] trained SafeMAPPO checkpoint exists
[ ] trained CS-SafeMAPPO checkpoint exists
[ ] actual participant-to-bus mapping used
[ ] actual physical validation used
[ ] exact/heuristic stability labels correct
[ ] results reproducible
[ ] >=10 seeds for primary experiments
[ ] statistical analysis complete
[ ] adversarial sweeps complete
[ ] ablation complete
[ ] scalability complete
[ ] claim-evidence ledger valid

PUBLICATION REQUIREMENTS

[ ] all quantitative claims trace to raw files
[ ] figures generated from scripts
[ ] tables generated from scripts
[ ] citations verified
[ ] limitations explicit
[ ] no unsupported claims
[ ] supplementary material prepared

PATENT-TRACK REQUIREMENTS

[ ] confidential invention implementation isolated
[ ] public vs confidential material documented
[ ] prior-art matrix prepared
[ ] technical-effect experiments executed
[ ] physical technical effect documented
[ ] invention disclosure prepared
[ ] no confidential material accidentally pushed publicly
[ ] professional patent review still marked as required

For every unchecked item explain exactly why it failed.

Do NOT output "100% complete" unless every applicable engineering/research criterion actually passes.

Produce:

FINAL_READINESS_REPORT.md
```

---

# FINAL COMPLETION PROMPT

## PROMPT 50 — Finish everything remaining

```text
Read:

FINAL_READINESS_REPORT.md
docs/research/current_state_audit.md
docs/research/red_team_review.md
docs/research/final_claim_scope.md
research/claims/claim_evidence.csv

and all current CI/test results.

Now finish ONLY remaining engineering/research items that are objectively incomplete.

Prioritize:

P0 scientific validity
P0 broken CI
P0 unsupported quantitative claims
P1 missing experiments
P1 reproducibility
P1 statistically weak results
P2 documentation/polish.

Do not add new features unless required to close an identified evidence gap.

For every change:

implement
test
rerun affected experiments
update evidence
update documentation.

At the end rerun the complete release gate.

Return the final state using:

IMPLEMENTATION
TESTING
EXPERIMENTS
Q1 EVIDENCE
PATENT TECHNICAL EVIDENCE
KNOWN LIMITATIONS
UNRESOLVED PROFESSIONAL PATENT QUESTIONS

Do not use arbitrary completion percentages.

State exactly what is and is not complete.
```

---

# Recommended Execution Order

## Batch A — Repair the existing system
Prompts **0–10**

## Batch B — Create the publishable algorithm
Prompts **11–18**

## Batch C — Private patent invention
Prompts **19–23**

Run these on a **private/local branch only**.

## Batch D — Serious experiments
Prompts **24–38**

## Batch E — Paper
Prompts **39–47**

## Batch F — Patent evidence + final audit
Prompts **48–50**

---

# Highest-Priority Prompts for GridNexus

If compute/time is limited, execute these especially carefully:

- **Prompt 4** — fix encrypted private-value integration
- **Prompt 5** — real participant → DER → bus coupling
- **Prompt 17** — create actual CS-SafeMAPPO
- **Prompt 19** — create the corrective-settlement invention
- **Prompt 35** — produce genuine technical-effect evidence

The correct development order is:

**implementation → validation → experiments → frozen results → statistics → claims → manuscript**

Do not ask Antigravity to “improve the results.” Ask it to improve the **methodology, implementation, experiment design, and reproducibility**, then accept whatever the results actually show.
