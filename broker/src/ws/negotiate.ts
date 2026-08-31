import { Server, Socket } from "socket.io";
import { createHmac } from "crypto";
import { PrismaClient } from "@prisma/client";
import { commitSettlement } from "../services/settlementService.js";
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

/**
 * Verifies an HS256 JWT issued by the Engine /auth/agent-token endpoint.
 * Returns the `sub` claim (agentId) on success; throws on failure.
 */
function verifyAgentJWT(token: string): string {
  const secret = process.env.ENGINE_JWT_SECRET;
  if (!secret) throw new Error("ENGINE_JWT_SECRET not configured on broker");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const sig = createHmac("sha256", secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");
  if (sig !== parts[2]) throw new Error("Invalid token signature");

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("Token expired");
  if (!payload.sub) throw new Error("Token missing sub claim");

  return payload.sub as string;
}

export function setupNegotiationNamespace(io: Server) {
  const nsp = io.of("/negotiate");

  // ── JWT authentication middleware ──────────────────────────────────────────
  // Every socket must present a valid agent JWT in socket.handshake.auth.token.
  // The verified agentId is bound to socket.data.agentId — handlers must use
  // socket.data.agentId instead of trusting client-sent agentId fields.
  // In the test environment (NODE_ENV=test) the check is bypassed.
  nsp.use((socket, next) => {
    if (process.env.NODE_ENV === "test") {
      socket.data.agentId = (socket.handshake.query.agentId as string) ?? "test-agent";
      return next();
    }

    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("AUTH_REQUIRED: missing JWT in socket.handshake.auth.token"));
    }

    try {
      socket.data.agentId = verifyAgentJWT(token);
      next();
    } catch (err) {
      next(new Error(`AUTH_FAILED: ${(err as Error).message}`));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id} (Agent: ${socket.data.agentId})`);
    
    // Register agent
    const agentId = socket.data.agentId;
    if (agentId) {
      connectedAgents.set(agentId, socket.id);
      console.log(`[WS] Registered agent: ${agentId}`);
    }

    socket.on("register_agent", (_data: { agentId: string }) => {
      // agentId is taken from the JWT-verified socket.data.agentId.
      // Client-supplied agentId is intentionally ignored to prevent spoofing.
      const verifiedId = socket.data.agentId;
      if (verifiedId) {
        connectedAgents.set(verifiedId, socket.id);
        console.log(`[WS] Re-registered agent: ${verifiedId}`);
      }
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
        // Scope status to the negotiation room — not all sockets.
        nsp.to(negId).emit("status", { message: "Negotiation started", negotiationId: negId, round: 1 });

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
      await prisma.negotiation
        .update({ where: { id: negState.negId }, data: { status: "SAFETY_VERIFIED" } })
        .catch(() => {}); // best-effort status update; don't block gate checks

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

      if (!gridResult.passed) {
        return;
      }

      // commitSettlement is idempotent (UNIQUE idempotencyKey), runs in a
      // Serializable transaction, and appends audit events. Exceptions must
      // NOT be swallowed — a failure here means the trade was not recorded.
      const deliveryStart = new Date();
      const deliveryEnd = new Date(deliveryStart.getTime() + 60 * 60 * 1_000);
      const idempotencyKey = `neg-${negState.negId}-r${negState.round}`;

      const { settlement } = await commitSettlement({
        idempotencyKey,
        negotiationId: negState.negId,
        sellerMicrogridId: negState.activeAgent,
        buyerMicrogridId: negState.opponentAgent,
        energyKwh: kwh || surplus,
        pricePerKwh: price || 0,
        deliveryStart,
        deliveryEnd,
        stabilityCheckId: gateResult.checkId,
        gridCertificateId: gridResult.certId,
        energyTransferData: {
          amount: kwh || surplus,
          price: price || 0,
          startTime: deliveryStart,
          intervalMinutes: 60,
          averagePowerKw: kwh || surplus,
          stabilitycheckid: gateResult.checkId,
          gridcertificateid: gridResult.certId,
        },
        negotiationRoundData: {
          roundNumber: negState.round,
          activeAgentId: negState.activeAgent,
          opponentAgentId: negState.opponentAgent,
          action: "ACCEPT",
          surplus,
          decisionSource: "LLM_AGENT",
        },
        rlRewardData: {
          agentId: negState.activeAgent,
          rewardValue: surplus,
        },
      });

      nsp.to(negState.negId).emit("negotiation_complete", {
        negotiationId: negState.negId,
        settlementId: settlement.id,
        status: "COMMITTED",
        finalRound: negState.round,
      });
    } catch (e) {
      // Settlement failed — inform both agents so they don't believe the trade is live
      console.error(`[WS] Settlement failed for negotiation ${negState.negId}:`, e);
      nsp.to(negState.negId).emit("settlement_failed", {
        negotiationId: negState.negId,
        reason: e instanceof Error ? e.message : "Internal settlement error",
      });
      await prisma.negotiation
        .update({ where: { id: negState.negId }, data: { status: "FAILED" } })
        .catch(() => {});
    }
  }
}
