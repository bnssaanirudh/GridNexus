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
    this.agent = { findUnique: vi.fn().mockResolvedValue(null) };
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

vi.mock("bullmq", () => ({
  Queue: vi.fn(function (this: any) {
    this.add = vi.fn().mockResolvedValue({});
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
  let clientSocket: Socket;
  let port: number;

  beforeAll(async () => {
    const httpServer = createServer();
    io = new Server(httpServer);
    setupNegotiationNamespace(io);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as any).port;
        clientSocket = Client(`http://localhost:${port}/negotiate`);
        clientSocket.on("connect", resolve);
      });
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.disconnect();
  });

  beforeEach(() => {
    pendingAgents.clear();
    clientSocket.removeAllListeners();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ action: "ACCEPT", decision_source: "LLM" }),
    });
  });

  // ── Gate test 1: Agent with PENDING belief update is blocked ───────────────

  it("T1: emits belief_update_pending when agentId1 has a pending belief update", async () => {
    pendingAgents.add("agent-pending");

    const deferred = new Promise<any>((resolve) => {
      clientSocket.on("belief_update_pending", resolve);
    });

    clientSocket.emit("start_negotiation", {
      agentId1: "agent-pending",
      agentId2: "agent-ready",
      initialSurplus: 100.0,
    });

    const payload = await deferred;
    expect(payload.agentId).toBe("agent-pending");
    expect(payload.message).toContain("Negotiation deferred");
  });

  it("T2: emits belief_update_pending when agentId2 has a pending belief update", async () => {
    pendingAgents.add("agent-also-pending");

    const deferred = new Promise<any>((resolve) => {
      clientSocket.on("belief_update_pending", resolve);
    });

    clientSocket.emit("start_negotiation", {
      agentId1: "agent-ready",
      agentId2: "agent-also-pending",
      initialSurplus: 100.0,
    });

    const payload = await deferred;
    expect(payload.agentId).toBe("agent-also-pending");
  });

  // ── Gate test 2: Once COMPLETE, negotiation proceeds ──────────────────────

  it("T3: negotiation proceeds (no belief_update_pending) when no agent is blocked", async () => {
    // No agents in pendingAgents → gate is open

    const statusReceived = new Promise<any>((resolve) => {
      clientSocket.on("status", resolve);
    });
    const rejectedOrComplete = new Promise<any>((resolve) => {
      clientSocket.on("negotiation_complete", resolve);
      clientSocket.on("stability_rejected", resolve);
    });

    clientSocket.emit("start_negotiation", {
      agentId1: "agent-free-1",
      agentId2: "agent-free-2",
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
    pendingAgents.add("agent-transition");

    // First attempt → blocked
    const firstDeferred = new Promise<any>((resolve) => {
      clientSocket.on("belief_update_pending", resolve);
    });
    clientSocket.emit("start_negotiation", {
      agentId1: "agent-transition",
      agentId2: "agent-free-3",
      initialSurplus: 50.0,
    });
    const blocked = await firstDeferred;
    expect(blocked.agentId).toBe("agent-transition");

    // Clear the pending state (simulate belief update completing)
    pendingAgents.delete("agent-transition");
    clientSocket.removeAllListeners();

    // Second attempt → gate open, session starts
    const statusReceived = new Promise<any>((resolve) => {
      clientSocket.on("status", resolve);
    });
    const completed = new Promise<any>((resolve) => {
      clientSocket.on("negotiation_complete", resolve);
      clientSocket.on("stability_rejected", resolve);
    });

    clientSocket.emit("start_negotiation", {
      agentId1: "agent-transition",
      agentId2: "agent-free-3",
      initialSurplus: 50.0,
    });

    const status = await statusReceived;
    expect(status.message).toContain("Negotiation started");
    await completed;
  });
});
