import { Namespace } from "socket.io";
import { gridQueue, qPrefix } from "../queues/index.js";
import { QueueEvents } from "bullmq";
import { prisma } from "./commitTrade.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const TIMEOUT_MS = parseInt(process.env.GRID_GATE_TIMEOUT_MS ?? "10000", 10);

export interface GridGateContext {
  negotiationId: string;
  agentIds: string[];        // Proposed N-agent coalition
  currentRequestedKwh: number;
  intervalMinutes: number;   // e.g., 60
  io: Namespace;
}

export interface GridGateResult {
  passed: boolean;
  certId: string;
}

export class GridGate {
  /**
   * Evaluates the physical grid feasibility of a proposed trade using LinDistFlow.
   */
  static async check(ctx: GridGateContext): Promise<GridGateResult> {
    const queueEvents = new QueueEvents(`${qPrefix}grid-jobs`, { connection: { url: REDIS_URL } });

    try {
      // 1. Fetch Topology from Prisma
      const buses = await prisma.bus.findMany({ include: { microgrids: true } });
      const lines = await prisma.line.findMany({ where: { active: true } });

      const nodes = [];
      const linesData = [];

      // Determine power in kW
      const powerKw = (ctx.currentRequestedKwh / (ctx.intervalMinutes / 60.0));

      // 2. Identify who is buying and selling, and get their DERs
      const agents = await prisma.agent.findMany({
          where: { id: { in: ctx.agentIds } },
          include: {
            microgrid: {
              include: { ders: true }
            }
          }
      });

      let totalSellerCapacity = 0;
      let totalBuyerCapacity = 0;

      const sellerCapacities = new Map<string, number>();
      const buyerCapacities = new Map<string, number>();

      for (const agent of agents) {
          let capacity = 0;
          for (const der of agent.microgrid.ders) {
              capacity += Number(der.ratedPowerKw);
          }
          if (agent.type === "SELLER") {
              sellerCapacities.set(agent.microgridId, capacity);
              totalSellerCapacity += capacity;
          } else if (agent.type === "BUYER") {
              buyerCapacities.set(agent.microgridId, capacity);
              totalBuyerCapacity += capacity;
          }
      }

      // Ensure there's a slack bus. We just pick the first bus if none is explicitly slack
      let slackSet = false;

      for (let i = 0; i < buses.length; i++) {
          const b = buses[i];
          
          let p_gen = 0;
          let p_load = 0;

          // Check if this bus has one of our trading microgrids
          for (const mg of b.microgrids) {
             if (sellerCapacities.has(mg.microgridId) && totalSellerCapacity > 0) {
                 // Apportion based on proportion of total seller capacity
                 const proportion = sellerCapacities.get(mg.microgridId)! / totalSellerCapacity;
                 p_gen += powerKw * proportion;
             }
             if (buyerCapacities.has(mg.microgridId) && totalBuyerCapacity > 0) {
                 const proportion = buyerCapacities.get(mg.microgridId)! / totalBuyerCapacity;
                 p_load += powerKw * proportion;
             }
          }

          nodes.push({
              id: b.id,
              voltage_level_kv: Number(b.voltageLevelKv),
              is_slack: !slackSet, // First bus is slack
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

      // 3. Enqueue the grid check via BullMQ
      const job = await gridQueue.add("check-grid", { 
          negotiationId: ctx.negotiationId,
          nodes,
          lines: linesData
      }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      });

      // 4. Await completion synchronously
      const result = await job.waitUntilFinished(queueEvents, TIMEOUT_MS) as {
        checkId: string;
        isFeasible: boolean;
      };

      if (!result.isFeasible) {
        // 5. Update negotiation to GRID_FAILED
        await prisma.negotiation.update({
          where: { id: ctx.negotiationId },
          data: { status: "GRID_FAILED" },
        }).catch(() => console.warn(`[GridGate] Failed to update negotiation ${ctx.negotiationId} (mock mode?)`));

        // 6. Emit rejection WS event
        ctx.io.to(ctx.negotiationId).emit("grid_rejected", {
          negotiationId: ctx.negotiationId,
          isFeasible: false,
          message: "Trade blocked by Grid Feasibility verification.",
        });

        console.log(`[GridGate] Blocked grid-infeasible coalition in negotiation ${ctx.negotiationId}`);
        return {
          passed: false,
          certId: result.checkId,
        };
      }

      console.log(`[GridGate] Approved grid-feasible coalition in negotiation ${ctx.negotiationId}`);
      return {
        passed: true,
        certId: result.checkId,
      };

    } finally {
      await queueEvents.close();
    }
  }
}
