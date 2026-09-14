import { Namespace } from "socket.io";
import { QueueEvents } from "bullmq";
import { prisma } from "./commitTrade.js";
import dotenv from "dotenv";
import { Queue } from "bullmq";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const TIMEOUT_MS = parseInt(process.env.JOINT_GATE_TIMEOUT_MS ?? "20000", 10);
const qPrefix = process.env.QUEUE_PREFIX || "gn:";

// Export queue for joint jobs so workers can attach to it
export const jointQueue = new Queue(`${qPrefix}joint-jobs`, { connection: { url: REDIS_URL } });

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
      // 1. Gather Agent profiles for Stability Check
      const coalition: string[] = [];
      const profiles: Record<string, any> = {};
      
      const agents = await prisma.agent.findMany({
        where: { id: { in: ctx.agentIds } },
        include: { microgrid: { include: { ders: true } } }
      });
      
      const sellers = agents.filter(a => a.type === "SELLER").map(a => a.microgridId);
      const buyers = agents.filter(a => a.type === "BUYER").map(a => a.microgridId);
      
      for (const agent of agents) {
        const agentId = agent.id;
        coalition.push(agentId);
        profiles[agentId] = agent.type === "SELLER"
          ? { type: "seller", generation_cost: 2.0, available_capacity: 100.0, outside_option: 0.0 }
          : { type: "buyer", energy_value: 10.0, demand: 100.0, outside_option: 0.0 };
      }
      
      // Fallbacks
      for (const agentId of ctx.agentIds) {
          if (!agents.find(a => a.id === agentId)) {
              coalition.push(agentId);
              profiles[agentId] = { type: "seller", generation_cost: 2.0, available_capacity: 100.0, outside_option: 0.0 };
          }
      }

      // 2. Gather Topology for AC Power Flow Check
      const buses = await prisma.bus.findMany({ include: { microgrids: true } });
      const lines = await prisma.line.findMany({ where: { active: true } });

      const nodes = [];
      const linesData = [];

      const powerKw = (ctx.currentRequestedKwh / (ctx.intervalMinutes / 60.0));
      const p_gen_each = sellers.length > 0 ? powerKw / sellers.length : 0;
      const p_load_each = buyers.length > 0 ? powerKw / buyers.length : 0;
      let slackSet = false;

      for (let i = 0; i < buses.length; i++) {
          const b = buses[i];
          let p_gen = 0;
          let p_load = 0;

          for (const mg of b.microgrids) {
             if (sellers.includes(mg.microgridId)) p_gen += p_gen_each;
             if (buyers.includes(mg.microgridId)) p_load += p_load_each;
          }

          nodes.push({
              id: b.id,
              voltage_level_kv: Number(b.voltageLevelKv),
              is_slack: !slackSet, 
              p_load_kw: p_load,
              p_gen_kw: p_gen
          });
          slackSet = true;
      }

      for (const l of lines) {
          linesData.push({
              id: l.id,
              from_node: l.fromBusId,
              to_node: l.toBusId,
              r_ohms: Number(l.resistance),
              x_ohms: Number(l.reactance),
              thermal_limit_kw: Number(l.thermalLimitKw)
          });
      }

      // 3. Enqueue the joint check via BullMQ
      const job = await jointQueue.add("check-joint", { 
          negotiationId: ctx.negotiationId,
          coalition,
          profiles,
          nodes,
          lines: linesData
      }, {
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
