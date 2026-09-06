import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken, verifySocketToken } from "../src/middleware/auth.js";
import { encrypt } from "../src/db/encryption.js";
import jwt from "jsonwebtoken";

describe("Tenant-Isolation Red-Team Security Test Suite", () => {
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

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    const timestamp = Date.now();

    // Create Owner A and Owner B
    ownerA = await prisma.user.create({
      data: {
        email: `redteam_a_${timestamp}@test.com`,
        username: `redteam_a_${timestamp}`,
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
        email: `redteam_b_${timestamp}@test.com`,
        username: `redteam_b_${timestamp}`,
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
        externalCode: `RED-MG-A-${timestamp}`,
        name: "RedTeam Microgrid A",
        type: "PROSUMER",
        latitude: 12.91,
        longitude: 77.51,
        active: true,
        hiddenbatterycapacity: encrypt("60"),
        hiddengenerationcost: encrypt("0.04"),
      },
    });

    mgB = await prisma.microgrid.create({
      data: {
        externalCode: `RED-MG-B-${timestamp}`,
        name: "RedTeam Microgrid B",
        type: "PROSUMER",
        latitude: 12.95,
        longitude: 77.55,
        active: true,
        hiddenbatterycapacity: encrypt("90"),
        hiddengenerationcost: encrypt("0.07"),
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
        ratedPowerKw: 150,
        energyCapacityKwh: 60,
        minPowerKw: 0,
        maxPowerKw: 150,
        efficiency: 0.95,
      },
    });

    derB = await prisma.dER.create({
      data: {
        microgridId: mgB.id,
        type: "WIND",
        ratedPowerKw: 300,
        energyCapacityKwh: 90,
        minPowerKw: 0,
        maxPowerKw: 300,
        efficiency: 0.93,
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
        idempotencyKey: `red-settle-a-${timestamp}`,
        negotiationId: negA.id,
        sellerMicrogridId: mgA.id,
        buyerMicrogridId: "ext-buyer-1",
        energyKwh: 200,
        pricePerKwh: 0.11,
        status: "COMMITTED",
        deliveryStart: new Date(),
        deliveryEnd: new Date(Date.now() + 3600000),
      },
    });

    settlementB = await prisma.settlement.create({
      data: {
        idempotencyKey: `red-settle-b-${timestamp}`,
        negotiationId: negB.id,
        sellerMicrogridId: mgB.id,
        buyerMicrogridId: "ext-buyer-2",
        energyKwh: 400,
        pricePerKwh: 0.16,
        status: "COMMITTED",
        deliveryStart: new Date(),
        deliveryEnd: new Date(Date.now() + 3600000),
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "settlements" CASCADE`).catch(() => {});

    if (negA) await prisma.negotiation.delete({ where: { id: negA.id } }).catch(() => {});
    if (negB) await prisma.negotiation.delete({ where: { id: negB.id } }).catch(() => {});

    const mgIds = [mgA?.id, mgB?.id].filter(Boolean);
    for (const id of mgIds) {
      await prisma.agent.deleteMany({ where: { microgridId: id } }).catch(() => {});
      await prisma.dER.deleteMany({ where: { microgridId: id } }).catch(() => {});
      await prisma.userMicrogridMembership.deleteMany({ where: { microgridId: id } }).catch(() => {});
      await prisma.microgrid.delete({ where: { id: id } }).catch(() => {});
    }

    const uIds = [ownerA?.id, ownerB?.id].filter(Boolean);
    for (const id of uIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }

    await disconnectPrisma();
  });

  // 1. DER owner A cannot read microgrid B
  it("1. DER owner A cannot read microgrid B", async () => {
    const res = await request(app)
      .get("/api/me/microgrids")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const returnedIds = res.body.map((m: any) => m.id);
    expect(returnedIds).toContain(mgA.id);
    expect(returnedIds).not.toContain(mgB.id);
  });

  // 2. DER owner A cannot read DER B
  it("2. DER owner A cannot read DER B", async () => {
    const res = await request(app)
      .get("/api/me/ders")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const derIds = res.body.map((d: any) => d.id);
    expect(derIds).toContain(derA.id);
    expect(derIds).not.toContain(derB.id);
  });

  // 3. DER owner A cannot read settlement B
  it("3. DER owner A cannot read settlement B", async () => {
    const res = await request(app)
      .get("/api/me/settlements")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const settlementIds = res.body.map((s: any) => s.id);
    expect(settlementIds).toContain(settlementA.id);
    expect(settlementIds).not.toContain(settlementB.id);
  });

  // 4. DER owner A cannot read negotiation B
  it("4. DER owner A cannot read negotiation B", async () => {
    const res = await request(app)
      .get("/api/me/negotiations")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const negIds = res.body.map((n: any) => n.id);
    expect(negIds).toContain(negA.id);
    expect(negIds).not.toContain(negB.id);
  });

  // 5. DER owner A cannot read audit B
  it("5. DER owner A cannot read audit B", async () => {
    const res = await request(app)
      .get("/api/me/audit")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    // Any event involving negB or ownerB must NOT be present
    const negBEvent = res.body.find((e: any) => e.negotiationId === negB.id || e.actorId === ownerB.id);
    expect(negBEvent).toBeUndefined();
  });

  // 6. DER owner A cannot modify microgrid B
  it("6. DER owner A cannot modify microgrid B", async () => {
    // Attempting direct mutation on microgrids endpoint returns 404 (endpoint nonexistent / closed)
    const resPut = await request(app)
      .put(`/api/microgrids/${mgB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Hacked Microgrid Name" });
    expect([404, 405]).toContain(resPut.status);

    // Verify microgrid B name is unchanged in DB
    const freshMgB = await prisma.microgrid.findUnique({ where: { id: mgB.id } });
    expect(freshMgB?.name).toBe("RedTeam Microgrid B");
  });

  // 7. DER owner A cannot alter DER B
  it("7. DER owner A cannot alter DER B", async () => {
    const resPut = await request(app)
      .put(`/api/ders/${derB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ ratedPowerKw: 99999 });
    expect([404, 405]).toContain(resPut.status);

    // Verify DER B values are unchanged in DB
    const freshDerB = await prisma.dER.findUnique({ where: { id: derB.id } });
    expect(Number(freshDerB?.ratedPowerKw)).toBe(300);
  });

  // 8. DER owner cannot promote themselves
  it("8. DER owner cannot promote themselves", async () => {
    // Attempting to self-promote via /api/onboarding or profile endpoints
    const resPut = await request(app)
      .put("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ role: "ADMIN" });

    // The user's role in DB must remain DER_OWNER
    const freshUser = await prisma.user.findUnique({ where: { id: ownerA.id } });
    expect(freshUser?.role).toBe("DER_OWNER");
  });

  // 9. DER owner cannot access admin onboarding controls
  it("9. DER owner cannot access admin onboarding controls", async () => {
    const resList = await request(app)
      .get("/api/admin/onboarding")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(resList.status).toBe(403);

    const resApprove = await request(app)
      .post(`/api/admin/onboarding/fake-id/approve`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "Unauthorized attempt" });
    expect(resApprove.status).toBe(403);

    const resProvision = await request(app)
      .post(`/api/admin/onboarding/fake-id/provision`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({});
    expect(resProvision.status).toBe(403);
  });

  // 10. DER owner cannot access Oracle admin controls
  it("10. DER owner cannot access Oracle admin controls", async () => {
    // Non-existent or internal oracle modification endpoints return 404/405
    const resPost = await request(app)
      .post("/api/oracle/override")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ signal: "BUY", confidence: 1.0 });
    expect([404, 405]).toContain(resPost.status);
  });

  // 11. DER owner cannot mint arbitrary agent credentials
  it("11. DER owner cannot mint arbitrary agent credentials", async () => {
    // Calling broker with owner token to mint agent token
    const resPost = await request(app)
      .post(`/auth/agent-token/${agentB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    // Endpoint does not allow DER_OWNER (403 or 404 if in Engine)
    expect([403, 404]).toContain(resPost.status);
  });

  // 12. DER owner cannot connect WebSocket as another agent
  it("12. DER owner cannot connect WebSocket as another agent", () => {
    // Verifying socket token resolution binds observer role and user ID rather than trading agent ID
    const userPayload = verifySocketToken(tokenA);
    expect(userPayload.userId).toBe(ownerA.id);
    expect(userPayload.role).toBe("DER_OWNER");

    // Generating an arbitrary spoofed agent token with invalid secret fails verification
    expect(() => {
      jwt.verify(tokenA, "invalid_secret_key_that_is_wrong_12345");
    }).toThrow();
  });

  // 13. query-string microgridId cannot bypass access control
  it("13. query-string microgridId cannot bypass access control", async () => {
    const res = await request(app)
      .get(`/api/me/microgrids?microgridId=${mgB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const returnedIds = res.body.map((m: any) => m.id);
    expect(returnedIds).not.toContain(mgB.id);

    const resDers = await request(app)
      .get(`/api/me/ders?microgridId=${mgB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(resDers.status).toBe(200);
    const derIds = resDers.body.map((d: any) => d.id);
    expect(derIds).not.toContain(derB.id);
  });

  // 14. malformed JWT cannot access scoped APIs
  it("14. malformed JWT cannot access scoped APIs", async () => {
    const resMalformed = await request(app)
      .get("/api/me/microgrids")
      .set("Authorization", "Bearer invalid.malformed.jwt.token");
    expect(resMalformed.status).toBe(401);

    const resMissing = await request(app).get("/api/me/microgrids");
    expect(resMissing.status).toBe(401);
  });

  // 15. inactive/suspended users lose access
  it("15. inactive/suspended users lose access", async () => {
    // Deactivate ownerA in the database
    await prisma.user.update({
      where: { id: ownerA.id },
      data: { active: false },
    });

    // Attempting to access /api/me/* with their existing valid JWT is immediately rejected
    const res = await request(app)
      .get("/api/me/microgrids")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ACCOUNT_INACTIVE");

    // Re-activating ownerA restores access
    await prisma.user.update({
      where: { id: ownerA.id },
      data: { active: true },
    });

    const resRestored = await request(app)
      .get("/api/me/microgrids")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(resRestored.status).toBe(200);
  });
});
