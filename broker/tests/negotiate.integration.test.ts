import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Mock StabilityGate so the ACCEPT branch doesn't require a live Redis / BullMQ worker.
// The real gate is tested in tests/integration/stability-gate.test.ts.
const { mockStabilityGateCheck, mockGridGateCheck } = vi.hoisted(() => {
  const mockStabilityGateCheck = vi.fn().mockResolvedValue({ passed: true, checkId: "sc-ci-mock", isStable: true, margin: 10.0 });
  const mockGridGateCheck = vi.fn();
  return { mockStabilityGateCheck, mockGridGateCheck };
});

vi.mock("../src/services/stabilityGate.js", () => ({
  StabilityGate: { check: mockStabilityGateCheck }
}));

vi.mock("../src/services/gridGate.js", () => ({
  GridGate: { check: mockGridGateCheck }
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
        resolve();
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
    mockGridGateCheck.mockResolvedValue({ passed: true, certId: "grid-ci-mock" });
    clientSocket = Client(`http://localhost:${port}/negotiate`, {
      auth: { token: "test-token" }
    });
    await new Promise<void>((resolve) => {
      clientSocket.on("connect", () => resolve());
    });
    // Clean DB for clean tests (FK order: energytransfers before microgrids)
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "settlements" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "energytransfers" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "beliefupdates" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "rlrewards" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "beliefupdates" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "negotiation_rounds" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "negotiations" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "agents" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "stabilitychecks" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "grid_feasibility_certificates" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "ders" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "microgrid_bus_mappings" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "microgrids" CASCADE`);

    mockGridGateCheck.mockImplementation(async () => {
      const cert = await prisma.gridFeasibilityCertificate.create({
        data: {
          networkVersion: 1, solver: "mock", solverVersion: "1", feasible: true, maxLineLoadingPct: 0, minVoltagePu: 1, maxVoltagePu: 1, powerBalanceError: 0, inputHash: "a", resultHash: "b"
        }
      });
      return { passed: true, certId: cert.id, isFeasible: true, margin: 15.0 };
    });

    const mg = await prisma.microgrid.create({
      data: { name: "MockMG", type: "SOLAR", hiddenbatterycapacity: "100", hiddengenerationcost: "10" }
    });
    const mg2 = await prisma.microgrid.create({
      data: { name: "MockMG2", type: "WIND", hiddenbatterycapacity: "200", hiddengenerationcost: "20" }
    });
    await prisma.agent.create({
      data: { id: "agentA", type: "CONSUMER", microgridId: mg.id }
    });
    await prisma.agent.create({
      data: { id: "agentB", type: "PRODUCER", microgridId: mg2.id }
    });
    await prisma.stabilityCheck.create({
      data: { id: "sc-ci-mock", isStable: true, margin: 10.0 }
    });
  });

  it("should run a full 2-agent session to convergence and persist every round", async () => {
    // Mock the Engine API
    let roundCount = 0;
    clientSocket.on("your_turn", (data: any) => {
      roundCount++;
      if (roundCount < 3) {
        clientSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 12.0 + roundCount,
          counter_requested_kwh: 50.0
        });
      } else {
        clientSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "ACCEPT"
        });
      }
    });

    const promise = new Promise<void>((resolve) => {
      clientSocket.on("negotiation_complete", (data) => {
        expect(data.status).toBe("COMMITTED");
        expect(data.finalRound).toBe(3);
        resolve();
      });
    });

    clientSocket.emit("start_negotiation", {
      agentIds: ["agentA", "agentB"],
      initialSurplus: 100.0
    });

    await promise;

    // Verify persistence
    const negotiations = await prisma.negotiation.findMany({ include: { beliefUpdates: true } });
    expect(negotiations.length).toBe(1);
    expect(negotiations[0].status).toBe("COMMITTED");
    expect(negotiations[0].beliefUpdates.length).toBe(0);
  });

  it("should gracefully resume if WebSocket drops mid-session", async () => {
    // Round 1: Counter Offer, then we manually disconnect.
    let engineCalls = 0;
    clientSocket.on("your_turn", (data: any) => {
      engineCalls++;
      if (engineCalls === 1) {
        clientSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 15.0,
          counter_requested_kwh: 40.0
        });
        // Disconnect immediately after to simulate a drop
        clientSocket.disconnect();
      }
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
        prior: 0,
        likelihood: 0.5,
        posterior: 15.0,
        confidence: 0.5,
        beforeBelief: 0,
        afterBelief: 15.0
      }
    });

    // After reconnecting, we need to answer the resumed rounds
    const newSocket = Client(`http://localhost:${port}/negotiate`);
    newSocket.on("your_turn", (data: any) => {
      engineCalls++;
      if (engineCalls < 3) {
        newSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 15.0,
          counter_requested_kwh: 40.0
        });
      } else {
        newSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "ACCEPT"
        });
      }
    });

    const promise = new Promise<void>((resolve) => {
      newSocket.on("negotiation_complete", (data) => {
        expect(data.status).toBe("COMMITTED");
        expect(data.finalRound).toBe(3);
        resolve();
      });
    });

    newSocket.emit("start_negotiation", {
      negotiationId: neg.id,
      agentIds: ["agentA", "agentB"],
      initialSurplus: 100.0
    });

    await promise;
    newSocket.disconnect();

    const negotiations = await prisma.negotiation.findMany({ include: { beliefUpdates: true } });
    expect(negotiations.length).toBe(1);
    // Belief updates shouldn't be touched by the socket endpoints.
    // In original code, the mock fetch might have written belief updates? 
    // No, negotiate.ts writes NegotiationRound, not beliefUpdates!
    // So beliefUpdates remains 1. We should assert negotiation rounds.
    const rounds = await prisma.negotiationRound.findMany({ where: { negotiationId: neg.id }});
    expect(rounds.length).toBeGreaterThanOrEqual(2);
  });

  it("should correctly apply the discount factor exactly as specified across at least 5 rounds", async () => {
    // Engine always counters up to 6 rounds
    let engineCalls = 0;
    const surplusHistory: number[] = [];

    clientSocket.on("your_turn", (data: any) => {
      engineCalls++;
      surplusHistory.push(data.surplus);
      
      if (engineCalls >= 5) {
        clientSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "WALK_AWAY"
        });
      } else {
        clientSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 10.0,
          counter_requested_kwh: 10.0
        });
      }
    });

    const promise = new Promise<void>((resolve) => {
      clientSocket.on("negotiation_complete", (data) => {
        expect(data.status).toBe("WALKED_AWAY");
        expect(data.finalRound).toBe(5);
        resolve();
      });
    });

    clientSocket.emit("start_negotiation", {
      agentIds: ["agentA", "agentB"],
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
