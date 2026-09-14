/**
 * broker/tests/belief-gate.test.ts
 * ─────────────────────────────────
 * Belief-update negotiation gate test.
 *
 * Verifies that:
 *   1. An agent with a PENDING belief update cannot start a new negotiation
 *      (receives belief_update_pending event).
 *   2. Once the belief update is COMPLETE, the negotiation proceeds normally.
 *
 * All external I/O is mocked (Prisma, BullMQ, fetch).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupNegotiationNamespace } from "../src/ws/negotiate";
import { io as Client, Socket } from "socket.io-client";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Track which agentIds currently have a PENDING belief update
const pendingAgents = new Set<string>();

vi.mock("@prisma/client", () => {
  const PrismaClient = vi.fn(function (this: any) {
    this.beliefUpdate = {
      findFirst: vi.fn().mockImplementation(async (args: any) => {
        const agentId = args?.where?.agentId;
        const status  = args?.where?.status;
        if (status === "PENDING" && pendingAgents.has(agentId)) {
          return { id: "bu-pending", agentId, status: "PENDING" };
        }
        return null;
      }),
      create: vi.fn().mockResolvedValue({ id: `bu-${Date.now()}`, status: "COMPLETE" }),
      update: vi.fn().mockResolvedValue({ id: "bu-mock", status: "COMPLETE" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    this.negotiation = {
      create: vi.fn().mockResolvedValue({ id: "neg-gate-test", status: "PENDING" }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "neg-gate-test", status: "PENDING" }),
    };
    this.oracleSignal = {
      findFirst: vi.fn().mockResolvedValue({ id: "sig-dummy", signalData: "{}" }),
      create: vi.fn().mockResolvedValue({ id: "sig-dummy", signalData: "{}" }),
    };
    this.bus = { findMany: vi.fn().mockResolvedValue([{ id: "bus1", voltageLevelKv: 12, microgrids: [] }]) };
    this.line = { findMany: vi.fn().mockResolvedValue([]) };
    this.agent = {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([
        { id: "agent-free-1", microgridId: "mg-1", type: "SELLER", microgrid: { hiddengenerationcost: "...", hiddenbatterycapacity: "...", ders: [], tradingPreference: { maximumPreferredBuyPrice: 10.0 } } },
        { id: "agent-free-2", microgridId: "mg-2", type: "BUYER", microgrid: { hiddengenerationcost: "...", hiddenbatterycapacity: "...", ders: [], tradingPreference: { maximumPreferredBuyPrice: 10.0 } } }
      ]),
    };
    this.stabilityCheck = {
      create: vi.fn().mockResolvedValue({ id: "sc-gate", isStable: true, margin: 5.0 }),
    };
    this.rlReward = {
      create: vi.fn().mockResolvedValue({ id: "rr-mock" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    this.energyTransfer = {
      create: vi.fn().mockResolvedValue({ id: "et-mock" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    this.settlement = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "settle-mock", status: "COMMITTED" }),
      update: vi.fn().mockRejectedValue(new Error("Table settlements is append-only. UPDATE and DELETE are restricted.")),
    };
    this.negotiationRound = {
      create: vi.fn().mockResolvedValue({ id: "nr-mock" }),
    };
    this.auditEvent = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "ae-mock" }),
    };
    this.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(this));
    this.$disconnect = vi.fn();
  });
  return { PrismaClient };
});

vi.mock("../src/services/stabilityGate.js", () => ({
  StabilityGate: {
    check: vi.fn().mockResolvedValue({
      passed: true,
      checkId: "sc-gate",
      isStable: true,
      margin: 5.0,
    }),
  },
}));

vi.mock("../src/services/gridGate.js", () => ({
  GridGate: {
    check: vi.fn().mockResolvedValue({
      passed: true,
      certId: "gc-gate",
      feasible: true,
      losses: 0.1,
    }),
  },
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(function (this: any) {
    this.add = vi.fn().mockResolvedValue({ waitUntilFinished: vi.fn().mockResolvedValue({ certId: "mock-cert", isFeasible: true, isStable: true, margin: 5.0 }) });
    this.getRepeatableJobs = vi.fn().mockResolvedValue([]);
    this.removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
  Worker: vi.fn(function (this: any) {
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
  QueueEvents: vi.fn(function (this: any) {
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock("ioredis", () => ({
  default: vi.fn(function (this: any) {}),
}));


// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Belief-Update Negotiation Gate ", () => {
  let io: Server;
  let clientSocket1: Socket;
  let clientSocket2: Socket;
  let port: number;

  beforeAll(async () => {
    const httpServer = createServer();
    io = new Server(httpServer);
    setupNegotiationNamespace(io);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as any).port;
        clientSocket1 = Client(`http://localhost:${port}/negotiate`, { query: { agentId: "agent-free-1" }});
        clientSocket2 = Client(`http://localhost:${port}/negotiate`, { query: { agentId: "agent-free-2" }});
        
        let connected = 0;
        const check = () => { if (++connected === 2) resolve(); };
        clientSocket1.on("connect", check);
        clientSocket2.on("connect", check);
      });
    });
  });

  afterAll(() => {
    io.close();
    clientSocket1.disconnect();
    clientSocket2.disconnect();
  });

  beforeEach(() => {
    pendingAgents.clear();
    clientSocket1.removeAllListeners();
    clientSocket2.removeAllListeners();
    
    const handler = (data: any, socket: Socket) => {
      socket.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: "ACCEPT",
        decision_source: "LLM",
        counter_offer_price: 10,
        counter_requested_kwh: 50,
      });
    };
    
    clientSocket1.on("your_turn", (data) => handler(data, clientSocket1));
    clientSocket2.on("your_turn", (data) => handler(data, clientSocket2));
  });

  // ── Gate test 1: Agent with PENDING belief update is blocked ───────────────

  it("T1: emits belief_update_pending when agentId1 has a pending belief update", async () => {
    pendingAgents.add("agent-free-1");

    const deferred = new Promise<any>((resolve) => {
      clientSocket1.on("belief_update_pending", resolve);
    });

    clientSocket1.emit("start_negotiation", {
      agentIds: ["agent-free-1", "agent-free-2"],
      initialSurplus: 100.0,
    });

    const payload = await deferred;
    expect(payload.agentId).toEqual("agent-free-1");
  });

  it("T2: emits belief_update_pending when agentId2 has a pending belief update", async () => {
    pendingAgents.add("agent-free-2");

    const deferred = new Promise<any>((resolve) => {
      clientSocket1.on("belief_update_pending", resolve);
    });

    clientSocket1.emit("start_negotiation", {
      agentIds: ["agent-free-1", "agent-free-2"],
      initialSurplus: 100.0,
    });

    const payload = await deferred;
    expect(payload.agentId).toEqual("agent-free-2");
  });

  // ── Gate test 2: Once COMPLETE, negotiation proceeds ──────────────────────

  it("T3: negotiation proceeds (no belief_update_pending) when no agent is blocked", async () => {
    // No agents in pendingAgents → gate is open

    const statusReceived = new Promise<any>((resolve) => {
      clientSocket1.on("status", resolve);
    });
    const rejectedOrComplete = new Promise<any>((resolve) => {
      clientSocket1.on("negotiation_complete", resolve);
      clientSocket1.on("stability_rejected", resolve);
    });

    clientSocket1.emit("start_negotiation", {
      agentIds: ["agent-free-1", "agent-free-2"],
      initialSurplus: 100.0,
    });

    // Status event means the gate was passed (negotiation session started)
    const statusPayload = await statusReceived;
    expect(statusPayload.message).toContain("Negotiation started");
    
    // Wait for completion
    await rejectedOrComplete;
  });

  // ── Gate test 3: Blocking then releasing ──────────────────────────────────

  it("T4: agent blocked while PENDING, then passes once cleared", async () => {
    pendingAgents.add("agent-free-1");

    // First attempt → blocked
    const firstDeferred = new Promise<any>((resolve) => {
      clientSocket1.on("belief_update_pending", resolve);
    });
    clientSocket1.emit("start_negotiation", {
      agentIds: ["agent-free-1", "agent-free-2"],
      initialSurplus: 50.0,
    });
    const blocked = await firstDeferred;
    expect(blocked.agentId).toBe("agent-free-1");

    // Clear the pending state (simulate belief update completing)
    pendingAgents.delete("agent-free-1");
    clientSocket1.removeAllListeners();
    clientSocket2.removeAllListeners();

    // After removing listeners, add the turn handler back
    const handler = (data: any, socket: Socket) => {
      socket.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: "ACCEPT",
        decision_source: "LLM",
        counter_offer_price: 10,
        counter_requested_kwh: 50,
      });
    };
    clientSocket1.on("your_turn", (data) => handler(data, clientSocket1));
    clientSocket2.on("your_turn", (data) => handler(data, clientSocket2));

    // Second attempt → gate open, session starts
    const statusReceived = new Promise<any>((resolve) => {
      clientSocket1.on("status", resolve);
    });
    const completed = new Promise<any>((resolve) => {
      clientSocket1.on("negotiation_complete", resolve);
      clientSocket1.on("stability_rejected", resolve);
    });

    // NOTE: Need to use agent-free-1 as it is the ID for socket1, and agent-free-2 for socket2.
    // So that they can actually receive the 'your_turn' messages.
    clientSocket1.emit("start_negotiation", {
      agentIds: ["agent-free-1", "agent-free-2"],
      initialSurplus: 50.0,
    });

    const status = await statusReceived;
    expect(status.message).toContain("Negotiation started");
    await completed;
  });
});
