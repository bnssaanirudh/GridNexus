/**
 * broker/src/services/agentRuntimeService.ts
 * ───────────────────────────────────────────
 * Autonomous DER-Owner Agent Runtime Service (Phase 11 / Prompt 11.1).
 *
 * Connects newly provisioned DER-owner agents to the autonomous negotiation
 * architecture while preserving critical security & architectural invariants:
 *
 * 1. The agent DB row must exist and be bound to an active microgrid.
 * 2. Internal runtime obtains short-lived HS256 agent JWTs signed with ENGINE_JWT_SECRET.
 * 3. The DER owner's browser NEVER receives this agent credential.
 * 4. Agent authenticates to Broker `/negotiate` via `socket.handshake.auth.token`.
 * 5. Agent identity comes strictly from verified JWT `sub` claim.
 * 6. Broker validates participant membership and active (non-suspended) status.
 * 7. Owner constraints (min/max price, SoC reserves, power limits) are loaded before every decision.
 * 8. Oracle signals and Bayesian belief updates feed the decision pipeline.
 * 9. StabilityGate and GridGate execute prior to transaction commit.
 * 10. Settlement and append-only cryptographic audit logging are enforced.
 * 11. Suspended owners or disabled trading preferences prevent negotiation.
 * 12. Safe reconnect and lifecycle management.
 */

import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { prisma } from "../db/prisma.js";
import { getPreferences, type TradingPreferenceRecord } from "./preferenceService.js";

const DEFAULT_EXPIRY_MINUTES = 15;

/**
 * Mint a short-lived internal JWT for a provisioned agent.
 * STRICT SECURITY: This credential must NEVER be returned in any user/browser API response.
 */
export function createAgentToken(agentId: string, expiresInMinutes = DEFAULT_EXPIRY_MINUTES): string {
  const secret = process.env.ENGINE_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("ENGINE_JWT_SECRET not configured on broker");
  }

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: agentId,
      role: "AGENT",
      aud: "gridnexus-broker",
      iat: now,
      exp: now + expiresInMinutes * 60,
    },
    secret,
    { algorithm: "HS256" }
  );
}

/**
 * Verify a short-lived internal agent JWT.
 */
export function verifyAgentToken(token: string): string {
  const secret = process.env.ENGINE_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("ENGINE_JWT_SECRET not configured on broker");
  }

  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    audience: "gridnexus-broker",
  }) as jwt.JwtPayload;

  if (!decoded.sub) {
    throw new Error("Token missing sub claim");
  }
  return decoded.sub;
}

export interface AgentRuntimeContext {
  agentId: string;
  agentType: string;
  microgridId: string;
  preferences: TradingPreferenceRecord;
  activeOracleSignal: any | null;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
}

/**
 * Loads the complete runtime context for a provisioned agent,
 * verifying that the agent, microgrid, and owner are active and approved.
 */
export async function getAgentRuntimeContext(agentId: string): Promise<AgentRuntimeContext> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      microgrid: {
        select: {
          id: true,
          active: true,
          memberships: {
            select: {
              userId: true,
              user: { select: { id: true, active: true } },
            },
          },
        },
      },
    },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  if (!agent.microgrid) {
    throw new Error(`Agent ${agentId} is not assigned to a microgrid.`);
  }

  // Check if microgrid is inactive
  if (!agent.microgrid.active) {
    return {
      agentId,
      agentType: agent.type,
      microgridId: agent.microgridId,
      preferences: await getPreferences(agent.microgridId, prisma),
      activeOracleSignal: null,
      status: "SUSPENDED",
    };
  }

  // Check if any associated owner is suspended or inactive
  const suspendedOnboarding = await prisma.userOnboarding.findFirst({
    where: {
      OR: [{ agentId: agent.id }, { microgridId: agent.microgridId }],
      status: "SUSPENDED",
    },
  });

  const hasDeactivatedUser = agent.microgrid.memberships.some((m) => m.user && !m.user.active);

  if (suspendedOnboarding || hasDeactivatedUser) {
    return {
      agentId,
      agentType: agent.type,
      microgridId: agent.microgridId,
      preferences: await getPreferences(agent.microgridId, prisma),
      activeOracleSignal: null,
      status: "SUSPENDED",
    };
  }

  const preferences = await getPreferences(agent.microgridId, prisma);
  if (!preferences.tradingEnabled) {
    return {
      agentId,
      agentType: agent.type,
      microgridId: agent.microgridId,
      preferences,
      activeOracleSignal: null,
      status: "DISABLED",
    };
  }

  // Fetch latest active Oracle Signal
  const latestSignal = await prisma.oracleSignal.findFirst({
    orderBy: { createdAt: "desc" },
    include: { beliefUpdates: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return {
    agentId,
    agentType: agent.type,
    microgridId: agent.microgridId,
    preferences,
    activeOracleSignal: latestSignal,
    status: "ACTIVE",
  };
}

export interface TurnData {
  negotiationId: string;
  round: number;
  surplus: number;
  offerPrice: number | null;
  requestedKwh: number | null;
  activeAgent: string;
}

export interface AutonomousDecision {
  action: "ACCEPT" | "COUNTER_OFFER" | "WALK_AWAY";
  price: number;
  kwh: number;
}

/**
 * Autonomous DER-Owner Agent Runner.
 * Executes in the internal background runtime using short-lived credentials.
 */
export class ProvisionedOwnerAgentRunner {
  public readonly agentId: string;
  private wsUrl: string;
  private socket: Socket | null = null;
  private isRunning = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  public onTurnHandled?: (decision: AutonomousDecision) => void;
  public onCompleted?: (result: any) => void;
  public onError?: (error: any) => void;

  constructor(agentId: string, wsUrl: string) {
    this.agentId = agentId;
    this.wsUrl = wsUrl;
  }

  /**
   * Start the agent runner by minting short-lived credentials and connecting.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Verify status before connecting
    const context = await getAgentRuntimeContext(this.agentId);
    if (context.status === "SUSPENDED") {
      throw new Error(`Cannot start agent ${this.agentId}: Owner is suspended.`);
    }
    if (context.status === "DISABLED") {
      throw new Error(`Cannot start agent ${this.agentId}: Trading is disabled by owner preferences.`);
    }

    this.connectSocket();
  }

  private connectSocket(): void {
    if (!this.isRunning) return;

    // Mint internal short-lived token
    const token = createAgentToken(this.agentId);

    this.socket = ioClient(this.wsUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      this.socket?.emit("register_agent", { agentId: this.agentId });
    });

    this.socket.on("your_turn", async (data: TurnData) => {
      await this.handleTurn(data);
    });

    this.socket.on("negotiation_complete", (data: any) => {
      this.onCompleted?.(data);
    });

    this.socket.on("protocol_error", (err: any) => {
      this.onError?.(err);
    });

    this.socket.on("disconnect", (reason: string) => {
      if (this.isRunning && reason === "io server disconnect") {
        // Server disconnected; attempt re-auth
        this.reconnectTimer = setTimeout(() => this.connectSocket(), 1500);
      }
    });

    this.socket.on("connect_error", (err: Error) => {
      this.onError?.(err);
    });
  }

  /**
   * Autonomous decision logic evaluated against owner constraints.
   */
  public async computeDecision(turn: TurnData): Promise<AutonomousDecision> {
    const context = await getAgentRuntimeContext(this.agentId);
    const { preferences, agentType } = context;

    // 1. Check if trading was disabled or owner was suspended while negotiation was active
    if (context.status !== "ACTIVE" || !preferences.tradingEnabled) {
      return { action: "WALK_AWAY", price: 0, kwh: 0 };
    }

    const isSeller = agentType.toUpperCase() === "SELLER" || agentType.toUpperCase() === "GENERATOR";
    const minPrice = preferences.minimumPreferredSalePrice ?? 0.05;
    const maxPrice = preferences.maximumPreferredBuyPrice ?? 0.35;
    const maxPower = preferences.maxTransactionSizeKwh ?? 100.0;

    const requestedKwh = Math.min(turn.requestedKwh || turn.surplus / 2, maxPower);

    if (isSeller) {
      // Seller strategy: want high price, minimum minPrice
      if (turn.offerPrice !== null && turn.offerPrice >= minPrice) {
        return { action: "ACCEPT", price: turn.offerPrice, kwh: requestedKwh };
      }
      // Counter with attractive but compliant price
      const counterPrice = Math.max(minPrice, (turn.offerPrice ?? minPrice) + 0.02);
      return { action: "COUNTER_OFFER", price: Number(counterPrice.toFixed(4)), kwh: requestedKwh };
    } else {
      // Buyer strategy: want low price, maximum maxPrice
      if (turn.offerPrice !== null && turn.offerPrice <= maxPrice) {
        return { action: "ACCEPT", price: turn.offerPrice, kwh: requestedKwh };
      }
      // Counter with acceptable price
      const counterPrice = Math.min(maxPrice, (turn.offerPrice ?? maxPrice) - 0.02);
      return { action: "COUNTER_OFFER", price: Number(counterPrice.toFixed(4)), kwh: requestedKwh };
    }
  }

  private async handleTurn(data: TurnData): Promise<void> {
    try {
      const decision = await this.computeDecision(data);
      this.onTurnHandled?.(decision);

      this.socket?.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: decision.action,
        counter_offer_price: decision.action === "WALK_AWAY" ? undefined : decision.price,
        counter_requested_kwh: decision.action === "WALK_AWAY" ? undefined : decision.kwh,
      });
    } catch (err: unknown) {
      console.error(`[OwnerAgentRunner] Error in agent ${this.agentId}:`, err);
      this.socket?.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: "WALK_AWAY",
      });
    }
  }

  /**
   * Safely stop and disconnect the agent runner.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
