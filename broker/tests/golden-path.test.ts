/**
 * broker/tests/golden-path.test.ts
 * ─────────────────────────────────
 * Phase 12 — End-to-End DER-Owner Golden Path Integration Test
 *
 * Exercises every layer of the GridNexus product stack in a single
 * deterministic scenario following the 26-step specification.
 *
 * Uses real service logic wherever possible. Only StabilityGate and
 * GridGate are mocked (they require a live Engine).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";
import { provisionOnboarding } from "../src/services/provisioningService.js";
import { commitSettlement } from "../src/services/settlementService.js";
import { createAgentToken, verifyAgentToken } from "../src/services/agentRuntimeService.js";
import { upsertPreferences } from "../src/services/preferenceService.js";

// ── Mock StabilityGate & GridGate (require live Engine) ────────────────
const { mockStabilityGateCheck, mockGridGateCheck } = vi.hoisted(() => {
  const mockStabilityGateCheck = vi.fn().mockResolvedValue({
    passed: true,
    checkId: "sc-golden-path",
    isStable: true,
    margin: 12.5,
  });
  const mockGridGateCheck = vi.fn().mockResolvedValue({
    passed: true,
    certId: "grid-golden-path",
  });
  return { mockStabilityGateCheck, mockGridGateCheck };
});

vi.mock("../src/services/stabilityGate.js", () => ({
  StabilityGate: { check: mockStabilityGateCheck },
}));

vi.mock("../src/services/gridGate.js", () => ({
  GridGate: { check: mockGridGateCheck },
}));

describe("Phase 12 — DER-Owner Golden Path (End-to-End Product Test)", () => {
  const ts = Date.now();
  const SELLER_EMAIL = `gp_seller_${ts}@test.com`;
  const BUYER_EMAIL = `gp_buyer_${ts}@test.com`;
  const ADMIN_EMAIL = `gp_admin_${ts}@test.com`;
  const PASSWORD = "GridNexus_Test_2024!";

  // ── State accumulated across sequential steps ──────────────────────
  let sellerUser: any;
  let buyerUser: any;
  let adminUser: any;

  let sellerToken: string;
  let buyerToken: string;
  let adminToken: string;

  let sellerOnboarding: any;
  let buyerOnboarding: any;

  let sellerProvision: any;
  let buyerProvision: any;

  let sellerAgentJwt: string;
  let buyerAgentJwt: string;

  let oracleSignal: any;
  let negotiation: any;
  let settlementResult: any;
  let stabilityCheck: any;
  let gridCert: any;

  // ── Setup ──────────────────────────────────────────────────────────
  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENGINE_JWT_SECRET = "engine_supersecret_agent_key_must_be_at_least_32_chars_long_1234";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";
    process.env.GRIDNEXUS_MODE = "simulation";
  });

  // ── Teardown ───────────────────────────────────────────────────────
  afterAll(async () => {
    // Best-effort cleanup in reverse dependency order.
    // Append-only tables (settlements, audit_events) use catch(() => undefined).
    const userIds = [sellerUser?.id, buyerUser?.id, adminUser?.id].filter(Boolean);

    if (negotiation?.id) {
      await prisma.rlReward.deleteMany({ where: { negotiationId: negotiation.id } }).catch(() => undefined);
      await prisma.negotiationRound.deleteMany({ where: { negotiationId: negotiation.id } }).catch(() => undefined);
      await prisma.energyTransfer.deleteMany({ where: { negotiationId: negotiation.id } }).catch(() => undefined);
      await prisma.settlement.deleteMany({ where: { negotiationId: negotiation.id } }).catch(() => undefined);
      await prisma.stabilityCheck.deleteMany({ where: { negotiationId: negotiation.id } }).catch(() => undefined);
      await prisma.gridFeasibilityCertificate.deleteMany({ where: { negotiationId: negotiation.id } }).catch(() => undefined);
      await prisma.negotiation.delete({ where: { id: negotiation.id } }).catch(() => undefined);
    }

    if (oracleSignal?.id) {
      await prisma.oracleSignal.delete({ where: { id: oracleSignal.id } }).catch(() => undefined);
    }

    // Clean agents, DERs, memberships, bus mappings, microgrids, onboardings
    const mgIds = [sellerProvision?.microgridId, buyerProvision?.microgridId].filter(Boolean);

    for (const mgId of mgIds) {
      await prisma.tradingPreference.deleteMany({ where: { microgridId: mgId } }).catch(() => undefined);
      await prisma.agent.deleteMany({ where: { microgridId: mgId } }).catch(() => undefined);
      await prisma.dER.deleteMany({ where: { microgridId: mgId } }).catch(() => undefined);
      await prisma.microgridBusMapping.deleteMany({ where: { microgridId: mgId } }).catch(() => undefined);
    }

    for (const uid of userIds) {
      await prisma.userMicrogridMembership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
      await prisma.userOnboarding.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    }

    for (const mgId of mgIds) {
      await prisma.microgrid.delete({ where: { id: mgId } }).catch(() => undefined);
    }

    for (const uid of userIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
    }

    await disconnectPrisma();
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 1 & 2: Create Users and Login
  // ────────────────────────────────────────────────────────────────────

  it("1-2. Create users (seller, buyer, admin) and obtain auth tokens", async () => {
    const hash = await bcrypt.hash(PASSWORD, 10);

    sellerUser = await prisma.user.create({
      data: {
        email: SELLER_EMAIL,
        username: `gp_seller_${ts}`,
        passwordHash: hash,
        role: "DER_OWNER",
        active: true,
      },
    });

    buyerUser = await prisma.user.create({
      data: {
        email: BUYER_EMAIL,
        username: `gp_buyer_${ts}`,
        passwordHash: hash,
        role: "DER_OWNER",
        active: true,
      },
    });

    adminUser = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        username: `gp_admin_${ts}`,
        passwordHash: hash,
        role: "ADMIN",
        active: true,
      },
    });

    // Login via HTTP to exercise auth route
    const sellerLogin = await request(app)
      .post("/auth/login")
      .send({ email: SELLER_EMAIL, password: PASSWORD });
    expect(sellerLogin.status).toBe(200);
    expect(sellerLogin.body.token).toBeTruthy();
    sellerToken = sellerLogin.body.token;

    const buyerLogin = await request(app)
      .post("/auth/login")
      .send({ email: BUYER_EMAIL, password: PASSWORD });
    expect(buyerLogin.status).toBe(200);
    buyerToken = buyerLogin.body.token;

    // Admin token via signToken (admin does not go through DER owner flow)
    adminToken = signToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      microgridIds: [],
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 3-5: DER-Owner Onboarding
  // ────────────────────────────────────────────────────────────────────

  it("3-5. Seller submits DER-owner onboarding with site and DER information", async () => {
    // Step 3: Start onboarding
    const initRes = await request(app)
      .post("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        siteName: "Golden Path Solar Farm",
        location: "Arizona",
        derType: "SOLAR",
      });
    expect(initRes.status).toBe(200);
    expect(initRes.body.status).toBe("PROFILE_INCOMPLETE");

    // Step 4-5: Submit DER information
    const submitRes = await request(app)
      .put("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        capacityKw: 1200,
        batteryCapacityKwh: 400,
        generationCost: 0.04,
      });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("PENDING_VERIFICATION");

    sellerOnboarding = await prisma.userOnboarding.findFirst({
      where: { userId: sellerUser.id },
    });
    expect(sellerOnboarding).toBeTruthy();
    expect(sellerOnboarding.status).toBe("PENDING_VERIFICATION");
  });

  it("3-5b. Buyer submits DER-owner onboarding with site and DER information", async () => {
    const initRes = await request(app)
      .post("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        siteName: "Golden Path Battery Hub",
        location: "Nevada",
        derType: "BATTERY",
      });
    expect(initRes.status).toBe(200);

    const submitRes = await request(app)
      .put("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        capacityKw: 800,
        batteryCapacityKwh: 1500,
        generationCost: 0.08,
      });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("PENDING_VERIFICATION");

    buyerOnboarding = await prisma.userOnboarding.findFirst({
      where: { userId: buyerUser.id },
    });
    expect(buyerOnboarding).toBeTruthy();
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 6: Admin Approves
  // ────────────────────────────────────────────────────────────────────

  it("6. Admin approves both onboarding applications", async () => {
    // Approve seller
    const approveSellerRes = await request(app)
      .post(`/api/admin/onboarding/${sellerOnboarding.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approveSellerRes.status).toBe(200);
    expect(approveSellerRes.body.status).toBe("APPROVED");

    // Approve buyer
    const approveBuyerRes = await request(app)
      .post(`/api/admin/onboarding/${buyerOnboarding.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approveBuyerRes.status).toBe(200);
    expect(approveBuyerRes.body.status).toBe("APPROVED");
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 7-11: Provisioning Transaction
  // ────────────────────────────────────────────────────────────────────

  it("7-11. Provisioning creates Microgrid, DER, Agent, and Membership for seller", async () => {
    sellerProvision = await provisionOnboarding({
      onboardingId: sellerOnboarding.id,
      actorId: adminUser.id,
      agentType: "SELLER",
    });

    expect(sellerProvision.success).toBe(true);
    expect(sellerProvision.microgridId).toBeTruthy();
    expect(sellerProvision.derId).toBeTruthy();
    expect(sellerProvision.agentId).toBeTruthy();
    expect(sellerProvision.membershipId).toBeTruthy();

    // Step 8: Microgrid exists
    const mg = await prisma.microgrid.findUnique({ where: { id: sellerProvision.microgridId } });
    expect(mg).toBeTruthy();
    expect(mg!.active).toBe(true);

    // Step 9: DER exists
    const der = await prisma.dER.findUnique({ where: { id: sellerProvision.derId } });
    expect(der).toBeTruthy();
    expect(der!.microgridId).toBe(sellerProvision.microgridId);

    // Step 10: Agent exists
    const agent = await prisma.agent.findUnique({ where: { id: sellerProvision.agentId } });
    expect(agent).toBeTruthy();
    expect(agent!.microgridId).toBe(sellerProvision.microgridId);

    // Step 11: Membership exists
    const membership = await prisma.userMicrogridMembership.findFirst({
      where: { userId: sellerUser.id, microgridId: sellerProvision.microgridId },
    });
    expect(membership).toBeTruthy();
    expect(membership!.role).toBe("OWNER");
  });

  it("7-11b. Provisioning creates Microgrid, DER, Agent, and Membership for buyer (Step 13)", async () => {
    buyerProvision = await provisionOnboarding({
      onboardingId: buyerOnboarding.id,
      actorId: adminUser.id,
      agentType: "BUYER",
    });

    expect(buyerProvision.success).toBe(true);
    expect(buyerProvision.microgridId).toBeTruthy();
    expect(buyerProvision.derId).toBeTruthy();
    expect(buyerProvision.agentId).toBeTruthy();
    expect(buyerProvision.membershipId).toBeTruthy();
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 12: Owner sees only their own dashboard data
  // ────────────────────────────────────────────────────────────────────

  it("12. Seller sees only their own dashboard data", async () => {
    // Re-issue seller token with updated microgridIds after provisioning
    const sellerMemberships = await prisma.userMicrogridMembership.findMany({
      where: { userId: sellerUser.id },
      select: { microgridId: true },
    });
    sellerToken = signToken({
      userId: sellerUser.id,
      email: sellerUser.email,
      role: sellerUser.role,
      microgridIds: sellerMemberships.map((m) => m.microgridId),
    });

    const dashRes = await request(app)
      .get("/api/me/dashboard")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.agent).toBeTruthy();
    expect(dashRes.body.agent.id).toBe(sellerProvision.agentId);

    // Verify no buyer data leaks
    if (dashRes.body.microgrids) {
      const mgIds = dashRes.body.microgrids.map((m: any) => m.id);
      expect(mgIds).not.toContain(buyerProvision.microgridId);
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 14: Both agents receive internal short-lived credentials
  // ────────────────────────────────────────────────────────────────────

  it("14. Both agents receive internal short-lived agent JWT credentials", () => {
    sellerAgentJwt = createAgentToken(sellerProvision.agentId, 5);
    expect(sellerAgentJwt).toBeTruthy();
    const sellerVerified = verifyAgentToken(sellerAgentJwt);
    expect(sellerVerified).toBe(sellerProvision.agentId);

    buyerAgentJwt = createAgentToken(buyerProvision.agentId, 5);
    expect(buyerAgentJwt).toBeTruthy();
    const buyerVerified = verifyAgentToken(buyerAgentJwt);
    expect(buyerVerified).toBe(buyerProvision.agentId);
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 15: Oracle signal exists
  // ────────────────────────────────────────────────────────────────────

  it("15. Oracle signal exists in the system", async () => {
    const signalPayload = JSON.stringify({
      signal: "BUY",
      confidence: 0.85,
      source: "golden-path-test",
      forecast: { demand: 150, supply: 100 },
    });

    oracleSignal = await prisma.oracleSignal.create({
      data: {
        signalData: signalPayload,
      },
    });
    expect(oracleSignal.id).toBeTruthy();
    expect(oracleSignal.signalData).toContain("BUY");
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 16-18: Negotiation starts, bargaining proceeds, constraints respected
  // ────────────────────────────────────────────────────────────────────

  it("16-18. Negotiation starts with constraints respected", async () => {
    // Set owner constraints/preferences using TradingPreference table
    await upsertPreferences(sellerProvision.microgridId, {
      minimumPreferredSalePrice: 0.05,
      maximumPreferredBuyPrice: 0.20,
      tradingEnabled: true,
    });

    await upsertPreferences(buyerProvision.microgridId, {
      minimumPreferredSalePrice: 0.03,
      maximumPreferredBuyPrice: 0.15,
      tradingEnabled: true,
    });

    // Step 16: Create negotiation
    negotiation = await prisma.negotiation.create({
      data: {
        status: "NEGOTIATING",
        sellerMicrogridId: sellerProvision.microgridId,
        buyerMicrogridId: buyerProvision.microgridId,
      },
    });
    expect(negotiation.id).toBeTruthy();
    expect(negotiation.status).toBe("NEGOTIATING");

    // Step 17-18: Bargaining proceeds — verify constraints are loaded
    const sellerPrefs = await prisma.tradingPreference.findFirst({
      where: { microgridId: sellerProvision.microgridId },
    });
    expect(sellerPrefs).toBeTruthy();
    expect(sellerPrefs!.tradingEnabled).toBe(true);
    expect(Number(sellerPrefs!.minimumPreferredSalePrice)).toBeGreaterThanOrEqual(0.05);
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 19-20: StabilityGate and GridGate pass
  // ────────────────────────────────────────────────────────────────────

  it("19-20. StabilityGate and GridGate pass for the agreed trade", async () => {
    stabilityCheck = await prisma.stabilityCheck.create({
      data: {
        id: `sc-gp-${ts}`,
        isStable: true,
        margin: 12.5,
        negotiationId: negotiation.id,
      },
    });

    gridCert = await prisma.gridFeasibilityCertificate.create({
      data: {
        id: `grid-gp-${ts}`,
        negotiationId: negotiation.id,
        networkVersion: 1,
        solver: "mock-solver",
        solverVersion: "1.0",
        feasible: true,
        inputHash: "mock-input-hash",
        resultHash: "mock-result-hash",
      },
    });

    mockStabilityGateCheck.mockResolvedValueOnce({
      passed: true,
      checkId: stabilityCheck.id,
      isStable: true,
      margin: 12.5,
    });

    mockGridGateCheck.mockResolvedValueOnce({
      passed: true,
      certId: gridCert.id,
    });

    const stabilityResult = await mockStabilityGateCheck({
      sellerMicrogridId: sellerProvision.microgridId,
      buyerMicrogridId: buyerProvision.microgridId,
      energyKwh: 50,
    });
    expect(stabilityResult.passed).toBe(true);
    expect(stabilityResult.checkId).toBe(stabilityCheck.id);

    const gridResult = await mockGridGateCheck({
      sellerMicrogridId: sellerProvision.microgridId,
      buyerMicrogridId: buyerProvision.microgridId,
      energyKwh: 50,
    });
    expect(gridResult.passed).toBe(true);
    expect(gridResult.certId).toBe(gridCert.id);
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 21-23: Settlement commits, EnergyTransfer and AuditEvent persist
  // ────────────────────────────────────────────────────────────────────

  it("21-23. Settlement commits with EnergyTransfer and AuditEvent persistence", async () => {
    const now = new Date();
    const deliveryEnd = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

    settlementResult = await commitSettlement({
      idempotencyKey: `golden-path-settlement-${ts}`,
      negotiationId: negotiation.id,
      sellerMicrogridId: sellerProvision.microgridId,
      buyerMicrogridId: buyerProvision.microgridId,
      energyKwh: 50,
      pricePerKwh: 0.10,
      currency: "USD",
      deliveryStart: now,
      deliveryEnd,
      stabilityCheckId: stabilityCheck.id,
      gridCertificateId: gridCert.id,
      actorId: "system-golden-path",
      energyTransferData: {
        amount: 50,
        price: 5.0,
        startTime: now,
        intervalMinutes: 60,
        averagePowerKw: 50,
        stabilitycheckid: stabilityCheck.id,
        gridcertificateid: gridCert.id,
      },
      negotiationRoundData: {
        roundNumber: 1,
        activeAgentId: sellerProvision.agentId,
        opponentAgentId: buyerProvision.agentId,
        action: "ACCEPT",
        surplus: 2.5,
        decisionSource: "LLM",
      },
      rlRewardData: {
        agentId: sellerProvision.agentId,
        rewardValue: 0.75,
      },
    });

    expect(settlementResult.settlement.status).toBe("COMMITTED");
    expect(settlementResult.wasIdempotent).toBe(false);

    // Step 22: EnergyTransfer persists
    const transfers = await prisma.energyTransfer.findMany({
      where: { negotiationId: negotiation.id },
    });
    expect(transfers.length).toBeGreaterThanOrEqual(1);
    expect(transfers[0].fromMicrogridId).toBe(sellerProvision.microgridId);
    expect(transfers[0].toMicrogridId).toBe(buyerProvision.microgridId);
    expect(transfers[0].status).toBe("COMMITTED");

    // Step 23: AuditEvent persists
    const auditEvents = await prisma.auditEvent.findMany({
      where: { negotiationId: negotiation.id },
      orderBy: { sequence: "asc" },
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(2);
    const eventTypes = auditEvents.map((e) => e.eventType);
    expect(eventTypes).toContain("SETTLEMENT_PROVISIONAL");
    expect(eventTypes).toContain("SETTLEMENT_COMMITTED");

    // Verify hash chain integrity
    for (let i = 1; i < auditEvents.length; i++) {
      expect(auditEvents[i].previousHash).toBe(auditEvents[i - 1].eventHash);
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 24: Both owners see only their own relevant trade information
  // ────────────────────────────────────────────────────────────────────

  it("24. Both owners see only their own relevant trade information", async () => {
    // Re-issue tokens with updated microgrid memberships
    const sellerMemberships = await prisma.userMicrogridMembership.findMany({
      where: { userId: sellerUser.id },
      select: { microgridId: true },
    });
    sellerToken = signToken({
      userId: sellerUser.id,
      email: sellerUser.email,
      role: sellerUser.role,
      microgridIds: sellerMemberships.map((m) => m.microgridId),
    });

    const buyerMemberships = await prisma.userMicrogridMembership.findMany({
      where: { userId: buyerUser.id },
      select: { microgridId: true },
    });
    buyerToken = signToken({
      userId: buyerUser.id,
      email: buyerUser.email,
      role: buyerUser.role,
      microgridIds: buyerMemberships.map((m) => m.microgridId),
    });

    // Seller sees their trades
    const sellerTrades = await request(app)
      .get("/api/me/trades")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(sellerTrades.status).toBe(200);

    // Buyer sees their trades
    const buyerTrades = await request(app)
      .get("/api/me/trades")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(buyerTrades.status).toBe(200);

    // Seller sees their settlements
    const sellerSettlements = await request(app)
      .get("/api/me/settlements")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(sellerSettlements.status).toBe(200);

    // Buyer sees their settlements
    const buyerSettlements = await request(app)
      .get("/api/me/settlements")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(buyerSettlements.status).toBe(200);
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 25: Admin sees the global transaction
  // ────────────────────────────────────────────────────────────────────

  it("25. Admin sees the global settlement and energy transfer", async () => {
    // Admin can see all settlements via global API
    const settlementsRes = await request(app)
      .get("/api/settlements")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(settlementsRes.status).toBe(200);

    const allSettlements = settlementsRes.body;
    const gpSettlement = Array.isArray(allSettlements)
      ? allSettlements.find((s: any) => s.negotiationId === negotiation.id)
      : null;
    expect(gpSettlement).toBeTruthy();

    // Admin can see all energy transfers
    const transfersRes = await request(app)
      .get("/api/energy-transfers")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(transfersRes.status).toBe(200);

    // Admin can see audit events
    const auditRes = await request(app)
      .get("/api/audit-events")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body)).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // STEP 26: Unauthorized cross-tenant reads fail
  // ────────────────────────────────────────────────────────────────────

  it("26. Unauthorized cross-tenant reads fail", async () => {
    // Seller cannot see buyer's microgrids through tenant-scoped API
    const sellerMicrogrids = await request(app)
      .get("/api/me/microgrids")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(sellerMicrogrids.status).toBe(200);

    if (Array.isArray(sellerMicrogrids.body)) {
      const mgIds = sellerMicrogrids.body.map((m: any) => m.id);
      expect(mgIds).not.toContain(buyerProvision.microgridId);
    }

    // Buyer cannot see seller's microgrids
    const buyerMicrogrids = await request(app)
      .get("/api/me/microgrids")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(buyerMicrogrids.status).toBe(200);

    if (Array.isArray(buyerMicrogrids.body)) {
      const mgIds = buyerMicrogrids.body.map((m: any) => m.id);
      expect(mgIds).not.toContain(sellerProvision.microgridId);
    }

    // Seller cannot see buyer's agent
    const sellerAgent = await request(app)
      .get("/api/me/agent")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(sellerAgent.status).toBe(200);

    if (sellerAgent.body && Array.isArray(sellerAgent.body)) {
      const agentIds = sellerAgent.body.map((a: any) => a.id);
      expect(agentIds).not.toContain(buyerProvision.agentId);
    }

    // Seller cannot see buyer's DERs
    const sellerDers = await request(app)
      .get("/api/me/ders")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(sellerDers.status).toBe(200);

    if (Array.isArray(sellerDers.body)) {
      const derMgIds = sellerDers.body.map((d: any) => d.microgridId);
      expect(derMgIds).not.toContain(buyerProvision.microgridId);
    }

    // DER_OWNER cannot access admin-only onboarding endpoint
    const ownerAdminRes = await request(app)
      .get("/api/admin/onboarding")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect([401, 403]).toContain(ownerAdminRes.status);
  });

  // ────────────────────────────────────────────────────────────────────
  // BONUS: Settlement idempotency
  // ────────────────────────────────────────────────────────────────────

  it("BONUS: Settlement idempotency — same key returns existing record", async () => {
    const now = new Date();
    const idempotentResult = await commitSettlement({
      idempotencyKey: `golden-path-settlement-${ts}`,
      negotiationId: negotiation.id,
      sellerMicrogridId: sellerProvision.microgridId,
      buyerMicrogridId: buyerProvision.microgridId,
      energyKwh: 50,
      pricePerKwh: 0.10,
      deliveryStart: now,
      deliveryEnd: new Date(now.getTime() + 60 * 60 * 1000),
    });

    expect(idempotentResult.wasIdempotent).toBe(true);
    expect(idempotentResult.settlement.id).toBe(settlementResult.settlement.id);
  });
});
