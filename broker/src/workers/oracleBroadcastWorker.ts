/**
 * broker/src/workers/oracleBroadcastWorker.ts
 * ─────────────────────────────────────────────
 * Oracle Broadcast Worker
 *
 * BullMQ worker that processes oracle-broadcast-jobs.  Each job:
 *
 *  1. Calls ENGINE /oracle/signal with an anonymized grid state derived from
 *     live DB aggregates.
 *  2. Persists the returned signal to the oraclesignals table.
 *  3. Calls runBeliefUpdateCycle() for every subscribed agent.
 *  4. Returns a structured result for waitUntilFinished() callers.
 *
 * ASSUMPTION : The Engine's /oracle/signal endpoint expects an
 * AnonymizedGridState body.  We derive this from live DB aggregates when
 * possible.  If the DB is unavailable, we fall back to neutral defaults so the
 * pipeline remains testable offline.
 *
 * ASSUMPTION : `exogenous_stress_index` is set to 0.5 (neutral)
 * since no weather/market API integration is in scope for this prompt.
 */

import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { connection } from "../queues/index.js";
import type { OracleBroadcastJobPayload } from "../queues/oracleBroadcastQueue.js";
import { runBeliefUpdateCycle } from "../services/beliefUpdateService.js";
import { isProduction } from "../config.js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Oracle state builder
// ---------------------------------------------------------------------------

interface AnonymizedGridState {
  total_pooled_capacity_kwh: number;
  participating_microgrid_count: number;
  aggregate_demand_signal: number;
  exogenous_stress_index: number;
}

/**
 * Build an AnonymizedGridState from live DB aggregates.
 * Falls back to safe neutral defaults if DB is unreachable.
 */
async function buildGridState(): Promise<AnonymizedGridState> {
  try {
    const microgridCount = await prisma.microgrid.count();
    const agentCount = await prisma.agent.count();
    return {
      total_pooled_capacity_kwh: microgridCount * 100, // 100 kWh nominal per microgrid
      participating_microgrid_count: microgridCount,
      aggregate_demand_signal: agentCount > 0 ? 0.6 : 0.5,
      exogenous_stress_index: 0.5, // ASSUMPTION: neutral until weather API wired
    };
  } catch {
    return {
      total_pooled_capacity_kwh: 100,
      participating_microgrid_count: 1,
      aggregate_demand_signal: 0.5,
      exogenous_stress_index: 0.5,
    };
  }
}

// ---------------------------------------------------------------------------
// Oracle signal fetcher (with offline mock fallback)
// ---------------------------------------------------------------------------

interface OracleSignalResponse {
  signal: string;
  broadcast_text: string;
  action_id: number;
  confidence: number;
  action_probs: Record<string, number>;
}

async function fetchOracleSignal(
  state: AnonymizedGridState
): Promise<OracleSignalResponse> {
  try {
    const res = await fetch(`${ENGINE_URL}/oracle/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    if (!res.ok) throw new Error(`Engine returned ${res.status}`);
    return (await res.json()) as OracleSignalResponse;
  } catch (err) {
    if (isProduction()) {
      throw new Error(`Oracle engine unreachable in production mode: ${err instanceof Error ? err.message : String(err)}`);
    }
    // ── Offline mock fallback ──────────────────────────────────────────────
    // ASSUMPTION : When the Engine is unreachable (e.g. in test
    // environments without Docker), we emit a neutral "HOLD" signal with
    // confidence 0.5.  This keeps the full pipeline exercisable offline.
    console.warn(
      `[OracleBroadcastWorker] Engine unreachable, using mock signal. Reason: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return {
      signal: "HOLD",
      broadcast_text: "[Mock] Neutral grid signal – no action required.",
      action_id: 0,
      confidence: 0.5,
      action_probs: { HOLD: 1.0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Oracle signal persistence
// ---------------------------------------------------------------------------

async function persistOracleSignal(
  signalResponse: OracleSignalResponse
): Promise<string> {
  const signalData = JSON.stringify({
    signal: signalResponse.signal,
    action_id: signalResponse.action_id,
    confidence: signalResponse.confidence,
    broadcast_text: signalResponse.broadcast_text,
  });

  try {
    const row = await prisma.oracleSignal.create({ data: { signalData } });
    return row.id;
  } catch (err) {
    if (isProduction()) {
      throw new Error(`Oracle signal persistence failed in production: ${err instanceof Error ? err.message : String(err)}`);
    }
    // DB unavailable – return a deterministic mock ID so tests can proceed
    console.warn(
      `[OracleBroadcastWorker] DB unavailable for signal persist: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return `mock-signal-${Date.now()}`;
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface OracleBroadcastWorkerResult {
  signalId: string;
  signal: string;
  confidence: number;
  agentsUpdated: number;
  durationMs: number;
}

export const oracleBroadcastWorker = new Worker<
  OracleBroadcastJobPayload,
  OracleBroadcastWorkerResult
>(
  "oracle-broadcast-jobs",
  async (job: Job<OracleBroadcastJobPayload>): Promise<OracleBroadcastWorkerResult> => {
    const startedAt = Date.now();
    console.log(
      `[OracleBroadcastWorker] Processing job ${job.id} scheduled at ${job.data.scheduledAt}`
    );

    // ── Stage 1: Build grid state ───────────────────────────────────────────
    const gridState = await buildGridState();
    console.log(
      `[OracleBroadcastWorker] GridState: ${gridState.participating_microgrid_count} microgrids`
    );

    // ── Stage 2: Call Oracle /signal ────────────────────────────────────────
    const oracleResponse = await fetchOracleSignal(gridState);
    console.log(
      `[OracleBroadcastWorker] Oracle signal: ${oracleResponse.signal} (confidence=${oracleResponse.confidence})`
    );

    // ── Stage 3: Persist signal ─────────────────────────────────────────────
    const signalId = await persistOracleSignal(oracleResponse);
    console.log(`[OracleBroadcastWorker] Signal persisted id=${signalId}`);

    // ── Stage 4: Run belief-update cycle for all agents ─────────────────────
    const cycleResult = await runBeliefUpdateCycle(
      signalId,
      JSON.stringify({
        signal: oracleResponse.signal,
        confidence: oracleResponse.confidence,
      })
    );
    console.log(
      `[OracleBroadcastWorker] Belief updates complete: ${cycleResult.agentsUpdated} agents updated`
    );

    const durationMs = Date.now() - startedAt;
    return {
      signalId,
      signal: oracleResponse.signal,
      confidence: oracleResponse.confidence,
      agentsUpdated: cycleResult.agentsUpdated,
      durationMs,
    };
  },
  { connection, concurrency: 1 } // serialise oracle cycles to avoid race conditions
);

oracleBroadcastWorker.on("completed", (job, result) => {
  console.log(
    `[OracleBroadcastWorker] Job ${job.id} complete: signal=${result.signal}, ` +
    `agents=${result.agentsUpdated}, duration=${result.durationMs}ms`
  );
});

oracleBroadcastWorker.on("failed", (job, err) => {
  console.error(
    `[OracleBroadcastWorker] Job ${job?.id} failed: ${err.message}`
  );
});

console.log("[OracleBroadcastWorker] Worker started.");
