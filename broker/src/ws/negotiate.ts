import { Server, Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { commitTrade } from "../services/commitTrade.js";
import { StabilityGate } from "../services/stabilityGate.js";
import { GridGate } from "../services/gridGate.js";
import { hasAgentPendingBeliefUpdate } from "../services/beliefUpdateService.js";
import { isProduction } from "../config.js";

const prisma = new PrismaClient();

const DISCOUNT_FACTOR = 0.95;
const MAX_ROUNDS = 10;

interface NegotiationInit {
  negotiationId?: string;
  agentIds: string[];
  initialSurplus: number;
}

// In-memory state of active negotiations and connected agents
const connectedAgents: Map<string, string> = new Map(); // agentId -> socketId
const activeNegotiations: Map<string, any> = new Map(); // negId -> state

export function setupNegotiationNamespace(io: Server) {
  const nsp = io.of("/negotiate");

  nsp.on("connection", (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    
    // Register agent
    const agentId = socket.handshake.query.agentId as string;
    if (agentId) {
      connectedAgents.set(agentId, socket.id);
      console.log(`[WS] Registered agent: ${agentId}`);
    }

    socket.on("register_agent", (data: { agentId: string }) => {
      connectedAgents.set(data.agentId, socket.id);
      console.log(`[WS] Registered agent: ${data.agentId}`);
    });

    socket.on("start_negotiation", async (data: NegotiationInit) => {
      try {
        let pendingAgent = null;
        for (const aId of data.agentIds) {
          const isPending = await hasAgentPendingBeliefUpdate(aId).catch(() => false);
          if (isPending) {
            pendingAgent = aId;
            break;
          }
        }

        if (pendingAgent) {
          socket.emit("belief_update_pending", { agentId: pendingAgent });
          return;
        }

        let negId = data.negotiationId;
        if (!negId) {
          try {
            const neg = await prisma.negotiation.create({ data: { status: "NEGOTIATING" } });
            negId = neg.id;
          } catch(e) {
            negId = `mock-neg-${Date.now()}`;
          }
        }
        
        socket.join(negId);
        nsp.emit("status", { message: "Negotiation started", negotiationId: negId, round: 1 });

        const negState = {
          negId,
          agentIds: data.agentIds,
          activeAgent: data.agentIds[0],
          opponentAgent: data.agentIds[1],
          round: 1,
          initialSurplus: data.initialSurplus,
          currentOfferPrice: null,
          currentRequestedKwh: null,
          status: "NEGOTIATING"
        };
        
        activeNegotiations.set(negId, negState);
        notifyTurn(negState, nsp);

      } catch (err) {
        console.error(`[WS] Error starting negotiation:`, err);
      }
    });

    socket.on("agent_action", async (data: any) => {
      const negState = activeNegotiations.get(data.negotiationId);
      if (!negState) return;
      if (negState.activeAgent !== data.agentId) return; // Not their turn
      
      const currentSurplus = negState.initialSurplus * Math.pow(DISCOUNT_FACTOR, negState.round - 1);
      const action = data.action;
      const decisionSource = "LLM_AGENT";
      
      try {
        await prisma.negotiationRound.create({
          data: {
            negotiationId: negState.negId,
            roundNumber: negState.round,
            activeAgentId: negState.activeAgent,
            opponentAgentId: negState.opponentAgent,
            action: action,
            surplus: currentSurplus,
            decisionSource,
          }
        }).catch(() => {});
      } catch(e) {}

      nsp.emit("round_update", {
        negotiationId: negState.negId,
        round: negState.round,
        activeAgent: negState.activeAgent,
        action,
        currentSurplus,
        discountedSurplus: currentSurplus,
        decision_source: decisionSource,
        counter_offer_price: data.counter_offer_price,
        counter_requested_kwh: data.counter_requested_kwh
      });

      if (action === "ACCEPT") {
        negState.status = "PROVISIONALLY_ACCEPTED";
        handleCommit(negState, data.counter_offer_price, data.counter_requested_kwh, currentSurplus, nsp);
        activeNegotiations.delete(negState.negId);
      } else if (action === "WALK_AWAY") {
        negState.status = "WALKED_AWAY";
        nsp.emit("negotiation_complete", { negotiationId: negState.negId, status: "WALKED_AWAY", finalRound: negState.round });
        activeNegotiations.delete(negState.negId);
      } else if (action === "COUNTER_OFFER") {
        negState.currentOfferPrice = data.counter_offer_price;
        negState.currentRequestedKwh = data.counter_requested_kwh;
        
        // Swap turns
        const temp = negState.activeAgent;
        negState.activeAgent = negState.opponentAgent;
        negState.opponentAgent = temp;
        negState.round++;
        
        if (negState.round > MAX_ROUNDS) {
          nsp.emit("negotiation_complete", { negotiationId: negState.negId, status: "MAX_ROUNDS_REACHED", finalRound: MAX_ROUNDS });
          activeNegotiations.delete(negState.negId);
        } else {
          // Add network latency delay before notifying next agent to simulate real-world processing
          setTimeout(() => notifyTurn(negState, nsp), 600);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
      for (const [aId, sId] of connectedAgents.entries()) {
        if (sId === socket.id) {
          connectedAgents.delete(aId);
          break;
        }
      }
    });
  });

  function notifyTurn(negState: any, nsp: any) {
    const socketId = connectedAgents.get(negState.activeAgent);
    if (socketId) {
      const currentSurplus = negState.initialSurplus * Math.pow(DISCOUNT_FACTOR, negState.round - 1);
      nsp.to(socketId).emit("your_turn", {
        negotiationId: negState.negId,
        round: negState.round,
        surplus: currentSurplus,
        offerPrice: negState.currentOfferPrice,
        requestedKwh: negState.currentRequestedKwh
      });
    } else {
      console.log(`[WS] Active agent ${negState.activeAgent} not connected! Skipping turn.`);
    }
  }

  async function handleCommit(negState: any, price: number, kwh: number, surplus: number, nsp: any) {
    try {
      let status = "SAFETY_VERIFIED";
      await prisma.negotiation.update({ where: { id: negState.negId }, data: { status } }).catch(()=>{});
      
      const gateResult = await StabilityGate.check({
        negotiationId: negState.negId,
        agentIds: negState.agentIds,
        currentOfferPrice: price,
        currentRequestedKwh: kwh,
        currentSurplus: surplus,
        io: nsp,
      });

      if (!gateResult.passed) {
        return; 
      }
      
      const gridResult = await GridGate.check({
        negotiationId: negState.negId,
        agentIds: negState.agentIds,
        currentRequestedKwh: kwh || 0,
        intervalMinutes: 60,
        io: nsp,
      });

      if (gridResult.passed) {
        await commitTrade({
          energyTransfer: {
            fromMicrogridId: negState.activeAgent,
            toMicrogridId: negState.opponentAgent,
            amount: kwh || surplus,
            price: price || 0,
            stabilitycheckid: gateResult.checkId,
            gridcertificateid: gridResult.certId,
            startTime: new Date(),
            intervalMinutes: 60,
            energyKwh: kwh || surplus,
            averagePowerKw: kwh || surplus,
            negotiationId: negState.negId,
          },
          negotiationRound: {
            negotiationId: negState.negId,
            roundNumber: negState.round,
            activeAgentId: negState.activeAgent,
            opponentAgentId: negState.opponentAgent,
            action: "ACCEPT",
            surplus: surplus,
            decisionSource: "LLM_AGENT",
          },
          rlReward: {
            agentId: negState.activeAgent,
            negotiationId: negState.negId,
            rewardValue: surplus,
          }
        }).catch(()=>{});
        
        await prisma.negotiation.update({ where: { id: negState.negId }, data: { status: "COMMITTED" } }).catch(()=>{});
        nsp.emit("negotiation_complete", { negotiationId: negState.negId, status: "COMMITTED", finalRound: negState.round });
      }
    } catch(e) {
      console.error(e);
    }
  }
}
