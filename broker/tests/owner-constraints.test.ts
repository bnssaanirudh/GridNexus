import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Mock StabilityGate & GridGate
const { mockStabilityGateCheck, mockGridGateCheck } = vi.hoisted(() => {
  const mockStabilityGateCheck = vi.fn().mockResolvedValue({
    passed: true,
    checkId: "sc-mock-pref",
    isStable: true,
    margin: 10.0,
  });
  const mockGridGateCheck = vi.fn();
  return { mockStabilityGateCheck, mockGridGateCheck };
});

vi.mock("../src/services/stabilityGate.js", () => ({
  StabilityGate: { check: mockStabilityGateCheck },
}));

vi.mock("../src/services/gridGate.js", () => ({
  GridGate: { check: mockGridGateCheck },
}));

import { createServer } from "http";
import { Server } from "socket.io";
import { io as Client, Socket } from "socket.io-client";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import { setupNegotiationNamespace } from "../src/ws/negotiate.js";
import { signToken } from "../src/middleware/auth.js";

describe("Phase 7 — Owner Preferences and Constraint Enforcement", () => {
  let ioServer: Server;
  let port: number;
  let clientSocket: Socket;

  let ownerA: any;
  let ownerB: any;
  let inactiveOwner: any;
  let tokenA: string;
  let tokenB: string;
  let tokenInactive: string;

  let mgA: any;
  let mgB: any;
  let agentSeller: any;
  let agentBuyer: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    const httpServer = createServer();
    ioServer = new Server(httpServer);
    setupNegotiationNamespace(ioServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    });

    const ts = Date.now();
    ownerA = await prisma.user.create({
      data: {
        email: `pref_owner_a_${ts}@test.com`,
        username: `pref_owner_a_${ts}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });

    ownerB = await prisma.user.create({
      data: {
        email: `pref_owner_b_${ts}@test.com`,
        username: `pref_owner_b_${ts}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });

    inactiveOwner = await prisma.user.create({
      data: {
        email: `pref_owner_inact_${ts}@test.com`,
        username: `pref_owner_inact_${ts}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: false,
      },
    });

    mgA = await prisma.microgrid.create({
      data: {
        name: `Microgrid-Seller-${ts}`,
        type: "SOLAR_BATTERY",
        hiddenbatterycapacity: "100",
        hiddengenerationcost: "10",
      },
    });

    mgB = await prisma.microgrid.create({
      data: {
        name: `Microgrid-Buyer-${ts}`,
        type: "CONSUMER_SITE",
        hiddenbatterycapacity: "0",
        hiddengenerationcost: "0",
      },
    });

    await prisma.userMicrogridMembership.create({
      data: { userId: ownerA.id, microgridId: mgA.id, role: "OWNER" },
    });

    await prisma.userMicrogridMembership.create({
      data: { userId: ownerB.id, microgridId: mgB.id, role: "OWNER" },
    });

    tokenA = signToken({
      userId: ownerA.id,
      email: ownerA.email,
      role: ownerA.role,
      microgridIds: [mgA.id],
    });

    tokenB = signToken({
      userId: ownerB.id,
      email: ownerB.email,
      role: ownerB.role,
      microgridIds: [mgB.id],
    });

    tokenInactive = signToken({
      userId: inactiveOwner.id,
      email: inactiveOwner.email,
      role: inactiveOwner.role,
      microgridIds: [mgA.id],
    });

    agentSeller = await prisma.agent.create({
      data: {
        id: `agent-seller-${ts}`,
        microgridId: mgA.id,
        type: "SELLER",
      },
    });

    agentBuyer = await prisma.agent.create({
      data: {
        id: `agent-buyer-${ts}`,
        microgridId: mgB.id,
        type: "BUYER",
      },
    });

    await prisma.stabilityCheck.upsert({
      where: { id: "sc-mock-pref" },
      update: {},
      create: { id: "sc-mock-pref", isStable: true, margin: 10.0 },
    });
  });

  afterAll(async () => {
    ioServer.close();
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockStabilityGateCheck.mockResolvedValue({
      passed: true,
      checkId: "sc-mock-pref",
      isStable: true,
      margin: 10.0,
    });
    mockGridGateCheck.mockImplementation(async () => {
      const cert = await prisma.gridFeasibilityCertificate.create({
        data: {
          networkVersion: 1,
          solver: "mock",
          solverVersion: "1",
          feasible: true,
          maxLineLoadingPct: 0,
          minVoltagePu: 1,
          maxVoltagePu: 1,
          powerBalanceError: 0,
          inputHash: "a",
          resultHash: "b",
        },
      });
      return { passed: true, certId: cert.id, isFeasible: true, margin: 15.0 };
    });

    // Reset preferences and DERs for microgrid A & B
    await prisma.tradingPreference.deleteMany({
      where: { microgridId: { in: [mgA.id, mgB.id] } },
    });
    await prisma.dER.deleteMany({
      where: { microgridId: { in: [mgA.id, mgB.id] } },
    });
  });

  describe("Part 1: Scoped Owner Preferences API", () => {
    it("1.1 should return default preferences when none configured", async () => {
      const res = await request(app)
        .get("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.microgridId).toBe(mgA.id);
      expect(res.body.tradingEnabled).toBe(true);
      expect(res.body.minimumBatteryReservePct).toBe(20.0);
      expect(res.body.riskProfile).toBe("BALANCED");
      expect(res.body.maximumDailyExportKwh).toBeNull();
      expect(res.body.minimumPreferredSalePrice).toBeNull();
      expect(res.body.maximumPreferredBuyPrice).toBeNull();
    });

    it("1.2 should allow DER owner to update valid preferences and record audit event", async () => {
      const updates = {
        microgridId: mgA.id,
        tradingEnabled: true,
        minimumBatteryReservePct: 35.0,
        maximumDailyExportKwh: 450.0,
        minimumPreferredSalePrice: 12.5,
        maximumPreferredBuyPrice: 20.0,
        riskProfile: "CONSERVATIVE",
        maxTransactionSizeKwh: 75.0,
      };

      const res = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send(updates);

      expect(res.status).toBe(200);
      expect(res.body.microgridId).toBe(mgA.id);
      expect(res.body.minimumBatteryReservePct).toBe(35.0);
      expect(res.body.maximumDailyExportKwh).toBe(450.0);
      expect(res.body.minimumPreferredSalePrice).toBe(12.5);
      expect(res.body.maximumPreferredBuyPrice).toBe(20.0);
      expect(res.body.riskProfile).toBe("CONSERVATIVE");
      expect(res.body.maxTransactionSizeKwh).toBe(75.0);

      // Verify audit chain record
      const audit = await prisma.auditEvent.findFirst({
        where: {
          actorId: ownerA.id,
          eventType: "PREFERENCES_UPDATED",
        },
        orderBy: { sequence: "desc" },
      });
      expect(audit).not.toBeNull();
      expect((audit!.payload as any).microgridId).toBe(mgA.id);
    });

    it("1.3 should reject negative minimumBatteryReservePct", async () => {
      const res = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgA.id, minimumBatteryReservePct: -5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_PREFERENCE_INPUT");
    });

    it("1.4 should reject minimumBatteryReservePct > 100", async () => {
      const res = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgA.id, minimumBatteryReservePct: 105 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_PREFERENCE_INPUT");
    });

    it("1.5 should reject negative prices and negative export limits", async () => {
      const res1 = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgA.id, minimumPreferredSalePrice: -1 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgA.id, maximumPreferredBuyPrice: -2 });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgA.id, maximumDailyExportKwh: -10 });
      expect(res3.status).toBe(400);
    });

    it("1.6 should reject invalid riskProfile and non-positive maxTransactionSizeKwh", async () => {
      const res1 = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgA.id, riskProfile: "YOLO_EXTREME" });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgA.id, maxTransactionSizeKwh: 0 });
      expect(res2.status).toBe(400);
    });

    it("1.7 tenant isolation: Owner A cannot update Owner B preferences", async () => {
      const res = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ microgridId: mgB.id, tradingEnabled: false });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
    });

    it("1.8 inactive user is forbidden from accessing/modifying preferences", async () => {
      const res1 = await request(app)
        .get("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenInactive}`);
      expect(res1.status).toBe(403);

      const res2 = await request(app)
        .put("/api/me/preferences")
        .set("Authorization", `Bearer ${tokenInactive}`)
        .send({ microgridId: mgA.id, tradingEnabled: true });
      expect(res2.status).toBe(403);
    });
  });

  describe("Part 2: Autonomous Agent Constraint Enforcement in Negotiation", () => {
    async function connectSocket(): Promise<Socket> {
      const s = Client(`http://localhost:${port}/negotiate`, {
        auth: { token: "test-token" },
      });
      await new Promise<void>((resolve) => {
        s.on("connect", () => resolve());
      });
      return s;
    }

    it("2.1 should reject negotiation start when participant tradingEnabled is false", async () => {
      // Disable trading for Microgrid A
      await prisma.tradingPreference.create({
        data: {
          microgridId: mgA.id,
          tradingEnabled: false,
        },
      });

      const socket = await connectSocket();
      const errPromise = new Promise<any>((resolve) => {
        socket.on("protocol_error", (err) => resolve(err));
      });

      socket.emit("start_negotiation", {
        agentIds: [agentSeller.id, agentBuyer.id],
        initialSurplus: 100.0,
      });

      const err = await errPromise;
      expect(err.code).toBe("TRADING_DISABLED");
      expect(err.message).toContain("Trading is disabled by owner preferences");
      socket.disconnect();
    });

    it("2.2 should reject seller counter-offer below owner minimum preferred sale price", async () => {
      // Set minimum sale price to 15.00 for Microgrid A
      await prisma.tradingPreference.create({
        data: {
          microgridId: mgA.id,
          tradingEnabled: true,
          minimumPreferredSalePrice: 15.0,
        },
      });

      const socket = await connectSocket();

      const errPromise = new Promise<any>((resolve) => {
        socket.on("protocol_error", (err) => resolve(err));
      });

      socket.on("your_turn", (data: any) => {
        // Active agent is agentSeller; try to counter-offer with price 10.0 (< 15.0)
        socket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 10.0,
          counter_requested_kwh: 40.0,
        });
      });

      socket.emit("start_negotiation", {
        agentIds: [agentSeller.id, agentBuyer.id],
        initialSurplus: 100.0,
      });

      const err = await errPromise;
      expect(err.code).toBe("CONSTRAINT_VIOLATION");
      expect(err.message).toContain("below owner minimum preferred sale price");

      // Verify audit trail logged VALIDATION_FAILED
      const audit = await prisma.auditEvent.findFirst({
        where: {
          actorId: agentSeller.id,
          eventType: "VALIDATION_FAILED",
        },
        orderBy: { sequence: "desc" },
      });
      expect(audit).not.toBeNull();
      expect((audit!.payload as any).stage).toBe("OWNER_PREFERENCE_CONSTRAINT");
      expect((audit!.payload as any).code).toBe("SALE_PRICE_BELOW_MINIMUM");

      socket.disconnect();
    });

    it("2.3 should reject buyer counter-offer above owner maximum preferred buy price", async () => {
      // Buyer (Microgrid B) allows max buy price $8.00
      await prisma.tradingPreference.create({
        data: {
          microgridId: mgB.id,
          tradingEnabled: true,
          maximumPreferredBuyPrice: 8.0,
        },
      });

      const socket = await connectSocket();

      const errPromise = new Promise<any>((resolve) => {
        socket.on("protocol_error", (err) => resolve(err));
      });

      socket.on("your_turn", (data: any) => {
        // Active agent is buyer; try to counter-offer with $12.0 (> 8.0)
        socket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 12.0,
          counter_requested_kwh: 30.0,
        });
      });

      // Start negotiation with buyer as first active agent
      socket.emit("start_negotiation", {
        agentIds: [agentBuyer.id, agentSeller.id],
        initialSurplus: 100.0,
      });

      const err = await errPromise;
      expect(err.code).toBe("CONSTRAINT_VIOLATION");
      expect(err.message).toContain("above owner maximum preferred buy price");

      socket.disconnect();
    });

    it("2.4 should reject action exceeding maxTransactionSizeKwh", async () => {
      // Set max transaction size 25 kWh on seller microgrid
      await prisma.tradingPreference.create({
        data: {
          microgridId: mgA.id,
          tradingEnabled: true,
          maxTransactionSizeKwh: 25.0,
        },
      });

      const socket = await connectSocket();

      const errPromise = new Promise<any>((resolve) => {
        socket.on("protocol_error", (err) => resolve(err));
      });

      socket.on("your_turn", (data: any) => {
        // Attempt 50 kWh (> 25 kWh)
        socket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 15.0,
          counter_requested_kwh: 50.0,
        });
      });

      socket.emit("start_negotiation", {
        agentIds: [agentSeller.id, agentBuyer.id],
        initialSurplus: 100.0,
      });

      const err = await errPromise;
      expect(err.code).toBe("CONSTRAINT_VIOLATION");
      expect(err.message).toContain("exceeds maximum allowed size");

      socket.disconnect();
    });

    it("2.5 should reject export violating battery reserve percentage", async () => {
      // 100 kWh battery with 30% current SoC (30 kWh stored)
      await prisma.dER.create({
        data: {
          microgridId: mgA.id,
          type: "BATTERY",
          ratedPowerKw: 50.0,
          energyCapacityKwh: 100.0,
          minPowerKw: 0,
          maxPowerKw: 50.0,
          efficiency: 0.95,
          metadata: { currentSoC: 0.30 },
        },
      });

      // Owner requires at least 25% reserve (25 kWh).
      // Discharging 15 kWh leaves 15 kWh (15% < 25%), which must trigger violation.
      await prisma.tradingPreference.create({
        data: {
          microgridId: mgA.id,
          tradingEnabled: true,
          minimumBatteryReservePct: 25.0,
        },
      });

      const socket = await connectSocket();

      const errPromise = new Promise<any>((resolve) => {
        socket.on("protocol_error", (err) => resolve(err));
      });

      socket.on("your_turn", (data: any) => {
        socket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 15.0,
          counter_requested_kwh: 15.0,
        });
      });

      socket.emit("start_negotiation", {
        agentIds: [agentSeller.id, agentBuyer.id],
        initialSurplus: 100.0,
      });

      const err = await errPromise;
      expect(err.code).toBe("CONSTRAINT_VIOLATION");
      expect(err.message).toContain("reduce battery reserve below owner minimum of 25%");

      socket.disconnect();
    });

    it("2.6 should reject export exceeding maximum daily export quota", async () => {
      // Owner sets maximum daily export to 50 kWh
      await prisma.tradingPreference.create({
        data: {
          microgridId: mgA.id,
          tradingEnabled: true,
          maximumDailyExportKwh: 50.0,
        },
      });

      // Create prior committed settlement today of 40 kWh
      const negPrior = await prisma.negotiation.create({
        data: { status: "COMMITTED" },
      });
      await prisma.settlement.create({
        data: {
          idempotencyKey: `prior-settle-${Date.now()}`,
          negotiationId: negPrior.id,
          sellerMicrogridId: mgA.id,
          buyerMicrogridId: mgB.id,
          energyKwh: 40.0,
          pricePerKwh: 15.0,
          deliveryStart: new Date(),
          deliveryEnd: new Date(),
          status: "COMMITTED",
        },
      });

      const socket = await connectSocket();

      const errPromise = new Promise<any>((resolve) => {
        socket.on("protocol_error", (err) => resolve(err));
      });

      socket.on("your_turn", (data: any) => {
        // Attempt to export 20 kWh (40 + 20 = 60 kWh > 50 kWh limit)
        socket.emit("agent_action", {
          negotiationId: data.negotiationId,
          agentId: data.activeAgent,
          action: "COUNTER_OFFER",
          counter_offer_price: 15.0,
          counter_requested_kwh: 20.0,
        });
      });

      socket.emit("start_negotiation", {
        agentIds: [agentSeller.id, agentBuyer.id],
        initialSurplus: 100.0,
      });

      const err = await errPromise;
      expect(err.code).toBe("CONSTRAINT_VIOLATION");
      expect(err.message).toContain("exceed daily export limit of 50");

      socket.disconnect();
    });

    it("2.7 should allow negotiation and commit when all preferences are satisfied", async () => {
      // Configure mutually compatible preferences
      await prisma.tradingPreference.create({
        data: {
          microgridId: mgA.id,
          tradingEnabled: true,
          minimumPreferredSalePrice: 10.0,
          maximumDailyExportKwh: 200.0,
          maxTransactionSizeKwh: 100.0,
        },
      });

      await prisma.tradingPreference.create({
        data: {
          microgridId: mgB.id,
          tradingEnabled: true,
          maximumPreferredBuyPrice: 20.0,
          maxTransactionSizeKwh: 100.0,
        },
      });

      const socket = await connectSocket();
      let round = 0;

      socket.on("your_turn", (data: any) => {
        round++;
        if (round < 2) {
          socket.emit("agent_action", {
            negotiationId: data.negotiationId,
            agentId: data.activeAgent,
            action: "COUNTER_OFFER",
            counter_offer_price: 14.0,
            counter_requested_kwh: 30.0,
          });
        } else {
          socket.emit("agent_action", {
            negotiationId: data.negotiationId,
            agentId: data.activeAgent,
            action: "ACCEPT",
            counter_offer_price: 14.0,
            counter_requested_kwh: 30.0,
          });
        }
      });

      const completePromise = new Promise<any>((resolve) => {
        socket.on("negotiation_complete", (data) => resolve(data));
      });

      socket.emit("start_negotiation", {
        agentIds: [agentSeller.id, agentBuyer.id],
        initialSurplus: 100.0,
      });

      const complete = await completePromise;
      expect(complete.status).toBe("COMMITTED");
      expect(complete.settlementId).toBeDefined();

      // Verify settlement in DB
      const settlement = await prisma.settlement.findUnique({
        where: { id: complete.settlementId },
      });
      expect(settlement).not.toBeNull();
      expect(Number(settlement!.energyKwh)).toBe(30.0);
      expect(Number(settlement!.pricePerKwh)).toBe(14.0);

      socket.disconnect();
    });
  });
});
