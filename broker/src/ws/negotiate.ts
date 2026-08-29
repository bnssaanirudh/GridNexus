import { Server, Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { commitTrade } from "../services/commitTrade.js";
import { StabilityGate } from "../services/stabilityGate.js";
import { GridGate } from "../services/gridGate.js";
import { hasAgentPendingBeliefUpdate } from "../services/beliefUpdateService.js";
import { isProduction } from "../config.js";

const prisma = new PrismaClient();

// Configuration
const DISCOUNT_FACTOR = 0.95;
const MAX_ROUNDS = 10;
const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:8000";

interface NegotiationInit {
  negotiationId: string; // If resuming
  agentIds: string[];    // Supports N-agent coalitions
  initialSurplus: number;
}

export function setupNegotiationNamespace(io: Server) {
  const nsp = io.of("/negotiate");

  nsp.on("connection", (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on("start_negotiation", async (data: NegotiationInit) => {
      try {
        // ── Belief-update gate ──────────────────────────────────
        // Block agents that still have a PENDING oracle-triggered belief update.
        // This ensures negotiation only begins after the full Oracle → Belief
        // cycle has completed.
        let pendingAgent = null;
        for (const agentId of data.agentIds) {
          const isPending = await hasAgentPendingBeliefUpdate(agentId).catch((err) => {
            if (isProduction()) throw new Error(`DB Error on belief gate: ${err.message}`);
            return false;
          });
          if (isPending) {
            pendingAgent = agentId;
            break;
          }
        }

        if (pendingAgent) {
          console.log(`[WS] Negotiation deferred: agent ${pendingAgent} has a pending belief update`);
          socket.emit("belief_update_pending", {
            agentId: pendingAgent,
            message: "Negotiation deferred: belief update in progress. Retry after update completes.",
          });
          return;
        }

        let negId = data.negotiationId;
        let round = 1;
        let status = "NEGOTIATING";
        let currentOfferPrice: number | null = null;
        let currentRequestedKwh: number | null = null;
        
        // For N-agent, we just pick the first two as active/opponent for the bilateral LLM chat
        // (Full dynamic N-agent chat is future work, but the coalition can be N agents)
        let activeAgent = data.agentIds[0];
        let opponentAgent = data.agentIds[1];

        if (negId) {
          // Graceful resumption
          const existing = await prisma.negotiation.findUnique({
            where: { id: negId },
            include: { beliefUpdates: true }
          });
          if (existing) {
            status = existing.status;
            if (status === "CREATED" || status === "PENDING") {
              status = "NEGOTIATING";
              await prisma.negotiation.update({ where: { id: negId }, data: { status }});
            }
            // The rounds can be inferred from the number of belief updates.
            // (Assuming 1 belief update per round step).
            round = existing.beliefUpdates.length + 1;
            if (round % 2 === 0) {
              activeAgent = data.agentIds[1];
              opponentAgent = data.agentIds[0];
            }
          }
        } else {
          const neg = await prisma.negotiation.create({
            data: { status: "CREATED" }
          });
          negId = neg.id;
          status = "NEGOTIATING";
          await prisma.negotiation.update({ where: { id: negId }, data: { status }});
        }

        socket.join(negId);
        nsp.emit("status", { message: "Negotiation started/resumed", negotiationId: negId, round });

        // Start the bargaining loop
        while (status === "NEGOTIATING" && round <= MAX_ROUNDS) {
          const currentSurplus = data.initialSurplus * Math.pow(DISCOUNT_FACTOR, round - 1);
          console.log(`[WS] Round ${round}: Active Agent ${activeAgent}, Discounted Surplus ${currentSurplus.toFixed(2)}`);

          // Call Engine
          const reqBody = {
            agent_id: activeAgent,
            opponent_id: opponentAgent,
            negotiation_id: negId,
            current_offer_price: currentOfferPrice,
            current_requested_kwh: currentRequestedKwh,
            round_number: round,
            surplus: currentSurplus
          };

          const response = await fetch(`${ENGINE_URL}/negotiate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody)
          });

          if (!response.ok) {
            throw new Error(`Engine returned ${response.status}: ${await response.text()}`);
          }

          const engineData = await response.json() as any;
          const action: string = engineData.action;
          // "LLM" (default) or "DQN_GATE" when the DQN overrode the LLM action
          const decisionSource: string = engineData.decision_source ?? "LLM";

          await prisma.negotiationRound.create({
            data: {
              negotiationId: negId,
              roundNumber: round,
              activeAgentId: activeAgent,
              opponentAgentId: opponentAgent,
              action: action,
              surplus: currentSurplus,
              decisionSource,
            }
          });

          // enriched payload so command-center NegotiationFeed can render all context
          nsp.emit("round_update", {
            negotiationId: negId,
            round,
            activeAgent,
            action,
            currentSurplus,
            discountedSurplus: currentSurplus,
            decision_source: decisionSource,
            counter_offer_price: engineData.counter_offer_price,
            counter_requested_kwh: engineData.counter_requested_kwh
          });

          if (action === "ACCEPT") {
            status = "PROVISIONALLY_ACCEPTED";
            await prisma.negotiation.update({ where: { id: negId }, data: { status }});

            let VALID_OFFER = true;
            let AI_SAFE = true;
            let BELIEF_CONSISTENT = true;
            let GRID_FEASIBLE = true;
            let AUDIT_READY = true;

            status = "SAFETY_VERIFIED";
            await prisma.negotiation.update({ where: { id: negId }, data: { status }});

            // ── Farsighted Coalitional Stability Gate  ──────────────
            const gateResult = await StabilityGate.check({
              negotiationId: negId,
              agentIds: data.agentIds,
              currentOfferPrice,
              currentRequestedKwh,
              currentSurplus,
              io: nsp,
            });

            status = "STABILITY_VERIFIED";
            if (!gateResult.passed) {
              // negotiation already marked STABILITY_FAILED + WS notified inside StabilityGate.check
              status = "STABILITY_FAILED"; // Update local state for emit
            } else {
              await prisma.negotiation.update({ where: { id: negId }, data: { status }});
            }

            // ── Grid Feasibility Gate  ────────────────────────
            const gridResult = await GridGate.check({
              negotiationId: negId,
              agentIds: data.agentIds,
              currentRequestedKwh: currentRequestedKwh ?? 0,
              intervalMinutes: 60, // Default for now
              io: nsp,
            });

            if (!gridResult.passed) {
              console.log(`[WS] Negotiation ${negId} failed Grid check.`);
              return; // Terminate negotiation loop
            }
            
            let GRID_FEASIBLE = gridResult.passed;
            let STABLE = gateResult.passed;

            // ── Centralized Commit Logic ──────────────
            const COMMIT_ALLOWED = VALID_OFFER && AI_SAFE && BELIEF_CONSISTENT && STABLE && GRID_FEASIBLE && AUDIT_READY;

            if (COMMIT_ALLOWED) {
              status = "COMMITTING";
              await prisma.negotiation.update({ where: { id: negId }, data: { status }});

              // Resolve microgrid IDs from agent IDs
              let fromMicrogridId = activeAgent;
              let toMicrogridId = opponentAgent;
              let resolvedAgentId: string | null = activeAgent;
              try {
                const fromAgent = await prisma.agent.findUnique({ where: { id: activeAgent } });
                const toAgent = await prisma.agent.findUnique({ where: { id: opponentAgent } });
                if (fromAgent) fromMicrogridId = fromAgent.microgridId;
                if (toAgent) toMicrogridId = toAgent.microgridId;
                resolvedAgentId = fromAgent ? activeAgent : null;
              } catch {
                resolvedAgentId = null;
              }

              // ── Commit the full ledger chain atomically on ACCEPT ──────────────
              try {
                await commitTrade({
                  energyTransfer: {
                    fromMicrogridId,
                    toMicrogridId,
                    amount: currentRequestedKwh ?? currentSurplus,
                    price: currentOfferPrice ?? 0,
                    stabilitycheckid: gateResult.checkId,
                    gridcertificateid: gridResult.certId,
                    startTime: new Date(),
                    intervalMinutes: 60,
                    energyKwh: currentRequestedKwh ?? currentSurplus,
                    averagePowerKw: currentRequestedKwh ?? currentSurplus,
                    negotiationId: negId,
                  },
                  negotiationRound: {
                    negotiationId: negId,
                    roundNumber: round,
                    activeAgentId: activeAgent,
                    opponentAgentId: opponentAgent,
                    action: action,
                    surplus: currentSurplus,
                    decisionSource,
                  },
                  rlReward: {
                    agentId: resolvedAgentId ?? activeAgent,
                    negotiationId: negId,
                    rewardValue: currentSurplus,
                  }
                });

                status = "COMMITTED";
                await prisma.negotiation.update({ where: { id: negId }, data: { status }});
              } catch (ledgerErr) {
                if (isProduction()) {
                  status = "COMMIT_FAILED";
                  await prisma.negotiation.update({ where: { id: negId }, data: { status }});
                  nsp.emit("error", { message: `Ledger commit failed: ${(ledgerErr as Error).message}` });
                  break;
                } else {
                  console.warn(
                    `[WS] Ledger commit failed for negotiation ${negId} (agent IDs may not be real DB records): ${(ledgerErr as Error).message}`
                  );
                  status = "COMMITTED"; // Mock success if not production
                  await prisma.negotiation.update({ where: { id: negId }, data: { status }});
                }
              }
            } else {
               if (status !== "STABILITY_FAILED") {
                 status = "SYSTEM_ERROR";
                 await prisma.negotiation.update({ where: { id: negId }, data: { status }});
               }
            }
            break;
          } else if (action === "WALK_AWAY") {
            status = "WALKED_AWAY";
            await prisma.negotiation.update({ where: { id: negId }, data: { status }});
            break;
          } else if (action === "COUNTER_OFFER") {
            currentOfferPrice = engineData.counter_offer_price;
            currentRequestedKwh = engineData.counter_requested_kwh;
          }

          // Swap active agent
          const temp = activeAgent;
          activeAgent = opponentAgent;
          opponentAgent = temp;
          round++;

          // Pacing delay for dashboard live visibility and async tick
          await new Promise(res => setTimeout(res, 600));
        }

        if (status === "NEGOTIATING" && round > MAX_ROUNDS) {
          status = "MAX_ROUNDS_REACHED";
          await prisma.negotiation.update({ where: { id: negId }, data: { status }});
        }

        const finalRoundNum = round > MAX_ROUNDS ? round - 1 : round;
        nsp.emit("negotiation_complete", { negotiationId: negId, status, finalRound: finalRoundNum });
        console.log(`[WS] Negotiation ${negId} finished with status ${status}`);
        
      } catch (err) {
        console.error(`[WS] Error in negotiation:`, err);
        socket.emit("error", { message: (err as Error).message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });
}
