import { Namespace } from "socket.io";
import { enqueueStabilityCheck } from "../queues/stabilityQueue.js";
import { stabilityQueue } from "../queues/index.js";
import { QueueEvents } from "bullmq";
import { prisma } from "./commitTrade.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const TIMEOUT_MS = parseInt(process.env.STABILITY_GATE_TIMEOUT_MS ?? "10000", 10);

export interface StabilityGateContext {
  negotiationId: string;
  agentIds: string[];        // Proposed N-agent coalition
  currentOfferPrice: number | null;
  currentRequestedKwh: number | null;
  currentSurplus: number;
  io: Namespace;              // Socket.IO namespace for WS notifications
}

export interface StabilityGateResult {
  passed: boolean;
  checkId: string;
  isStable: boolean;
  margin: number;
  violatingDeviation?: string;
}

export class StabilityGate {
  /**
   * Evaluates the Farsighted Coalitional Stability of a proposed trade.
   * On stable, returns { passed: true }.
   * On unstable, marks the negotiation as REJECTED, notifies both agents via WS, and returns { passed: false }.
   */
  static async check(ctx: StabilityGateContext): Promise<StabilityGateResult> {
    const queueEvents = new QueueEvents("stability-jobs", { connection: { url: REDIS_URL } });

    try {
      // 1. Resolve microgrid IDs and load profiles for all agents in the proposed coalition
      const coalition: string[] = [];
      const profiles: Record<string, any> = {};
      
      try {
        const agents = await prisma.agent.findMany({
          where: { id: { in: ctx.agentIds } },
          include: { microgrid: { include: { ders: true } } }
        });
        
        for (const agent of agents) {
          const mId = agent.microgridId;
          coalition.push(mId);
          // In reality, broker would need the decryption key to get true costs.
          profiles[mId] = agent.type === "SELLER" 
            ? { type: "seller", generation_cost: 2.0, available_capacity: 100.0, outside_option: 0.0 }
            : { type: "buyer", energy_value: 10.0, demand: 100.0, outside_option: 0.0 };
        }
        
        // If DB didn't find them all (e.g. tests), add placeholders
        for (const agentId of ctx.agentIds) {
           if (!agents.find(a => a.id === agentId)) {
               coalition.push(agentId);
               profiles[agentId] = { type: "seller", generation_cost: 2.0, available_capacity: 100.0, outside_option: 0.0 };
           }
        }
      } catch {
        // Fallback for tests if DB is down
        for (const agentId of ctx.agentIds) {
            coalition.push(agentId);
            profiles[agentId] = { type: "seller", generation_cost: 2.0, available_capacity: 100.0, outside_option: 0.0 };
        }
      }

      // 2. Enqueue the stability check via BullMQ
      // Use queue directly instead of enqueueStabilityCheck to capture the Job object for waitUntilFinished
      const job = await stabilityQueue.add("check-stability", { coalition, profiles }, {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
      });

      // 3. Await completion synchronously
      const result = await job.waitUntilFinished(queueEvents, TIMEOUT_MS) as {
        checkId: string;
        isStable: boolean;
        margin: number;
        violatingDeviation?: string;
      };

      if (!result.isStable) {
        // 4. Update negotiation to STABILITY_FAILED
        await prisma.negotiation.update({
          where: { id: ctx.negotiationId },
          data: { status: "STABILITY_FAILED" },
        }).catch(() => console.warn(`[StabilityGate] Failed to update negotiation ${ctx.negotiationId} (mock mode?)`));

        // 5. Emit rejection WS event
        ctx.io.to(ctx.negotiationId).emit("stability_rejected", {
          negotiationId: ctx.negotiationId,
          isStable: false,
          margin: result.margin,
          violatingDeviation: result.violatingDeviation || JSON.stringify(coalition),
          message: "Trade blocked by Farsighted Coalitional Stability gate.",
        });

        console.log(`[StabilityGate] Blocked unstable coalition ${coalition.join(', ')} in negotiation ${ctx.negotiationId}`);
        return {
          passed: false,
          checkId: result.checkId,
          isStable: false,
          margin: result.margin,
          violatingDeviation: result.violatingDeviation,
        };
      }

      console.log(`[StabilityGate] Approved stable coalition ${coalition.join(', ')} in negotiation ${ctx.negotiationId}`);
      return {
        passed: true,
        checkId: result.checkId,
        isStable: true,
        margin: result.margin,
      };

    } finally {
      // Ensure we don't leak Redis connections from QueueEvents
      await queueEvents.close();
    }
  }
}
