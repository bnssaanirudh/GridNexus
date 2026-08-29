import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Mock StabilityGate so the ACCEPT branch doesn't require a live Redis / BullMQ worker.
// The real gate is tested in tests/integration/stability-gate.test.ts.
const { mockStabilityGateCheck } = vi.hoisted(() => {
  const mockStabilityGateCheck = vi.fn().mockResolvedValue({ passed: true, checkId: "sc-ci-mock", isStable: true, margin: 10.0 });
  return { mockStabilityGateCheck };
});

vi.mock("../src/services/stabilityGate.js", () => ({
  StabilityGate: { check: mockStabilityGateCheck }
}));

import { createServer } from "http";
import { Server } from "socket.io";
import { setupNegotiationNamespace } from "../src/ws/negotiate";
import { io as Client, Socket } from "socket.io-client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("WebSocket Negotiation Integration", () => {
  let io: Server;
  let serverSocket: any;
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
        io.on("connection", (socket) => {
          serverSocket = socket;
        });
        clientSocket.on("connect", () => resolve());
      });
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Re-wire after restoreAllMocks so the gate never calls BullMQ.
    mockStabilityGateCheck.mockResolvedValue({ passed: true, checkId: "sc-ci-mock", isStable: true, margin: 10.0 });
    if (clientSocket) {
      clientSocket.removeAllListeners();
    }
    // Clean DB for clean tests (FK order: energytransfers before microgrids)
    await prisma.$executeRawUnsafe(`DELETE FROM "energytransfers"`);
    await prisma.$executeRawUnsafe(`DELETE FROM "beliefupdates"`);
    await prisma.$executeRawUnsafe(`DELETE FROM "rlrewards"`);
    await prisma.integritySnapshot.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.negotiation.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.stabilityCheck.deleteMany({});
    await prisma.microgrid.deleteMany({});


    // Seed required mock agents and stability check
    const mg = await prisma.microgrid.create({
      data: { name: "MockMG", hiddenbatterycapacity: "100", hiddengenerationcost: "10" }
    });
    await prisma.agent.create({
      data: { id: "agentA", type: "CONSUMER", microgridId: mg.id }
    });
    await prisma.agent.create({
      data: { id: "agentB", type: "PRODUCER", microgridId: mg.id }
    });
    await prisma.stabilityCheck.create({
      data: { id: "sc-ci-mock", isStable: true, margin: 10.0 }
    });

  });

  it("should run a full 2-agent session to convergence and persist every round", async () => {
    // Mock the Engine API
    let roundCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      roundCount++;
      const body = JSON.parse(options.body);
      
      // Simulate COUNTER_OFFER for 2 rounds, then ACCEPT
      if (roundCount < 3) {
        return {
          ok: true,
          json: async () => ({
            action: "COUNTER_OFFER",
            counter_offer_price: 12.0 + roundCount,
            counter_requested_kwh: 50.0
          })
        };
      } else {
        return {
          ok: true,
          json: async () => ({ action: "ACCEPT" })
        };
      }
    });
    global.fetch = fetchMock;

    const promise = new Promise<void>((resolve) => {
      clientSocket.on("negotiation_complete", (data) => {
        expect(data.status).toBe("ACCEPTED");
        expect(data.finalRound).toBe(3);
        resolve();
      });
    });

    clientSocket.emit("start_negotiation", {
      agentId1: "agentA",
      agentId2: "agentB",
      initialSurplus: 100.0
    });

    await promise;

    // Verify persistence
    const negotiations = await prisma.negotiation.findMany({ include: { beliefUpdates: true } });
    expect(negotiations.length).toBe(1);
    expect(negotiations[0].status).toBe("ACCEPTED");
    expect(negotiations[0].beliefUpdates.length).toBe(4); // 3 rounds + 1 from commitTrade
  });

  it("should gracefully resume if WebSocket drops mid-session", async () => {
    // Round 1: Counter Offer, then we manually disconnect.
    let engineCalls = 0;
    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      engineCalls++;
      return {
        ok: true,
        json: async () => ({
          action: engineCalls >= 3 ? "ACCEPT" : "COUNTER_OFFER",
          counter_offer_price: 15.0,
          counter_requested_kwh: 40.0
        })
      };
    });

    // Create a negotiation manually in DB to simulate a dropped session after round 1
    const dummySignal = await prisma.oracleSignal.findFirst() || await prisma.oracleSignal.create({ data: { signalData: "dummy" }});
    
    const neg = await prisma.negotiation.create({
      data: { status: "PENDING" }
    });
    await prisma.beliefUpdate.create({
      data: {
        negotiationId: neg.id,
        triggeringsignalid: dummySignal.id,
        beforeBelief: 0,
        afterBelief: 15.0
      }
    });

    // Now client connects with negotiationId to resume (will start at round 2)
    const promise = new Promise<void>((resolve) => {
      clientSocket.on("negotiation_complete", (data) => {
        expect(data.status).toBe("ACCEPTED");
        expect(data.finalRound).toBe(4); // Round 2=counter, Round 3=counter, Round 4=accept
        resolve();
      });
    });

    clientSocket.emit("start_negotiation", {
      negotiationId: neg.id,
      agentId1: "agentA",
      agentId2: "agentB",
      initialSurplus: 100.0
    });

    await promise;

    const negotiations = await prisma.negotiation.findMany({ include: { beliefUpdates: true } });
    expect(negotiations.length).toBe(1);
    expect(negotiations[0].beliefUpdates.length).toBe(5); // 1 initial + 3 resumed + 1 from commitTrade
  });

  it("should correctly apply the discount factor exactly as specified across at least 5 rounds", async () => {
    // Engine always counters up to 6 rounds
    let engineCalls = 0;
    const surplusHistory: number[] = [];

    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      engineCalls++;
      const body = JSON.parse(options.body);
      surplusHistory.push(body.surplus);
      
      if (engineCalls >= 5) {
        return { ok: true, json: async () => ({ action: "WALK_AWAY" }) };
      }
      return {
        ok: true,
        json: async () => ({
          action: "COUNTER_OFFER",
          counter_offer_price: 10.0,
          counter_requested_kwh: 10.0
        })
      };
    });

    const promise = new Promise<void>((resolve) => {
      clientSocket.on("negotiation_complete", (data) => {
        expect(data.status).toBe("REJECTED");
        expect(data.finalRound).toBe(5);
        resolve();
      });
    });

    clientSocket.emit("start_negotiation", {
      agentId1: "agentA",
      agentId2: "agentB",
      initialSurplus: 1000.0
    });

    await promise;

    // Verify discount math: initial = 1000, rate = 0.95
    expect(surplusHistory.length).toBe(5);
    expect(surplusHistory[0]).toBeCloseTo(1000.0, 2); // Round 1
    expect(surplusHistory[1]).toBeCloseTo(950.0, 2);  // Round 2
    expect(surplusHistory[2]).toBeCloseTo(902.5, 2);  // Round 3
    expect(surplusHistory[3]).toBeCloseTo(857.375, 2); // Round 4
    expect(surplusHistory[4]).toBeCloseTo(814.50625, 2); // Round 5
  });
});
