import { io, Socket } from "socket.io-client";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";

const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:8000";

function createAgentToken(agentId: string): string {
  const secret = process.env.ENGINE_JWT_SECRET;
  if (!secret) throw new Error("ENGINE_JWT_SECRET not configured");
  return jwt.sign({ sub: agentId, role: "AGENT" }, secret, {
    algorithm: "HS256",
    audience: "gridnexus-broker",
    expiresIn: "1h",
  });
}

export async function startLiveDemoTrade(): Promise<void> {
  const port = process.env.PORT || 3000;
  const wsUrl = `http://localhost:${port}/negotiate`;

  // 1. Pick two distinct agents (one SELLER, one BUYER)
  const seller = await prisma.agent.findFirst({ where: { type: "SELLER" } });
  const buyer = await prisma.agent.findFirst({ where: { type: "BUYER" } });
  
  if (!seller || !buyer) {
    throw new Error("Could not find suitable SELLER and BUYER agents in the database.");
  }

  const agent1Id = seller.id;
  const agent2Id = buyer.id;

  // 2. Connect sockets
  const token1 = createAgentToken(agent1Id);
  const token2 = createAgentToken(agent2Id);

  const socket1 = io(wsUrl, { auth: { token: token1 } });
  const socket2 = io(wsUrl, { auth: { token: token2 } });

  let isComplete = false;
  let hasStarted = false;

  const cleanup = () => {
    isComplete = true;
    socket1.disconnect();
    socket2.disconnect();
  };

  const handleTurn = async (socket: Socket, agentId: string, opponentId: string, data: any) => {
    if (isComplete) return;

    try {
      const response = await fetch(`${ENGINE_URL}/negotiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          opponent_id: opponentId,
          negotiation_id: data.negotiationId,
          current_offer_price: data.offerPrice ?? null,
          current_requested_kwh: data.requestedKwh ?? null,
          round_number: data.round,
          surplus: data.surplus
        })
      });

      if (!response.ok) {
        console.error(`Engine returned error: ${response.status} ${response.statusText}`);
        cleanup();
        return;
      }

      const engineDecision = (await response.json()) as any;
      
      socket.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: engineDecision.action,
        counter_offer_price: engineDecision.counter_offer_price ?? undefined,
        counter_requested_kwh: engineDecision.counter_requested_kwh ?? undefined
      });
      
    } catch (e) {
      console.error("Error asking engine for decision:", e);
      cleanup();
    }
  };

  socket1.on("your_turn", (data) => handleTurn(socket1, agent1Id, agent2Id, data));
  socket2.on("your_turn", (data) => handleTurn(socket2, agent2Id, agent1Id, data));

  const endSession = () => cleanup();
  socket1.on("negotiation_complete", endSession);
  socket2.on("negotiation_complete", endSession);
  socket1.on("settlement_failed", endSession);
  socket2.on("settlement_failed", endSession);
  socket1.on("protocol_error", (err) => { console.error("Protocol Error:", err); cleanup(); });

  const tryStart = () => {
    if (!hasStarted && socket1.connected && socket2.connected) {
        hasStarted = true;
        socket1.emit("start_negotiation", {
            agentIds: [agent1Id, agent2Id],
            initialSurplus: 150.0
        });
    }
  };

  socket1.on("connect", tryStart);
  socket2.on("connect", tryStart);
  
  // Timeout safety
  setTimeout(() => {
    if (!isComplete) {
        console.log("Demo trade timeout reached, disconnecting mock agents.");
        cleanup();
    }
  }, 120000);
}
