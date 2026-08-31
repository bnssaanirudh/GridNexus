import { Worker, Job } from "bullmq";
import { connection, StabilityJobPayload } from "./queues/index.js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { isProduction } from "./config.js";
import "./workers/oracleBroadcastWorker.js";

dotenv.config();

const prisma = new PrismaClient();
const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

// Alert webhook stub for DLQ wrapped in an object for easy mocking in Vitest
export const AlertService = {
  alertWebhookStub(jobId: string, error: Error) {
    console.error(`[DLQ ALERT] Job ${jobId} permanently failed and moved to DLQ. Reason: ${error.message}`);
    // In production, this would POST to PagerDuty or Slack
  }
};

const stabilityWorker = new Worker<StabilityJobPayload>(
  "stability-jobs",
  async (job: Job<StabilityJobPayload>) => {
    const { coalition } = job.data;
    
    // Check if we should force an error for the DLQ test
    if (process.env.FORCE_ENGINE_ERROR === "true") {
      throw new Error("Forced Engine Error for Testing");
    }
    
    let isStable = false;
    let margin = 0.0;
    
    try {
      const fetchResponse = await fetch(`${ENGINE_URL}/stability/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          coalition, 
          profiles: job.data.profiles,
          allocation_mechanism: job.data.allocationMechanism || "least_core"
        }),
      });
      
      if (!fetchResponse.ok) {
        throw new Error(`Engine returned ${fetchResponse.status}`);
      }
      const data = (await fetchResponse.json()) as { isStable?: boolean; isCoreStable?: boolean; margin?: number };
      const stableResult = data.isStable ?? data.isCoreStable;
      const marginResult = data.margin;
      if (typeof stableResult !== "boolean" || typeof marginResult !== "number" || !Number.isFinite(marginResult)) {
        throw new Error("Engine returned an invalid stability response.");
      }
      isStable = stableResult;
      margin = marginResult;
    } catch (e) {
      if (isProduction()) {
        throw new Error(`Engine verification failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Mocking mechanism as requested: "stub this endpoint with a fast mock response if ’s real solver is not yet built"
      console.warn(`[Mock] Engine unreachable. Falling back to mock solver.`);
      isStable = true;
      margin = 12.5;
    }

    // Write to stabilitychecks via Prisma
    let check: { id: string };
    try {
      check = await prisma.stabilityCheck.create({
        data: {
          isStable,
          margin,
          violatingDeviation: null,
        },
      });
    } catch (error) {
      if (isProduction()) throw error;
      console.warn("[Mock] Stability result persistence unavailable in simulation mode.");
      check = {
        id: `simulation-${job.id ?? Date.now()}`,
      };
    }

    return { checkId: check.id, isStable, margin };
  },
  { connection }
);

stabilityWorker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} failed. Attempts made: ${job?.attemptsMade}, Max attempts: ${job?.opts.attempts}`);
  // If the job has exhausted all retries, treat it as Dead-Lettered
  if (job && job.attemptsMade >= (job.opts.attempts || 5)) {
    AlertService.alertWebhookStub(job.id as string, err);
  }
});

console.log("Stability Worker started.");

export async function closeWorker() {
  try {
    await stabilityWorker.close();
    await gridWorker.close();
    await prisma.$disconnect();
  } catch (_) { /* ignore */ }
}

import { GridJobPayload, gridQueue } from "./queues/index.js";

const gridWorker = new Worker<GridJobPayload>(
  "grid-jobs",
  async (job: Job<GridJobPayload>) => {
    // 1. Send the topology and injection payload to Engine
    let feasible = false;
    let certId = "";
    
    try {
      const fetchResponse = await fetch(`${ENGINE_URL}/grid/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negotiation_id: job.data.negotiationId,
          nodes: job.data.nodes,
          lines: job.data.lines
        }),
      });
      
      if (!fetchResponse.ok) {
        throw new Error(`Engine returned ${fetchResponse.status}`);
      }
      const data = await fetchResponse.json() as {
        negotiationId: string;
        networkVersion: number;
        solver: string;
        solverVersion: string;
        feasible: boolean;
        violations: any[];
        maxLineLoadingPct: number;
        minVoltagePu: number;
        maxVoltagePu: number;
        powerBalanceError: number;
        inputHash: string;
        resultHash: string;
      };
      
      // 2. Write the certificate back to DB
      const cert = await prisma.gridFeasibilityCertificate.create({
        data: {
          negotiationId: data.negotiationId,
          networkVersion: data.networkVersion,
          solver: data.solver,
          solverVersion: data.solverVersion,
          feasible: data.feasible,
          violations: data.violations,
          maxLineLoadingPct: data.maxLineLoadingPct,
          minVoltagePu: data.minVoltagePu,
          maxVoltagePu: data.maxVoltagePu,
          powerBalanceError: data.powerBalanceError,
          inputHash: data.inputHash,
          resultHash: data.resultHash
        }
      });
      
      feasible = cert.feasible;
      certId = cert.id;
      
    } catch (e) {
      if (isProduction()) {
        throw new Error(`Grid verification failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      console.warn(`[Mock] Grid Engine unreachable. Falling back to mock certificate.`);
      const cert = await prisma.gridFeasibilityCertificate.create({
        data: {
          negotiationId: job.data.negotiationId,
          networkVersion: 1,
          solver: "Mock",
          solverVersion: "1.0",
          feasible: true,
          violations: [],
          maxLineLoadingPct: 50.0,
          minVoltagePu: 0.98,
          maxVoltagePu: 1.0,
          powerBalanceError: 0.0,
          inputHash: "mock",
          resultHash: "mock"
        }
      });
      feasible = true;
      certId = cert.id;
    }

    return { checkId: certId, isFeasible: feasible };
  },
  { connection }
);

gridWorker.on("failed", (job, err) => {
  console.log(`Grid Job ${job?.id} failed. Attempts made: ${job?.attemptsMade}`);
  if (job && job.attemptsMade >= (job.opts.attempts || 5)) {
    AlertService.alertWebhookStub(job.id as string, err);
  }
});

console.log("Grid Worker started.");

export { stabilityWorker, gridWorker };
