/**
 * broker/tests/authorization-and-sensitive-data-audit.test.ts
 * ────────────────────────────────────────────────────────────
 * Phase 14 — Security Hardening: Authorization Matrix & Sensitive Data Audit
 *
 * Requirements:
 * Prompt 14.1:
 * - Full authorization audit across ADMIN, GRID_OPERATOR, DER_OWNER, AUDITOR, VIEWER, and unauthenticated clients.
 * - Verify mutation boundaries, tenant scoping, privilege escalation resistance.
 *
 * Prompt 14.2:
 * - Verify zero exposure of passwordHash, encryption keys, JWT secrets, agent JWTs,
 *   hidden generation costs, hidden battery strategy parameters, opponent private utility,
 *   raw chain-of-thought, or internal stack traces.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";
import { encrypt } from "../src/db/encryption.js";

describe("Phase 14 — Full Authorization Matrix & Sensitive Data Audit", () => {
  const ts = Date.now();
  const PASSWORD = "SuperSecurePassword123!";

  // Users for all distinct roles
  let adminUser: any;
  let operatorUser: any;
  let ownerUserA: any;
  let ownerUserB: any;
  let auditorUser: any;
  let viewerUser: any;

  // JWT Tokens
  let adminToken: string;
  let operatorToken: string;
  let ownerTokenA: string;
  let ownerTokenB: string;
  let auditorToken: string;
  let viewerToken: string;

  // Provisioned resources for Tenant A & B
  let mgA: any;
  let mgB: any;
  let derA: any;
  let derB: any;
  let agentA: any;
  let agentB: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENGINE_JWT_SECRET = "engine_supersecret_agent_key_must_be_at_least_32_chars_long_1234";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";
    process.env.GRIDNEXUS_MODE = "simulation";

    const hash = await bcrypt.hash(PASSWORD, 10);

    // 1. Create ADMIN
    adminUser = await prisma.user.create({
      data: {
        email: `sec_admin_${ts}@test.com`,
        username: `sec_admin_${ts}`,
        passwordHash: hash,
        role: "ADMIN",
        active: true,
      },
    });
    adminToken = signToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      microgridIds: [],
    });

    // 2. Create GRID_OPERATOR
    operatorUser = await prisma.user.create({
      data: {
        email: `sec_operator_${ts}@test.com`,
        username: `sec_operator_${ts}`,
        passwordHash: hash,
        role: "GRID_OPERATOR",
        active: true,
      },
    });
    operatorToken = signToken({
      userId: operatorUser.id,
      email: operatorUser.email,
      role: operatorUser.role,
      microgridIds: [],
    });

    // 3. Create DER_OWNER A
    ownerUserA = await prisma.user.create({
      data: {
        email: `sec_owner_a_${ts}@test.com`,
        username: `sec_owner_a_${ts}`,
        passwordHash: hash,
        role: "DER_OWNER",
        active: true,
      },
    });

    // 4. Create DER_OWNER B
    ownerUserB = await prisma.user.create({
      data: {
        email: `sec_owner_b_${ts}@test.com`,
        username: `sec_owner_b_${ts}`,
        passwordHash: hash,
        role: "DER_OWNER",
        active: true,
      },
    });

    // 5. Create AUDITOR
    auditorUser = await prisma.user.create({
      data: {
        email: `sec_auditor_${ts}@test.com`,
        username: `sec_auditor_${ts}`,
        passwordHash: hash,
        role: "AUDITOR",
        active: true,
      },
    });
    auditorToken = signToken({
      userId: auditorUser.id,
      email: auditorUser.email,
      role: auditorUser.role,
      microgridIds: [],
    });

    // 6. Create VIEWER
    viewerUser = await prisma.user.create({
      data: {
        email: `sec_viewer_${ts}@test.com`,
        username: `sec_viewer_${ts}`,
        passwordHash: hash,
        role: "VIEWER",
        active: true,
      },
    });
    viewerToken = signToken({
      userId: viewerUser.id,
      email: viewerUser.email,
      role: viewerUser.role,
      microgridIds: [],
    });

    // Create Microgrids with encrypted private values
    mgA = await prisma.microgrid.create({
      data: {
        name: `Security MG A ${ts}`,
        externalCode: `SEC-MGA-${ts}`,
        type: "COMMUNITY",
        hiddengenerationcost: encrypt("0.18"),
        hiddenbatterycapacity: encrypt("150.0"),
      },
    });

    mgB = await prisma.microgrid.create({
      data: {
        name: `Security MG B ${ts}`,
        externalCode: `SEC-MGB-${ts}`,
        type: "COMMUNITY",
        hiddengenerationcost: encrypt("0.22"),
        hiddenbatterycapacity: encrypt("200.0"),
      },
    });

    // Link memberships
    await prisma.userMicrogridMembership.create({
      data: { userId: ownerUserA.id, microgridId: mgA.id, role: "OWNER" },
    });
    await prisma.userMicrogridMembership.create({
      data: { userId: ownerUserB.id, microgridId: mgB.id, role: "OWNER" },
    });

    ownerTokenA = signToken({
      userId: ownerUserA.id,
      email: ownerUserA.email,
      role: ownerUserA.role,
      microgridIds: [mgA.id],
    });

    ownerTokenB = signToken({
      userId: ownerUserB.id,
      email: ownerUserB.email,
      role: ownerUserB.role,
      microgridIds: [mgB.id],
    });

    // Create DERs
    derA = await prisma.dER.create({
      data: {
        microgridId: mgA.id,
        type: "SOLAR",
        ratedPowerKw: 50,
        minPowerKw: 0,
        maxPowerKw: 50,
        efficiency: 0.95,
      },
    });

    derB = await prisma.dER.create({
      data: {
        microgridId: mgB.id,
        type: "BATTERY",
        ratedPowerKw: 100,
        minPowerKw: -50,
        maxPowerKw: 100,
        energyCapacityKwh: 200,
        efficiency: 0.92,
      },
    });

    // Create Agents
    agentA = await prisma.agent.create({
      data: {
        microgridId: mgA.id,
        type: "PROSUMER",
        qre_lambda: 1.5,
      },
    });

    agentB = await prisma.agent.create({
      data: {
        microgridId: mgB.id,
        type: "CONSUMER",
        qre_lambda: 2.0,
      },
    });
  });

  afterAll(async () => {
    const mgIds = [mgA?.id, mgB?.id].filter(Boolean);
    const userIds = [
      adminUser?.id,
      operatorUser?.id,
      ownerUserA?.id,
      ownerUserB?.id,
      auditorUser?.id,
      viewerUser?.id,
    ].filter(Boolean);

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

  // ════════════════════════════════════════════════════════════════════
  // 1. AUTHORIZATION MATRIX TESTS (Prompt 14.1)
  // ════════════════════════════════════════════════════════════════════

  describe("1. Full Role-Based Authorization Matrix", () => {
    it("1.1. Unauthenticated requests are rejected on protected endpoints", async () => {
      const endpoints = [
        "/api/me/dashboard",
        "/api/me/microgrids",
        "/api/me/ders",
        "/api/me/preferences",
        "/api/admin/onboarding",
        "/api/admin/oracle/sources",
        "/api/onboarding/status",
      ];

      for (const ep of endpoints) {
        const res = await request(app).get(ep);
        expect(res.status).toBe(401);
      }
    });

    it("1.2. DER_OWNER cannot access Admin Onboarding or Admin Oracle endpoints", async () => {
      const adminEndpoints = [
        { path: "/api/admin/onboarding", method: "get" },
        { path: "/api/admin/onboarding/test-id/approve", method: "post" },
        { path: "/api/admin/onboarding/test-id/reject", method: "post" },
        { path: "/api/admin/onboarding/test-id/suspend", method: "post" },
        { path: "/api/admin/oracle/sources", method: "get" },
        { path: "/api/admin/oracle/sources", method: "post" },
      ];

      for (const { path, method } of adminEndpoints) {
        const req = (request(app) as any)[method](path).set("Authorization", `Bearer ${ownerTokenA}`);
        const res = await req;
        expect([401, 403]).toContain(res.status);
      }
    });

    it("1.3. VIEWER and AUDITOR cannot perform Admin mutations", async () => {
      const mutationEndpoints = [
        { path: "/api/admin/onboarding/some-id/approve", method: "post" },
        { path: "/api/admin/oracle/sources", method: "post" },
      ];

      for (const { path, method } of mutationEndpoints) {
        const viewerRes = await (request(app) as any)[method](path).set("Authorization", `Bearer ${viewerToken}`);
        expect([401, 403]).toContain(viewerRes.status);

        const auditorRes = await (request(app) as any)[method](path).set("Authorization", `Bearer ${auditorToken}`);
        expect([401, 403]).toContain(auditorRes.status);
      }
    });

    it("1.4. ADMIN and GRID_OPERATOR have authorized access to administrative consoles", async () => {
      const adminRes = await request(app)
        .get("/api/admin/onboarding")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);

      const opRes = await request(app)
        .get("/api/admin/onboarding")
        .set("Authorization", `Bearer ${operatorToken}`);
      expect(opRes.status).toBe(200);

      const oracleSources = await request(app)
        .get("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(oracleSources.status).toBe(200);
    });

    it("1.5. Cross-tenant isolation: Owner A cannot view Owner B's microgrids or DERs", async () => {
      const ownerARes = await request(app)
        .get("/api/me/microgrids")
        .set("Authorization", `Bearer ${ownerTokenA}`);
      expect(ownerARes.status).toBe(200);

      const mgIds = ownerARes.body.map((m: any) => m.id);
      expect(mgIds).toContain(mgA.id);
      expect(mgIds).not.toContain(mgB.id);

      const dersRes = await request(app)
        .get("/api/me/ders")
        .set("Authorization", `Bearer ${ownerTokenA}`);
      expect(dersRes.status).toBe(200);
      const derIds = dersRes.body.map((d: any) => d.id);
      expect(derIds).toContain(derA.id);
      expect(derIds).not.toContain(derB.id);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. SENSITIVE DATA EXPOSURE REVIEW (Prompt 14.2)
  // ════════════════════════════════════════════════════════════════════

  describe("2. Sensitive Data Exposure Audit", () => {
    it("2.1. /auth/login never leaks passwordHash in the response", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({ email: adminUser.email, password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user).toBeTruthy();
      expect(res.body.user.passwordHash).toBeUndefined();

      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain("passwordHash");
      expect(rawJson).not.toContain(PASSWORD);
    });

    it("2.2. /api/me/microgrids never returns hidden generation cost or battery capacity", async () => {
      const res = await request(app)
        .get("/api/me/microgrids")
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain("hiddengenerationcost");
      expect(rawJson).not.toContain("hiddenbatterycapacity");
      expect(rawJson).not.toContain("0.18"); // plaintext private cost of mgA
    });

    it("2.3. /api/me/dashboard never leaks agent JWTs or internal signing secrets", async () => {
      const res = await request(app)
        .get("/api/me/dashboard")
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(res.status).toBe(200);
      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain("agentJwt");
      expect(rawJson).not.toContain("supersecret");
      expect(rawJson).not.toContain("hiddengenerationcost");
    });

    it("2.4. /api/me/explanations never leaks raw LLM chain-of-thought or rival internal utility", async () => {
      const res = await request(app)
        .get("/api/me/explanations")
        .set("Authorization", `Bearer ${ownerTokenA}`);

      expect(res.status).toBe(200);
      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain("chainOfThought");
      expect(rawJson).not.toContain("rawLlmOutput");
      expect(rawJson).not.toContain("opponentUtility");
    });

    it("2.5. Error responses never leak database connection strings or server stack traces", async () => {
      const res = await request(app)
        .post("/api/admin/onboarding/non-existent-uuid/approve")
        .set("Authorization", `Bearer ${adminToken}`);

      // Even on 404 or 400 error, no DB connection string or full stack trace
      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain("postgresql://");
      expect(rawJson).not.toContain("redis://");
      expect(rawJson).not.toContain("prisma/client");
    });
  });
});
