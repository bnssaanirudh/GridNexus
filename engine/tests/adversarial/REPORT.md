# Adversarial Stress-Test Report 

This report details the synthetic adversary suite constructed to validate the mechanism-design stability guarantees of the GridNexus platform against strategic defection and manipulation.

## Adversary Classes and Mitigations

### 1. Falsifying Willingness-to-Trade
* **File:** `test_falsify_willingness.py`
* **Attack:** A prosumer agent (the adversary) artificially inflates its requested utility by misreporting its private battery capacity or generation cost. This allows it to demand a vastly disproportionate share of the coalition's surplus.
* **Detection Point:** The coalition pre-commit phase (Stability Solver).
* **Mitigation:** When the falsified demands are translated into the `surplus_map` allocation for the coalition, the total demanded value exceeds the actual physical surplus generation capacity `v(S)`. The row-constraint-generation LP solver attempts to find an allocation satisfying all deviating coalitions, but because the adversary's demand breaks the efficiency or individual rationality constraints relative to the true `v(S)`, the LP becomes infeasible. The solver correctly flags the coalition as **Unstable** (`is_stable=False`) and the transaction is blocked before any ledger commit occurs.

### 2. Defecting After Pooling
* **File:** `test_defect_after_pool.py`
* **Attack:** An agent joins a multi-node Virtual Power Plant pool (e.g., a 3-agent grand coalition) with the hidden intent of defecting immediately after capacity is committed to secure a highly profitable side-deal (e.g., with only one of the peers, bypassing the third).
* **Detection Point:** The coalition pre-commit phase (Stability Solver).
* **Mitigation:** The separation oracle in the LP solver evaluates all physically permissible (connected) deviating coalitions. It detects that the adversary and its chosen peer can secure a higher characteristic value `v(T)` by deviating than they receive from the proposed grand coalition allocation. Because this profitable deviation exists, the stability constraint `Σ x_i >= v(T)` is violated. The solver adds this cutting-plane row, and if no stable allocation exists, it returns `is_stable=False` along with the identified `deviating_coalition`. The pool formation is aborted.

### 3. Spamming Malformed Offers
* **File:** `test_spam_malformed.py`
* **Attack:** An adversarial agent attempts a Denial-of-Service or logic-bomb attack by spamming malformed, non-JSON strings during the WebSocket bargaining session to crash the broker or stall the `negotiate` loop.
* **Detection Point:** The negotiation engine's LLM retry loop.
* **Mitigation:** The robust error-correction pipeline (`negotiate_with_retry`) intercepts the `OfferValidationError` and requests structured corrections up to `MAX_RETRIES`. If the adversary persists with malformed spam and exhausts the retries, the system does not crash. Instead, it gracefully bypasses the LLM and selects an action using the safeguarding Deep Q-Network (DQN). Furthermore, the `DeficitRegistry` increments a fallback event counter, ensuring that the adversary's fallback rate is bounded and trackable for post-hoc penalization via the profit-linked reward function.

### 4. The Sybil Attack
* **File:** `test_sybil_attack.py`
* **Attack:** An adversarial microgrid operator clones their digital identity, splitting their 100 kWh battery into ten 10 kWh virtual agents ("Sybils") to game the cooperative allocation mechanism by extracting baseline incentives multple times.
* **Detection Point:** The coalition pre-commit phase (Stability Solver).
* **Mitigation:** The stability solver evaluates transactions against the strictly defined *physical grid graph*. Because fake virtual identities do not represent independent physical transmission pathways or generation points, they cannot independently alter the true characteristic generation value `v(S)`. Any surplus map attempting to over-allocate to the Sybils inherently starves the honest nodes. The solver detects that the honest nodes are mathematically incentivized to deviate (since their physical generation exceeds their starved allocation), rendering the Sybil cartel's contract **Unstable**.

### 5. Collusive Bid Rigging (Cartels)
* **File:** `test_collusion_attack.py`
* **Attack:** Two adversarial agents act as a cartel, secretly coordinating out-of-band to depress their energy prices when selling to a third honest agent. This locks the honest agent into a predatory contract, extracting its fair surplus to pad the cartel's margins.
* **Detection Point:** The coalition pre-commit phase (Stability Solver).
* **Mitigation:** Even if the LLMs accept the predatory cartel contract, the Joint Oracle evaluates the proposed `surplus_map`. It strictly identifies that the honest agent, possessing highly valuable energy, would be strictly better off defecting and forming a smaller sub-coalition with just one neighbor who would rationally defect from the cartel. The core constraint is violated, and the Oracle blocks the collusive contract.
