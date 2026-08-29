/**
 * broker/src/services/beliefUpdateService.ts
 * ───────────────────────────────────────────
 * Belief Update Service
 *
 * Provides Bayesian belief update logic and the full belief-update cycle that
 * runs after each Oracle signal broadcast.
 *
 * Bayesian update formula used:
 *   posterior = (likelihood * prior) / evidence
 *
 * Where:
 *   - prior        = agent's current belief (0–1, treated as P(H))
 *   - likelihood   = P(signal | H) derived from the Oracle's confidence score
 *   - evidence     = normalisation constant
 *
 * ASSUMPTION : The Oracle signal's `confidence` field represents
 * P(signal | hypothesis_true). The complement (1 - confidence) is used for
 * P(signal | hypothesis_false). This is the simplest interpretable mapping
 * that preserves Bayesian coherence.
 *
 * ASSUMPTION : "Subscribed agents" are all agents that exist in the
 * database at the time the oracle broadcast runs.  A future prompt may add an
 * explicit subscription table.
 *
 * ASSUMPTION : The `negotiationId` FK on BeliefUpdate is NOT NULL
 * per schema, so oracle-triggered belief updates are linked to a dedicated
 * singleton "oracle" Negotiation row created once and re-used.  This
 * Negotiation row has status="ORACLE" to distinguish it from real bargaining
 * sessions.
 */

import { PrismaClient } from "@prisma/client";
import type { BeliefUpdate } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Singleton "oracle" Negotiation row used as the FK anchor for all
// oracle-triggered belief updates.
// ---------------------------------------------------------------------------
let oracleNegotiationId: string | null = null;

async function getOrCreateOracleNegotiation(): Promise<string> {
  if (oracleNegotiationId) return oracleNegotiationId;

  const existing = await prisma.negotiation.findFirst({
    where: { status: "ORACLE" },
  });

  if (existing) {
    oracleNegotiationId = existing.id;
    return oracleNegotiationId;
  }

  const created = await prisma.negotiation.create({ data: { status: "ORACLE" } });
  oracleNegotiationId = created.id;
  return oracleNegotiationId;
}

// ---------------------------------------------------------------------------
// Bayesian posterior computation
// ---------------------------------------------------------------------------

/**
 * Compute the Bayesian posterior given a prior belief and a signal confidence.
 *
 * @param prior      - Prior probability P(H), in [0, 1].
 * @param confidence - P(signal | H), the Oracle's confidence score, in [0, 1].
 * @returns The updated posterior probability, clamped to [0.001, 0.999].
 */
export function computeBayesianPosterior(
  prior: number,
  confidence: number
): number {
  // P(signal | H)  = confidence
  // P(signal | ¬H) = 1 - confidence   (simplest symmetric likelihood)
  const likelihoodH  = confidence;
  const likelihoodNH = 1 - confidence;

  const evidence = likelihoodH * prior + likelihoodNH * (1 - prior);

  if (evidence === 0) return prior; // degenerate case – return unchanged

  const posterior = (likelihoodH * prior) / evidence;

  // Clamp to open interval to avoid probability collapse
  return Math.min(0.999, Math.max(0.001, posterior));
}

export function mapSignalToHypothesis(signalData: string): string {
  if (signalData.includes("POOL_NOW")) return "H1_POOLING_OPTIMAL";
  if (signalData.includes("DEMAND_SURGE_SOON")) return "H2_DEMAND_SURGE";
  if (signalData.includes("STABILITY_AT_RISK")) return "H3_STABILITY_RISK";
  if (signalData.includes("STORM_ALERT")) return "H4_EXOGENOUS_SHOCK";
  return "H0_STATUS_QUO";
}

// ---------------------------------------------------------------------------
// Full oracle belief-update cycle
// ---------------------------------------------------------------------------

export interface AgentBeliefUpdateResult {
  agentId: string;
  beforeBelief: number;
  afterBelief: number;
  beliefUpdateId: string;
  status: "COMPLETE" | "ERROR";
  error?: string;
}

export interface BeliefUpdateCycleResult {
  signalId: string;
  agentsUpdated: number;
  results: AgentBeliefUpdateResult[];
}

/**
 * Run a full belief-update cycle for all agents triggered by a new
 * Oracle signal.
 *
 * Steps per agent:
 *  1. Create BeliefUpdate row with status="PENDING"
 *  2. Compute Bayesian posterior from the signal confidence
 *  3. Update the row to afterBelief + status="COMPLETE"
 *
 * @param signalId      - The persisted OracleSignal.id (FK for audit trail).
 * @param signalData    - Raw JSON string from the Oracle signal response.
 * @param agentIds      - IDs of all agents to update. If empty, all DB agents are loaded.
 */
export async function runBeliefUpdateCycle(
  signalId: string,
  signalData: string,
  agentIds?: string[]
): Promise<BeliefUpdateCycleResult> {
  // Parse signal confidence from the Oracle signal JSON
  let confidence = 0.5; // default – neutral signal
  try {
    const parsed = JSON.parse(signalData) as { confidence?: number };
    if (typeof parsed.confidence === "number") {
      confidence = Math.min(1, Math.max(0, parsed.confidence));
    }
  } catch {
    // Malformed signalData – use default confidence
  }
  
  const hypothesis = mapSignalToHypothesis(signalData);

  // Resolve agents
  const agents = agentIds?.length
    ? await prisma.agent.findMany({ where: { id: { in: agentIds } } })
    : await prisma.agent.findMany();

  const negId = await getOrCreateOracleNegotiation();
  const results: AgentBeliefUpdateResult[] = [];

  for (const agent of agents) {
    let row: BeliefUpdate | null = null;
    try {
      // ── Step 1: Determine prior from the last COMPLETE belief update ────────
      const lastUpdate = await prisma.beliefUpdate.findFirst({
        where: { agentId: agent.id, status: "COMPLETE" },
        orderBy: { createdAt: "desc" },
      });
      const prior = lastUpdate ? Number(lastUpdate.afterBelief) : 0.5;

      // ── Step 2: Create PENDING row ──────────────────────────────────────────
      row = await prisma.beliefUpdate.create({
        data: {
          negotiationId: negId,
          triggeringsignalid: signalId,
          beforeBelief: prior,
          afterBelief: prior, // placeholder until computation completes
          prior,
          likelihood: confidence,
          posterior: prior,
          confidence,
          hypothesis,
          decisionSource: "ORACLE",
          agentId: agent.id,
          status: "PENDING",
        },
      });

      // ── Step 3: Compute posterior ───────────────────────────────────────────
      const posterior = computeBayesianPosterior(prior, confidence);

      // ── Step 4: Mark COMPLETE ───────────────────────────────────────────────
      await prisma.beliefUpdate.update({
        where: { id: row.id },
        data: { afterBelief: posterior, posterior, status: "COMPLETE" },
      });

      results.push({
        agentId: agent.id,
        beforeBelief: prior,
        afterBelief: posterior,
        beliefUpdateId: row.id,
        status: "COMPLETE",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // If the row was created but update failed, try to mark ERROR
      if (row) {
        await prisma.beliefUpdate
          .update({ where: { id: row.id }, data: { status: "ERROR" } })
          .catch(() => undefined);
      }
      results.push({
        agentId: agent.id,
        beforeBelief: 0.5,
        afterBelief: 0.5,
        beliefUpdateId: row?.id ?? "",
        status: "ERROR",
        error: message,
      });
    }
  }

  return {
    signalId,
    agentsUpdated: results.filter((r) => r.status === "COMPLETE").length,
    results,
  };
}

/**
 * Check whether an agent has any PENDING belief update.
 * Used by the negotiation gate .
 *
 * @param agentId - The agent to check.
 * @returns true if a pending belief update exists (agent must wait).
 */
export async function hasAgentPendingBeliefUpdate(agentId: string): Promise<boolean> {
  const pending = await prisma.beliefUpdate.findFirst({
    where: { agentId, status: "PENDING" },
  });
  return pending !== null;
}
