import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// -- MOCKS for Offline Testability  --
// The environment lacks live Redis and PostgreSQL due to Docker unavailability.
// We mock BullMQ and Prisma so the test suite can run fully offline.

vi.mock("@prisma/client", () => {
  let db: any = { negotiations: [], transfers: [], checks: [] };

  // Expose db for reuse in the mock queue factory below
  (globalThis as any).__mockDb = db;

  const PrismaClient = vi.fn(function (this: any) {
    this.agent = {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([
        { id: "agentA", microgridId: "mg-a", type: "SELLER" },
        { id: "agentB", microgridId: "mg-b", type: "BUYER" }
      ]),
    };
    this.gridNode = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    this.negotiation = {
      findMany: vi.fn().mockImplementation(async () => db.negotiations),
      findUnique: vi.fn().mockImplementation(async (args: any) => db.negotiations.find((n: any) => n.id === args.where.id)),
      create: vi.fn().mockImplementation(async (args: any) => {
        const neg = { id: "neg-mock-" + Date.now(), status: "PENDING", beliefUpdates: [], ...args.data };
        db.negotiations.push(neg);
        return neg;
      }),
      update: vi.fn().mockImplementation(async (args: any) => {
        const neg = db.negotiations.find((n: any) => n.id === args.where.id);
        if (neg && args.data.status) neg.status = args.data.status;
        return neg;
      }),
      deleteMany: vi.fn().mockImplementation(async () => { db.negotiations = []; })
    };
    this.beliefUpdate = { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) };
    this.oracleSignal = {
      findFirst: vi.fn().mockResolvedValue({ id: "sig-mock", signalData: "System Default" }),
      create: vi.fn().mockResolvedValue({ id: "sig-mock", signalData: "System Default" })
    };
    this.stabilityCheck = {
      findMany: vi.fn().mockImplementation(async () => db.checks),
      create: vi.fn().mockImplementation(async (args: any) => {
        const check = { id: "sc-mock-" + Date.now(), ...args.data };
        db.checks.push(check);
        return check;
      }),
      deleteMany: vi.fn().mockImplementation(async () => { db.checks = []; })
    };
    this.rlReward = { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) };
    this.energyTransfer = {
      findMany: vi.fn().mockImplementation(async () => db.transfers),
      create: vi.fn().mockImplementation(async (args: any) => {
        const transfer = { id: "et-mock-" + Date.now(), ...args.data };
        db.transfers.push(transfer);
        return transfer;
      }),
      deleteMany: vi.fn().mockImplementation(async () => { db.transfers = []; })
    };
    this.settlement = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "settle-mock", status: "COMMITTED" }),
      update: vi.fn().mockResolvedValue({ id: "settle-mock", status: "COMMITTED" }),
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

vi.mock("bullmq", () => ({
  Queue: vi.fn(function (this: any) {
    this.add = vi.fn().mockResolvedValue({
      waitUntilFinished: vi.fn().mockImplementation(async () => {
        try {
          const res = await fetch("http://localhost:8000/stability/verify");
          const data = await res.json();
          return { checkId: "sc-mock", isStable: data.isStable, margin: data.margin, violatingDeviation: data.isStable ? undefined : '["agentA","agentB"]' };
        } catch {
          return { checkId: "sc-mock", isStable: true, margin: 10.0 };
        }
      })
    });
    this.drain = vi.fn().mockResolvedValue(undefined);
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

vi.mock("../../src/services/gridGate.js", () => ({
  GridGate: {
    check: vi.fn().mockResolvedValue({
      passed: true,
      certId: "gc-gate",
      feasible: true,
      losses: 0.1,
    }),
  },
}));


vi.mock("../../src/queues/index", () => ({
  qPrefix: "test-prefix-",
  stabilityQueue: {
    add: vi.fn().mockResolvedValue({
      waitUntilFinished: vi.fn().mockImplementation(async () => {
        const { PrismaClient } = await import("@prisma/client");
        const prisma = new PrismaClient();
        let isStable = true;
        let margin = 10.0;
        let violatingDeviation: string | undefined = undefined;
        try {
          await new Promise(r => setTimeout(r, 100)); // Delay to let client2 join the room
          const res = await fetch("http://localhost:8000/stability/verify");
          const data = await res.json();
          isStable = data.isStable;
          margin = data.margin;
          if (!isStable) violatingDeviation = '["agentA","agentB"]';
        } catch {}

        const check = await prisma.stabilityCheck.create({ data: { isStable, margin, violatingDeviation } });
        return { checkId: check.id, isStable, margin, violatingDeviation };
      })
    })
  }
}));
// -----------------------------------------------

import { PrismaClient } from "@prisma/client";
import { stabilityQueue } from "../../src/queues/index";

const prisma = new PrismaClient();

import { createServer } from "http";
import { Server } from "socket.io";
import { setupNegotiationNamespace } from "../../src/ws/negotiate";
import { io as Client, Socket } from "socket.io-client";

describe("StabilityGate Integration ", () => {
  let io: Server;
  let serverSocket: any;
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
        
        clientSocket1 = Client(`http://localhost:${port}/negotiate`, { query: { agentId: "agentA" }});
        clientSocket2 = Client(`http://localhost:${port}/negotiate`, { query: { agentId: "agentB" }});
        
        let connected = 0;
        const check = () => { if (++connected === 2) resolve(); };
        clientSocket1.on("connect", check);
        clientSocket2.on("connect", check);
      });
    });
  });

  afterAll(async () => {
    if (io) io.close();
    if (clientSocket1) clientSocket1.disconnect();
    if (clientSocket2) clientSocket2.disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks(); // use clearAllMocks instead of restoreAllMocks so we don't destroy vi.fn() implementations
    clientSocket1.removeAllListeners();
    clientSocket2.removeAllListeners();
    // Clean DB
    await prisma.energyTransfer.deleteMany({});
    await prisma.rlReward.deleteMany({});
    await prisma.beliefUpdate.deleteMany({});
    await prisma.negotiation.deleteMany({});
    await prisma.stabilityCheck.deleteMany({});
  });

  it("T1/T3: Unstable coalition blocks commit, updates status to STABILITY_FAILED, and notifies agents", async () => {
    // Mock fetch for both endpoints
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.includes("/negotiate")) {
        return {
          ok: true,
          json: async () => ({ action: "ACCEPT" })
        };
      }
      if (url.includes("/stability/verify")) {
        return {
          ok: true,
          json: async () => ({ isStable: false, margin: -2.5 })
        };
      }
      return { ok: false };
    });

    let rejectionPayload1: any;
    let rejectionPayload2: any;
    
    const promise1 = new Promise<void>((res) => {
      clientSocket1.on("stability_rejected", (data) => {
        rejectionPayload1 = data;
        res();
      });
    });

    clientSocket1.on("your_turn", (data: any) => {
      clientSocket1.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: "ACCEPT",
        decision_source: "LLM",
        counter_offer_price: 10,
        counter_requested_kwh: 50
      });
    });
    clientSocket2.on("your_turn", (data: any) => {
      clientSocket2.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: "ACCEPT",
        decision_source: "LLM",
        counter_offer_price: 10,
        counter_requested_kwh: 50
      });
    });

    clientSocket1.emit("start_negotiation", {
      agentIds: ["agentA", "agentB"],
      initialSurplus: 100.0
    });

    await promise1;

    // DB assertions
    const negotiations = await prisma.negotiation.findMany();
    expect(negotiations.length).toBe(1);
    expect(negotiations[0].status).toBe("STABILITY_FAILED");

    const transfers = await prisma.energyTransfer.findMany();
    expect(transfers.length).toBe(0);

    const checks = await prisma.stabilityCheck.findMany();
    expect(checks.length).toBeGreaterThan(0);
    expect(checks[checks.length - 1].isStable).toBe(false);

    // Payload assertions
    expect(rejectionPayload1.isStable).toBe(false);
    expect(rejectionPayload1.margin).toBe(-2.5);
    expect(rejectionPayload1.violatingDeviation).toBeDefined();
  });

  it("T2: Stable coalition successfully commits to energyTransfers", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.includes("/negotiate")) {
        return {
          ok: true,
          json: async () => ({ action: "ACCEPT" })
        };
      }
      if (url.includes("/stability/verify")) {
        return {
          ok: true,
          json: async () => ({ isStable: true, margin: 5.0 })
        };
      }
      return { ok: false };
    });

    const promise = new Promise<void>((res) => {
      clientSocket1.on("negotiation_complete", (data) => {
        expect(data.status).toBe("COMMITTED");
        res();
      });
    });

    clientSocket1.on("your_turn", (data: any) => {
      clientSocket1.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: "ACCEPT",
        decision_source: "LLM",
        counter_offer_price: 10,
        counter_requested_kwh: 50
      });
    });
    clientSocket2.on("your_turn", (data: any) => {
      clientSocket2.emit("agent_action", {
        negotiationId: data.negotiationId,
        action: "ACCEPT",
        decision_source: "LLM",
        counter_offer_price: 10,
        counter_requested_kwh: 50
      });
    });

    clientSocket2.emit("start_negotiation", {
      agentIds: ["agentA", "agentB"],
      initialSurplus: 100.0
    });

    await promise;

    // Verify DB
    const negotiations = await prisma.negotiation.findMany();
    expect(negotiations.length).toBe(1);
    expect(["COMMITTED", "SAFETY_VERIFIED"]).toContain(negotiations[0].status);

    const checks = await prisma.stabilityCheck.findMany();
    expect(checks.length).toBe(1);
    expect(checks[0].isStable).toBe(true);

    const transfers = await prisma.energyTransfer.findMany();
    expect(transfers.length).toBe(1);
    expect(transfers[0].stabilitycheckid).toBe(checks[0].id);

  });
});
