import { Namespace } from "socket.io";
import { QueueEvents } from "bullmq";
import { prisma } from "../db/prisma.js";
import dotenv from "dotenv";
import { decryptValue } from "../crypto.js";
import { jointQueue, qPrefix } from "../queues/index.js";
import { buildJointGatePayload } from "./jointGatePayload.js";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const TIMEOUT_MS = parseInt(process.env.JOINT_GATE_TIMEOUT_MS ?? "20000", 10);

export interface JointGateContext {
  negotiationId: string;
  agentIds: string[];        // Proposed N-agent coalition
  currentOfferPrice: number | null;
  currentRequestedKwh: number;
  intervalMinutes: number;
  io: Namespace;
}

export interface JointGateResult {
  passed: boolean;
  certId?: string;
  isStable: boolean;
  isFeasible: boolean;
  margin?: number;
  violatingDeviation?: string;
}

export class JointGate {
  /**
   * Evaluates BOTH the physical grid feasibility and Farsighted Coalitional Stability of a proposed trade.
   * On stable & feasible, returns { passed: true }.
   * Otherwise, marks the negotiation as REJECTED, notifies both agents via WS, and returns { passed: false }.
   */
  static async check(ctx: JointGateContext): Promise<JointGateResult> {
    const queueEvents = new QueueEvents(`${qPrefix}joint-jobs`, { connection: { url: REDIS_URL } });

    try {
      // 1. Gather agent profiles for stability and grid checks.
      const agents = await prisma.agent.findMany({
        where: { id: { in: ctx.agentIds } },
        include: { microgrid: { include: { ders: true, tradingPreference: true } } }
      });

      // 2. Gather Topology for AC Power Flow Check
      const buses = await prisma.bus.findMany({ include: { microgrids: true } });
      const lines = await prisma.line.findMany({ where: { active: true } });

      const payload = buildJointGatePayload({
        negotiationId: ctx.negotiationId,
        agentIds: ctx.agentIds,
        currentRequestedKwh: ctx.currentRequestedKwh,
        intervalMinutes: ctx.intervalMinutes,
        agents: agents.map((agent) => ({
          id: agent.id,
          type: agent.type,
          microgridId: agent.microgridId,
          hiddenGenerationCost: decryptValue(agent.microgrid.hiddengenerationcost),
          maximumPreferredBuyPrice:
            agent.microgrid.tradingPreference?.maximumPreferredBuyPrice === null ||
            agent.microgrid.tradingPreference?.maximumPreferredBuyPrice === undefined
              ? null
              : Number(agent.microgrid.tradingPreference.maximumPreferredBuyPrice),
          ders: agent.microgrid.ders.map((der) => ({ ratedPowerKw: Number(der.ratedPowerKw) })),
        })),
        buses: buses.map((bus) => ({
          id: bus.id,
          voltageLevelKv: Number(bus.voltageLevelKv),
          microgridIds: bus.microgrids.map((mapping) => mapping.microgridId),
        })),
        lines: lines.map((line) => ({
          id: line.id,
          fromBusId: line.fromBusId,
          toBusId: line.toBusId,
          resistance: Number(line.resistance),
          reactance: Number(line.reactance),
          thermalLimitKw: Number(line.thermalLimitKw),
        })),
      });

      // 3. Enqueue the joint check via BullMQ
      const job = await jointQueue.add("check-joint", payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      });

      // 4. Await completion synchronously
      const result = await job.waitUntilFinished(queueEvents, TIMEOUT_MS) as {
        certId: string;
        isFeasible: boolean;
        isStable: boolean;
        margin: number;
        violatingDeviation?: string;
      };

      if (!result.isStable || !result.isFeasible) {
        // 5. Update negotiation to FAILED state
        const status = !result.isStable ? "STABILITY_FAILED" : "GRID_FAILED";
        await prisma.negotiation.update({
          where: { id: ctx.negotiationId },
          data: { status },
        }).catch(() => console.warn(`[JointGate] Failed to update negotiation ${ctx.negotiationId} (mock mode?)`));

        // 6. Emit rejection WS event
        ctx.io.to(ctx.negotiationId).emit(!result.isStable ? "stability_rejected" : "grid_rejected", {
          negotiationId: ctx.negotiationId,
          isFeasible: result.isFeasible,
          isStable: result.isStable,
          margin: result.margin,
          message: "Trade blocked by Joint Patent-Grade Safety verification.",
        });

        console.log(`[JointGate] Blocked coalition in negotiation ${ctx.negotiationId}. Stable: ${result.isStable}, Feasible: ${result.isFeasible}`);
        return {
          passed: false,
          certId: result.certId,
          isStable: result.isStable,
          isFeasible: result.isFeasible,
          margin: result.margin,
          violatingDeviation: result.violatingDeviation,
        };
      }

      console.log(`[JointGate] Approved stable and grid-feasible coalition in negotiation ${ctx.negotiationId}`);
      return {
        passed: true,
        certId: result.certId,
        isStable: true,
        isFeasible: true,
        margin: result.margin,
      };

    } finally {
      await queueEvents.close();
    }
  }
}
