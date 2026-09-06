import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { commitSettlement } from "../services/settlementService.js";
import { StabilityGate } from "../services/stabilityGate.js";
import { GridGate } from "../services/gridGate.js";
import { hasAgentPendingBeliefUpdate } from "../services/beliefUpdateService.js";
import { isProduction } from "../config.js";
import { verifySocketToken } from "../middleware/auth.js";
import { appendAuditEvent } from "../services/auditChain.js";
import {
  getPreferences,
  validateActionAgainstPreferences,
  type ValidationResult,
} from "../services/preferenceService.js";

const prisma = new PrismaClient();

const DISCOUNT_FACTOR = 0.95;
const MAX_ROUNDS = 10;

interface NegotiationInit {
  negotiationId?: string;
  agentIds: string[];
  initialSurplus: number;
}

type NegotiationActionName = "ACCEPT" | "COUNTER_OFFER" | "WALK_AWAY";

interface NegotiationActionInput {
  negotiationId: string;
  action: NegotiationActionName;
  counterOfferPrice?: number;
  counterRequestedKwh?: number;
}

interface ParticipantRecord {
  id: string;
  microgridId: string;
  type: string;
}

interface NegotiationState {
  negId: string;
  agentIds: string[];
  participants: ParticipantRecord[];
  activeAgent: string;
  opponentAgent: string;
  round: number;
  initialSurplus: number;
  currentOfferPrice: number | null;
  currentRequestedKwh: number | null;
  status: "NEGOTIATING" | "COMMITTING" | "WALKED_AWAY" | "MAX_ROUNDS_REACHED";
}

const ACTIONS = new Set<NegotiationActionName>(["ACCEPT", "COUNTER_OFFER", "WALK_AWAY"]);
const MAX_AGENT_ID_LENGTH = 128;
const MAX_NEGOTIATION_ID_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validId(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function parseNegotiationInit(raw: unknown): NegotiationInit | null {
  if (!isRecord(raw)) return null;

  // Keep the original two-field form working for existing test/demo clients while
  // making agentIds the canonical wire representation.
  const legacyAgentIds = [raw.agentId1, raw.agentId2].filter(
    (value): value is string => validId(value, MAX_AGENT_ID_LENGTH)
  );
  const candidateIds = Array.isArray(raw.agentIds) ? raw.agentIds : legacyAgentIds;
  if (
    candidateIds.length !== 2 ||
    !candidateIds.every((value) => validId(value, MAX_AGENT_ID_LENGTH)) ||
    new Set(candidateIds).size !== candidateIds.length
  ) {
    return null;
  }

  const initialSurplus = finiteNumber(raw.initialSurplus);
  if (initialSurplus === undefined || initialSurplus <= 0) return null;
  if (raw.negotiationId !== undefined && !validId(raw.negotiationId, MAX_NEGOTIATION_ID_LENGTH)) {
    return null;
  }

  return {
    negotiationId: raw.negotiationId as string | undefined,
    agentIds: candidateIds as string[],
    initialSurplus,
  };
}

function parseNegotiationAction(raw: unknown, state: NegotiationState): NegotiationActionInput | null {
  if (!isRecord(raw) || !validId(raw.negotiationId, MAX_NEGOTIATION_ID_LENGTH)) return null;
  if (typeof raw.action !== "string" || !ACTIONS.has(raw.action as NegotiationActionName)) return null;

  const action = raw.action as NegotiationActionName;
  const suppliedPrice = finiteNumber(raw.counter_offer_price);
  const suppliedKwh = finiteNumber(raw.counter_requested_kwh);
  const price = suppliedPrice ?? state.currentOfferPrice ?? undefined;
  const kwh = suppliedKwh ?? state.currentRequestedKwh ?? undefined;

  if (action === "COUNTER_OFFER" || action === "ACCEPT") {
    if (price === undefined || price < 0 || kwh === undefined || kwh <= 0) return null;
  }

  return {
    negotiationId: raw.negotiationId,
    action,
    counterOfferPrice: price,
    counterRequestedKwh: kwh,
  };
}

// In-memory state of active negotiations and connected agents. This remains
// process-local until the Redis-backed coordinator lands; production errors
// therefore fail closed rather than synthesizing negotiations.
const connectedAgents: Map<string, string> = new Map(); // agentId -> socketId
const activeNegotiations: Map<string, NegotiationState> = new Map(); // negId -> state

/**
 * Verifies an HS256 JWT issued by the Engine /auth/agent-token endpoint.
 * Returns the `sub` claim (agentId) on success; throws on failure.
 */
function verifyAgentJWT(token: string): string {
  const secret = process.env.ENGINE_JWT_SECRET;
  if (!secret) throw new Error("ENGINE_JWT_SECRET not configured on broker");

  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    audience: "gridnexus-broker",
  });
  if (typeof payload === "string" || !payload.sub) throw new Error("Token missing sub claim");
  return payload.sub;
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
      socket.data.observer = false;
      return next();
    }

    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("AUTH_REQUIRED: missing JWT in socket.handshake.auth.token"));
    }

    try {
      try {
        socket.data.agentId = verifyAgentJWT(token);
        socket.data.observer = false;
        next();
      } catch {
        const viewer = verifySocketToken(token);
        socket.data.agentId = viewer.userId;
        socket.data.observer = true;
        socket.data.viewerRole = viewer.role;
        next();
      }
    } catch (err) {
      next(new Error(`AUTH_FAILED: ${(err as Error).message}`));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id} (Agent: ${socket.data.agentId})`);
    
    // Register agent
    const agentId = socket.data.agentId;
    if (socket.data.observer) {
      socket.join("observers");
      for (const negotiationId of activeNegotiations.keys()) socket.join(negotiationId);
    }

    if (agentId && !socket.data.observer) {
      connectedAgents.set(agentId, socket.id);
      console.log(`[WS] Registered agent: ${agentId}`);
    }

    socket.on("register_agent", (_data: { agentId: string }) => {
      // agentId is taken from the JWT-verified socket.data.agentId.
      // Client-supplied agentId is intentionally ignored to prevent spoofing.
      const verifiedId = socket.data.agentId;
      if (verifiedId && !socket.data.observer) {
        connectedAgents.set(verifiedId, socket.id);
        console.log(`[WS] Re-registered agent: ${verifiedId}`);
      }
    });

    socket.on("start_negotiation", async (raw: unknown) => {
      if (socket.data.observer) {
        socket.emit("protocol_error", {
          code: "FORBIDDEN",
          message: "Dashboard observers cannot start negotiations.",
        });
        return;
      }
      const data = parseNegotiationInit(raw);
      if (!data) {
        socket.emit("protocol_error", {
          code: "INVALID_NEGOTIATION",
          message: "Provide exactly two distinct agentIds and a positive finite initialSurplus.",
        });
        return;
      }

      const callerId = socket.data.agentId as string;
      const legacyTestClient =
        process.env.NODE_ENV === "test" && callerId === "test-agent";
      if (!data.agentIds.includes(callerId) && !legacyTestClient) {
        socket.emit("protocol_error", {
          code: "FORBIDDEN",
          message: "The authenticated agent must be a negotiation participant.",
        });
        return;
      }

      const failClosed = isProduction() || process.env.NODE_ENV === "production";

      try {
        let participants: ParticipantRecord[] = [];
        try {
          participants = await prisma.agent.findMany({
            where: { id: { in: data.agentIds } },
            select: { id: true, microgridId: true, type: true },
          });
        } catch (error) {
          if (failClosed) throw error;
          console.warn("[WS] Participant lookup unavailable in simulation/test mode.");
        }

        if (participants.length > 0 && participants.length !== data.agentIds.length) {
          socket.emit("protocol_error", {
            code: "UNKNOWN_AGENT",
            message: "Every negotiation participant must exist.",
          });
          return;
        }
        if (failClosed && participants.length !== data.agentIds.length) {
          throw new Error("Participant verification failed.");
        }

        for (const agentId of data.agentIds) {
          try {
            if (await hasAgentPendingBeliefUpdate(agentId)) {
              socket.emit("belief_update_pending", { agentId });
              return;
            }
          } catch (error) {
            if (failClosed) throw error;
            console.warn("[WS] Belief-update gate unavailable in simulation/test mode.");
          }
        }

        for (const participant of participants) {
          try {
            const pref = await getPreferences(participant.microgridId, prisma);
            if (!pref.tradingEnabled) {
              socket.emit("protocol_error", {
                code: "TRADING_DISABLED",
                message: `Trading is disabled by owner preferences for participant ${participant.id} (microgrid ${participant.microgridId}).`,
              });
              return;
            }
          } catch (error) {
            if (failClosed) throw error;
            console.warn("[WS] Preference check unavailable in simulation/test mode.");
          }
        }

        let negId = data.negotiationId;
        if (negId) {
          try {
            const existing = await prisma.negotiation.findUnique({
              where: { id: negId },
              select: { id: true },
            });
            if (!existing) {
              socket.emit("protocol_error", {
                code: "UNKNOWN_NEGOTIATION",
                message: "The requested negotiation does not exist.",
              });
              return;
            }
          } catch (error) {
            if (failClosed) throw error;
          }
        } else {
          try {
            const negotiation = await prisma.negotiation.create({
              data: { status: "NEGOTIATING" },
            });
            negId = negotiation.id;
          } catch (error) {
            if (failClosed) throw error;
            negId = "mock-neg-" + Date.now();
          }
        }

        if (!negId) throw new Error("Negotiation ID was not created.");
        if (activeNegotiations.has(negId)) {
          socket.emit("protocol_error", {
            code: "NEGOTIATION_ACTIVE",
            message: "This negotiation is already active.",
          });
          return;
        }

        const negState: NegotiationState = {
          negId,
          agentIds: data.agentIds,
          participants,
          activeAgent: data.agentIds[0],
          opponentAgent: data.agentIds[1],
          round: 1,
          initialSurplus: data.initialSurplus,
          currentOfferPrice: null,
          currentRequestedKwh: null,
          status: "NEGOTIATING",
        };

        activeNegotiations.set(negId, negState);

        for (const participantId of data.agentIds) {
          const participantSocketId = connectedAgents.get(participantId);
          if (participantSocketId) {
            nsp.sockets.get(participantSocketId)?.join(negId);
          }
        }
        socket.join(negId);
        nsp.in("observers").socketsJoin(negId);
        nsp.to(negId).emit("status", {
          message: "Negotiation started",
          negotiationId: negId,
          round: 1,
        });
        notifyTurn(negState, nsp);
      } catch (error) {
        console.error("[WS] Error starting negotiation:", error);
        socket.emit("protocol_error", {
          code: "NEGOTIATION_START_FAILED",
          message: "Negotiation could not be started safely.",
        });
      }
    });

    socket.on("agent_action", async (raw: unknown) => {
      if (socket.data.observer) {
        socket.emit("protocol_error", {
          code: "FORBIDDEN",
          message: "Dashboard observers cannot submit agent actions.",
        });
        return;
      }
      if (!isRecord(raw) || !validId(raw.negotiationId, MAX_NEGOTIATION_ID_LENGTH)) {
        socket.emit("protocol_error", {
          code: "INVALID_ACTION",
          message: "A valid negotiationId and action are required.",
        });
        return;
      }

      const negState = activeNegotiations.get(raw.negotiationId);
      if (!negState) {
        socket.emit("protocol_error", {
          code: "UNKNOWN_NEGOTIATION",
          message: "No active negotiation was found.",
        });
        return;
      }

      const socketAgentId = socket.data.agentId as string;
      const effectiveAgentId =
        process.env.NODE_ENV === "test" &&
        socketAgentId === "test-agent" &&
        validId(raw.agentId, MAX_AGENT_ID_LENGTH) &&
        negState.agentIds.includes(raw.agentId)
          ? raw.agentId
          : socketAgentId;

      if (!negState.agentIds.includes(effectiveAgentId)) {
        socket.emit("protocol_error", {
          code: "FORBIDDEN",
          message: "The authenticated agent is not a participant.",
        });
        return;
      }
      if (negState.status !== "NEGOTIATING") {
        socket.emit("protocol_error", {
          code: "INVALID_STATE",
          message: "The negotiation is no longer accepting actions.",
        });
        return;
      }
      if (negState.activeAgent !== effectiveAgentId) {
        socket.emit("protocol_error", {
          code: "NOT_YOUR_TURN",
          message: "Only the active authenticated agent may act.",
        });
        return;
      }

      const data = parseNegotiationAction(raw, negState);
      if (!data) {
        socket.emit("protocol_error", {
          code: "INVALID_ACTION",
          message: "Use a supported action and finite values: price >= 0 and kWh > 0.",
        });
        return;
      }

      if (negState.participants.length === 0 && negState.agentIds.length > 0) {
        try {
          negState.participants = await prisma.agent.findMany({
            where: { id: { in: negState.agentIds } },
            select: { id: true, microgridId: true, type: true },
          });
        } catch {
          // simulation fallback
        }
      }

      const sellerTypes = new Set(["SELLER", "PRODUCER", "GENERATOR"]);
      const buyerTypes = new Set(["BUYER", "CONSUMER", "LOAD"]);

      try {
        const activeParticipant = negState.participants.find((p) => p.id === negState.activeAgent);
        if (activeParticipant && (data.action === "COUNTER_OFFER" || data.action === "ACCEPT")) {
          const activeRole = sellerTypes.has(activeParticipant.type.toUpperCase()) ? "SELLER" : "BUYER";
          const valResult = await validateActionAgainstPreferences(
            {
              microgridId: activeParticipant.microgridId,
              agentId: activeParticipant.id,
              role: activeRole,
              action: data.action,
              price: data.counterOfferPrice as number,
              kwh: data.counterRequestedKwh as number,
            },
            prisma
          );

          if (!valResult.satisfied) {
            try {
              await prisma.$transaction(async (tx) => {
                await appendAuditEvent(tx as any, {
                  eventType: "VALIDATION_FAILED",
                  negotiationId: negState.negId,
                  actorId: negState.activeAgent,
                  payload: {
                    stage: "OWNER_PREFERENCE_CONSTRAINT",
                    code: valResult.code,
                    reason: valResult.reason,
                    details: valResult.details,
                    attemptedAction: data.action,
                    price: data.counterOfferPrice,
                    kwh: data.counterRequestedKwh,
                  },
                });
              });
            } catch (auditErr) {
              console.warn("[WS] Audit logging failed for constraint violation:", auditErr);
            }

            socket.emit("protocol_error", {
              code: "CONSTRAINT_VIOLATION",
              message: `Owner constraint violated: ${valResult.reason}`,
              details: valResult.details,
            });
            return;
          }

          if (data.action === "ACCEPT") {
            const opponentParticipant = negState.participants.find(
              (p) => p.id === negState.opponentAgent
            );
            if (opponentParticipant) {
              const oppRole = sellerTypes.has(opponentParticipant.type.toUpperCase())
                ? "SELLER"
                : "BUYER";
              const oppValResult = await validateActionAgainstPreferences(
                {
                  microgridId: opponentParticipant.microgridId,
                  agentId: opponentParticipant.id,
                  role: oppRole,
                  action: "ACCEPT",
                  price: data.counterOfferPrice as number,
                  kwh: data.counterRequestedKwh as number,
                },
                prisma
              );

              if (!oppValResult.satisfied) {
                try {
                  await prisma.$transaction(async (tx) => {
                    await appendAuditEvent(tx as any, {
                      eventType: "VALIDATION_FAILED",
                      negotiationId: negState.negId,
                      actorId: negState.opponentAgent,
                      payload: {
                        stage: "OWNER_PREFERENCE_CONSTRAINT",
                        code: oppValResult.code,
                        reason: oppValResult.reason,
                        details: oppValResult.details,
                        attemptedAction: data.action,
                        price: data.counterOfferPrice,
                        kwh: data.counterRequestedKwh,
                      },
                    });
                  });
                } catch (auditErr) {
                  console.warn("[WS] Audit logging failed for constraint violation:", auditErr);
                }

                socket.emit("protocol_error", {
                  code: "CONSTRAINT_VIOLATION",
                  message: `Owner constraint violated: ${oppValResult.reason}`,
                  details: oppValResult.details,
                });
                return;
              }
            }
          }
        }
      } catch (prefErr) {
        if (failClosed) {
          socket.emit("protocol_error", {
            code: "CONSTRAINT_EVALUATION_FAILED",
            message: "Failed to evaluate owner constraints safely.",
          });
          return;
        }
        console.warn("[WS] Preference validation unavailable in simulation/test mode:", prefErr);
      }

      const currentSurplus =
        negState.initialSurplus * Math.pow(DISCOUNT_FACTOR, negState.round - 1);
      const decisionSource = "LLM_AGENT";
      const failClosed = isProduction() || process.env.NODE_ENV === "production";

      try {
        await prisma.negotiationRound.create({
          data: {
            negotiationId: negState.negId,
            roundNumber: negState.round,
            activeAgentId: negState.activeAgent,
            opponentAgentId: negState.opponentAgent,
            action: data.action,
            surplus: currentSurplus,
            decisionSource,
          },
        });
      } catch (error) {
        if (failClosed) {
          socket.emit("protocol_error", {
            code: "PERSISTENCE_FAILED",
            message: "The action was not accepted because its audit record could not be stored.",
          });
          return;
        }
        console.warn("[WS] Negotiation round persistence unavailable in simulation/test mode.");
      }

      nsp.to(negState.negId).emit("round_update", {
        negotiationId: negState.negId,
        round: negState.round,
        activeAgent: negState.activeAgent,
        action: data.action,
        currentSurplus,
        discountedSurplus: currentSurplus,
        decision_source: decisionSource,
        counter_offer_price: data.counterOfferPrice,
        counter_requested_kwh: data.counterRequestedKwh,
      });

      if (data.action === "ACCEPT") {
        negState.status = "COMMITTING";
        await handleCommit(
          negState,
          data.counterOfferPrice as number,
          data.counterRequestedKwh as number,
          currentSurplus,
          nsp
        );
        activeNegotiations.delete(negState.negId);
        return;
      }

      if (data.action === "WALK_AWAY") {
        negState.status = "WALKED_AWAY";
        await prisma.negotiation
          .update({ where: { id: negState.negId }, data: { status: "WALKED_AWAY" } })
          .catch((error) => {
            if (failClosed) throw error;
          });
        nsp.to(negState.negId).emit("negotiation_complete", {
          negotiationId: negState.negId,
          status: "WALKED_AWAY",
          finalRound: negState.round,
        });
        activeNegotiations.delete(negState.negId);
        return;
      }

      negState.currentOfferPrice = data.counterOfferPrice as number;
      negState.currentRequestedKwh = data.counterRequestedKwh as number;
      [negState.activeAgent, negState.opponentAgent] = [
        negState.opponentAgent,
        negState.activeAgent,
      ];
      negState.round += 1;

      if (negState.round > MAX_ROUNDS) {
        negState.status = "MAX_ROUNDS_REACHED";
        await prisma.negotiation
          .update({ where: { id: negState.negId }, data: { status: "MAX_ROUNDS_REACHED" } })
          .catch((error) => {
            if (failClosed) throw error;
          });
        nsp.to(negState.negId).emit("negotiation_complete", {
          negotiationId: negState.negId,
          status: "MAX_ROUNDS_REACHED",
          finalRound: MAX_ROUNDS,
        });
        activeNegotiations.delete(negState.negId);
      } else {
        setTimeout(() => notifyTurn(negState, nsp), 600);
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

  function notifyTurn(negState: NegotiationState, namespace: typeof nsp): void {
    let socketId = connectedAgents.get(negState.activeAgent);
    if (!socketId && process.env.NODE_ENV === "test") {
      socketId = connectedAgents.get("test-agent");
    }
    if (socketId) {
      const currentSurplus =
        negState.initialSurplus * Math.pow(DISCOUNT_FACTOR, negState.round - 1);
      namespace.to(socketId).emit("your_turn", {
        negotiationId: negState.negId,
        round: negState.round,
        surplus: currentSurplus,
        offerPrice: negState.currentOfferPrice,
        requestedKwh: negState.currentRequestedKwh,
        activeAgent: negState.activeAgent,
      });
    } else {
      console.warn("[WS] Active agent " + negState.activeAgent + " is not connected.");
    }
  }

  async function handleCommit(
    negState: NegotiationState,
    price: number,
    kwh: number,
    surplus: number,
    namespace: typeof nsp
  ): Promise<void> {
    const failClosed = isProduction() || process.env.NODE_ENV === "production";

    try {
      if (!Number.isFinite(price) || price < 0 || !Number.isFinite(kwh) || kwh <= 0) {
        throw new Error("Invalid settlement values.");
      }

      await prisma.negotiation
        .update({ where: { id: negState.negId }, data: { status: "SAFETY_VERIFIED" } })
        .catch((error) => {
          if (failClosed) throw error;
        });

      const gateResult = await StabilityGate.check({
        negotiationId: negState.negId,
        agentIds: negState.agentIds,
        currentOfferPrice: price,
        currentRequestedKwh: kwh,
        currentSurplus: surplus,
        io: namespace,
      });
      if (!gateResult.passed) return;

      const gridResult = await GridGate.check({
        negotiationId: negState.negId,
        agentIds: negState.agentIds,
        currentRequestedKwh: kwh,
        intervalMinutes: 60,
        io: namespace,
      });
      if (!gridResult.passed) return;

      let participants = negState.participants;
      if (participants.length !== negState.agentIds.length) {
        participants = await prisma.agent.findMany({
          where: { id: { in: negState.agentIds } },
          select: { id: true, microgridId: true, type: true },
        });
      }
      if (participants.length !== negState.agentIds.length) {
        throw new Error("Could not resolve every agent to a microgrid.");
      }

      const sellerTypes = new Set(["SELLER", "PRODUCER", "GENERATOR"]);
      const buyerTypes = new Set(["BUYER", "CONSUMER", "LOAD"]);
      let seller = participants.find((participant) =>
        sellerTypes.has(participant.type.toUpperCase())
      );
      let buyer = participants.find((participant) =>
        buyerTypes.has(participant.type.toUpperCase())
      );

      if (!seller || !buyer) {
        if (failClosed) {
          throw new Error("Participants do not declare one seller and one buyer.");
        }
        seller = participants.find((participant) => participant.id === negState.activeAgent);
        buyer = participants.find((participant) => participant.id === negState.opponentAgent);
      }
      if (!seller || !buyer || seller.id === buyer.id) {
        throw new Error("Settlement direction could not be resolved.");
      }
      if (seller.microgridId === buyer.microgridId) {
        throw new Error("A settlement cannot transfer energy within the same microgrid.");
      }

      const deliveryStart = new Date();
      const deliveryEnd = new Date(deliveryStart.getTime() + 60 * 60 * 1_000);
      const idempotencyKey =
        "neg-" + negState.negId + "-r" + negState.round;

      const { settlement } = await commitSettlement({
        idempotencyKey,
        negotiationId: negState.negId,
        sellerMicrogridId: seller.microgridId,
        buyerMicrogridId: buyer.microgridId,
        energyKwh: kwh,
        pricePerKwh: price,
        deliveryStart,
        deliveryEnd,
        stabilityCheckId: gateResult.checkId,
        gridCertificateId: gridResult.certId,
        energyTransferData: {
          amount: kwh,
          price,
          startTime: deliveryStart,
          intervalMinutes: 60,
          averagePowerKw: kwh,
          stabilitycheckid: gateResult.checkId,
          gridcertificateid: gridResult.certId,
        },
        rlRewardData: {
          agentId: negState.activeAgent,
          rewardValue: surplus,
        },
      });

      namespace.to(negState.negId).emit("negotiation_complete", {
        negotiationId: negState.negId,
        settlementId: settlement.id,
        status: "COMMITTED",
        finalRound: negState.round,
      });
    } catch (error) {
      console.error("[WS] Settlement failed for negotiation " + negState.negId + ":", error);
      namespace.to(negState.negId).emit("settlement_failed", {
        negotiationId: negState.negId,
        reason: failClosed
          ? "A required settlement verification failed."
          : error instanceof Error
            ? error.message
            : "Internal settlement error",
      });
      await prisma.negotiation
        .update({ where: { id: negState.negId }, data: { status: "FAILED" } })
        .catch(() => undefined);
    }
  }
}
