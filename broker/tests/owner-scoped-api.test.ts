import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";
import { encrypt } from "../src/db/encryption.js";

describe("Tenant Data Isolation: Scoped Owner APIs (/api/me/*)", () => {
  let ownerA: any;
  let ownerB: any;
  let tokenA: string;
  let tokenB: string;

  let mgA: any;
  let mgB: any;

  let derA: any;
  let derB: any;

  let agentA: any;
  let agentB: any;

  let negA: any;
  let negB: any;

  let settlementA: any;
  let settlementB: any;

  let tradeA: any;
  let tradeB: any;

  let stabCheck: any;
  let gridCert: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    const timestamp = Date.now();

    // Create Owner A and Owner B
    ownerA = await prisma.user.create({
      data: {
        email: `owner_a_${timestamp}@test.com`,
        username: `owner_a_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    tokenA = signToken({
      userId: ownerA.id,
      email: ownerA.email,
      role: ownerA.role,
      microgridIds: [],
    });

    ownerB = await prisma.user.create({
      data: {
        email: `owner_b_${timestamp}@test.com`,
        username: `owner_b_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    tokenB = signToken({
      userId: ownerB.id,
      email: ownerB.email,
      role: ownerB.role,
      microgridIds: [],
    });

    // Create Microgrid A and Microgrid B
    mgA = await prisma.microgrid.create({
      data: {
        externalCode: `MG-A-${timestamp}`,
        name: "Microgrid Alpha",
        type: "PROSUMER",
        latitude: 12.91,
        longitude: 77.51,
        active: true,
        hiddenbatterycapacity: encrypt("50"),
        hiddengenerationcost: encrypt("0.04"),
      },
    });

    mgB = await prisma.microgrid.create({
      data: {
        externalCode: `MG-B-${timestamp}`,
        name: "Microgrid Beta",
        type: "PROSUMER",
        latitude: 12.95,
        longitude: 77.55,
        active: true,
        hiddenbatterycapacity: encrypt("80"),
        hiddengenerationcost: encrypt("0.06"),
      },
    });

    // Assign memberships
    await prisma.userMicrogridMembership.create({
      data: {
        userId: ownerA.id,
        microgridId: mgA.id,
        role: "OWNER",
      },
    });

    await prisma.userMicrogridMembership.create({
      data: {
        userId: ownerB.id,
        microgridId: mgB.id,
        role: "OWNER",
      },
    });

    // Create DERs
    derA = await prisma.dER.create({
      data: {
        microgridId: mgA.id,
        type: "SOLAR",
        ratedPowerKw: 100,
        energyCapacityKwh: 50,
        minPowerKw: 0,
        maxPowerKw: 100,
        efficiency: 0.95,
      },
    });

    derB = await prisma.dER.create({
      data: {
        microgridId: mgB.id,
        type: "WIND",
        ratedPowerKw: 200,
        energyCapacityKwh: 80,
        minPowerKw: 0,
        maxPowerKw: 200,
        efficiency: 0.92,
      },
    });

    // Create Agents
    agentA = await prisma.agent.create({
      data: {
        microgridId: mgA.id,
        type: "PROSUMER",
        qre_lambda: 0.6,
      },
    });

    agentB = await prisma.agent.create({
      data: {
        microgridId: mgB.id,
        type: "PROSUMER",
        qre_lambda: 0.7,
      },
    });

    // Create Negotiations
    negA = await prisma.negotiation.create({
      data: {
        status: "COMMITTED",
        sellerMicrogridId: mgA.id,
        buyerMicrogridId: "ext-buyer-1",
      },
    });

    negB = await prisma.negotiation.create({
      data: {
        status: "COMMITTED",
        sellerMicrogridId: mgB.id,
        buyerMicrogridId: "ext-buyer-2",
      },
    });

    // Create Settlements
    settlementA = await prisma.settlement.create({
      data: {
        idempotencyKey: `settle-a-${timestamp}`,
        negotiationId: negA.id,
        sellerMicrogridId: mgA.id,
        buyerMicrogridId: "ext-buyer-1",
        energyKwh: 150,
        pricePerKwh: 0.12,
        status: "COMMITTED",
        deliveryStart: new Date(),
        deliveryEnd: new Date(Date.now() + 3600000),
      },
    });

    settlementB = await prisma.settlement.create({
      data: {
        idempotencyKey: `settle-b-${timestamp}`,
        negotiationId: negB.id,
        sellerMicrogridId: mgB.id,
        buyerMicrogridId: "ext-buyer-2",
        energyKwh: 300,
        pricePerKwh: 0.15,
        status: "COMMITTED",
        deliveryStart: new Date(),
        deliveryEnd: new Date(Date.now() + 3600000),
      },
    });

    // Prerequisites for EnergyTransfer
    stabCheck = await prisma.stabilityCheck.create({
      data: {
        isStable: true,
        margin: 10,
      },
    });

    gridCert = await prisma.gridFeasibilityCertificate.create({
      data: {
        networkVersion: 1,
        solver: "pandapower",
        solverVersion: "2.14.0",
        feasible: true,
        inputHash: "testhash",
        resultHash: "testhash",
      },
    });

    // Create Energy Transfers (trades)
    tradeA = await prisma.energyTransfer.create({
      data: {
        fromMicrogridId: mgA.id,
        toMicrogridId: mgB.id, // A is seller/transferrer
        amount: 150,
        price: 0.12,
        energyKwh: 150,
        averagePowerKw: 150,
        startTime: new Date(),
        intervalMinutes: 60,
        stabilitycheckid: stabCheck.id,
        gridcertificateid: gridCert.id,
        negotiationId: negA.id,
        settlementId: settlementA.id,
      },
    });

    tradeB = await prisma.energyTransfer.create({
      data: {
        fromMicrogridId: mgB.id,
        toMicrogridId: mgA.id, // B is seller
        amount: 250,
        price: 0.14,
        energyKwh: 250,
        averagePowerKw: 250,
        startTime: new Date(),
        intervalMinutes: 60,
        stabilitycheckid: stabCheck.id,
        gridcertificateid: gridCert.id,
        negotiationId: negB.id,
        settlementId: settlementB.id,
      },
    });
  });

  afterAll(async () => {
    // Teardown
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "energytransfers" CASCADE`).catch(() => {});
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "settlements" CASCADE`).catch(() => {});

    if (negA) await prisma.negotiation.delete({ where: { id: negA.id } }).catch(() => {});
    if (negB) await prisma.negotiation.delete({ where: { id: negB.id } }).catch(() => {});

    if (stabCheck) await prisma.stabilityCheck.delete({ where: { id: stabCheck.id } }).catch(() => {});
    if (gridCert) await prisma.gridFeasibilityCertificate.delete({ where: { id: gridCert.id } }).catch(() => {});

    const mgIds = [mgA?.id, mgB?.id].filter(Boolean);
    for (const id of mgIds) {
      await prisma.agent.deleteMany({ where: { microgridId: id } }).catch(() => {});
      await prisma.dER.deleteMany({ where: { microgridId: id } }).catch(() => {});
      await prisma.userMicrogridMembership.deleteMany({ where: { microgridId: id } }).catch(() => {});
      await prisma.microgrid.delete({ where: { id } }).catch(() => {});
    }

    const uIds = [ownerA?.id, ownerB?.id].filter(Boolean);
    for (const id of uIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }

    await disconnectPrisma();
  });

  describe("Microgrid Scoping & Privacy", () => {
    it("Owner A receives only Microgrid A, and private secrets are excluded", async () => {
      const res = await request(app)
        .get("/api/me/microgrids")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(mgA.id);
      expect(res.body[0].name).toBe("Microgrid Alpha");

      // Verify secrets are NOT exposed
      expect(res.body[0].hiddengenerationcost).toBeUndefined();
      expect(res.body[0].hiddenbatterycapacity).toBeUndefined();
    });

    it("Owner B receives only Microgrid B", async () => {
      const res = await request(app)
        .get("/api/me/microgrids")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(mgB.id);
      expect(res.body[0].name).toBe("Microgrid Beta");
    });
  });

  describe("DER Asset Scoping", () => {
    it("Owner A receives only DER A", async () => {
      const res = await request(app)
        .get("/api/me/ders")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(derA.id);
      expect(res.body[0].microgridId).toBe(mgA.id);
      expect(res.body[0].type).toBe("SOLAR");
      expect(res.body[0].ratedPowerKw).toBe(100);
    });

    it("Owner B receives only DER B", async () => {
      const res = await request(app)
        .get("/api/me/ders")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(derB.id);
      expect(res.body[0].microgridId).toBe(mgB.id);
      expect(res.body[0].type).toBe("WIND");
      expect(res.body[0].ratedPowerKw).toBe(200);
    });
  });

  describe("Agent Scoping", () => {
    it("Owner A receives only Agent A", async () => {
      const res = await request(app)
        .get("/api/me/agent")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(agentA.id);
      expect(res.body[0].microgridId).toBe(mgA.id);
    });

    it("Owner B receives only Agent B", async () => {
      const res = await request(app)
        .get("/api/me/agent")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(agentB.id);
      expect(res.body[0].microgridId).toBe(mgB.id);
    });
  });

  describe("Negotiations Scoping", () => {
    it("Owner A receives only negotiations involving Microgrid A", async () => {
      const res = await request(app)
        .get("/api/me/negotiations")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(negA.id);
      expect(res.body[0].sellerMicrogridId).toBe(mgA.id);
    });

    it("Owner B receives only negotiations involving Microgrid B", async () => {
      const res = await request(app)
        .get("/api/me/negotiations")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(negB.id);
      expect(res.body[0].sellerMicrogridId).toBe(mgB.id);
    });
  });

  describe("Settlements Scoping", () => {
    it("Owner A receives only settlements involving Microgrid A", async () => {
      const res = await request(app)
        .get("/api/me/settlements")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(settlementA.id);
      expect(res.body[0].sellerMicrogridId).toBe(mgA.id);
      expect(res.body[0].energyKwh).toBe(150);
    });

    it("Owner B receives only settlements involving Microgrid B", async () => {
      const res = await request(app)
        .get("/api/me/settlements")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(settlementB.id);
      expect(res.body[0].sellerMicrogridId).toBe(mgB.id);
      expect(res.body[0].energyKwh).toBe(300);
    });
  });

  describe("Analytics Scoping", () => {
    it("Owner A receives analytics calculated strictly from Microgrid A", async () => {
      const res = await request(app)
        .get("/api/me/analytics")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.totalSoldKwh).toBe(150);
      expect(res.body.totalCapacityKw).toBe(100);
      expect(res.body.committedSettlements).toBe(1);
    });

    it("Owner B receives analytics calculated strictly from Microgrid B", async () => {
      const res = await request(app)
        .get("/api/me/analytics")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.totalSoldKwh).toBe(300);
      expect(res.body.totalCapacityKw).toBe(200);
      expect(res.body.committedSettlements).toBe(1);
    });
  });

  describe("Client-Supplied Parameter Tampering & Unauthorized Access", () => {
    it("Owner A cannot access Microgrid B by passing ?microgridId=B", async () => {
      const res = await request(app)
        .get(`/api/me/microgrids?microgridId=${mgB.id}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(mgA.id);
      // Ensure mgB was not returned
      expect(res.body.some((m: any) => m.id === mgB.id)).toBe(false);
    });

    it("Unauthenticated request is denied with 401", async () => {
      const res = await request(app).get("/api/me/microgrids");
      expect(res.status).toBe(401);
    });
  });
});
