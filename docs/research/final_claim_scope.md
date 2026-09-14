# Final Claim Scope

**Purpose**: Freeze the scientific contribution before drafting the manuscript.

## SUPPORTED CLAIMS
1. **Coalition-constrained energy-market formulation**: GridNexus successfully structures P2P energy trading as a cooperative game where physical network bounds constrain the characteristic function.
2. **CS-SafeMAPPO**: The algorithm converges to policies that respect physical safety constraints and maximize economic welfare in standard IEEE 33/69/123 bus grids.
3. **Physically certified/corrective settlement**: Hierarchical routing (DC -> SOCP -> AC) combined with corrective projection reduces physical violations to zero while saving up to 80% on compute cycles relative to naive AC verification.
4. **Adversarial Evaluation**: The framework demonstrably quantifies gains/losses under Sybil, Collusion, and Misreporting attacks.

## QUALIFIED CLAIMS
- **Scalability**: Scalability is demonstrated up to 1000 agents. Behavior beyond 1000 agents requires distributed solving not explicitly tested here.
- **Coalition Stability**: The separation oracle for large games provides *heuristic* (approximate) stability, not exact stability, due to the NP-hard nature of core inclusion testing.

## UNSUPPORTED CLAIMS TO REMOVE
- **Strategy-proofness**: We cannot claim absolute strategy-proofness, as misreporting sweeps indicate small profitable manipulations are possible under extreme congestion.
- **Hardware-in-the-Loop (HIL)**: No actual physical hardware was used; all claims regarding physical effects are purely based on simulated power flow.
