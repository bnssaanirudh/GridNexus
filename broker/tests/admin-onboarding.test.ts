import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";
import { encrypt } from "../src/db/encryption.js";

describe("Admin Onboarding Review & Approval APIs", () => {
  let adminUser: any;
  let operatorUser: any;
  let auditorUser: any;
  let derOwnerUser: any;
  let viewerUser: any;

  let adminToken: string;
  let operatorToken: string;
  let auditorToken: string;
  let derOwnerToken: string;
  let viewerToken: string;

  let pendingApplicant: any;
  let pendingOnboarding: any;

  let incompleteApplicant: any;
  let incompleteOnboarding: any;

  let adminApplicant: any;
  let adminSelfOnboarding: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    const timestamp = Date.now();

    // Create test users for each role
    adminUser = await prisma.user.create({
      data: {
        email: `admin_${timestamp}@test.com`,
        username: `admin_${timestamp}`,
        passwordHash: "dummyhash",
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

    operatorUser = await prisma.user.create({
      data: {
        email: `operator_${timestamp}@test.com`,
        username: `operator_${timestamp}`,
        passwordHash: "dummyhash",
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

    auditorUser = await prisma.user.create({
      data: {
        email: `auditor_${timestamp}@test.com`,
        username: `auditor_${timestamp}`,
        passwordHash: "dummyhash",
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

    derOwnerUser = await prisma.user.create({
      data: {
        email: `der_${timestamp}@test.com`,
        username: `der_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    derOwnerToken = signToken({
      userId: derOwnerUser.id,
      email: derOwnerUser.email,
      role: derOwnerUser.role,
      microgridIds: [],
    });

    viewerUser = await prisma.user.create({
      data: {
        email: `viewer_${timestamp}@test.com`,
        username: `viewer_${timestamp}`,
        passwordHash: "dummyhash",
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

    // Create an applicant with PENDING_VERIFICATION status
    pendingApplicant = await prisma.user.create({
      data: {
        email: `applicant_pending_${timestamp}@test.com`,
        username: `applicant_pending_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    pendingOnboarding = await prisma.userOnboarding.create({
      data: {
        userId: pendingApplicant.id,
        status: "PENDING_VERIFICATION",
        siteName: "Solar Array Alpha",
        location: "Arizona Desert",
        derType: "SOLAR_BATTERY",
        hiddenCapacity: encrypt("2500"),
        hiddenBattery: encrypt("1000"),
        hiddenGenCost: encrypt("0.045"),
      },
    });

    // Create an applicant with PROFILE_INCOMPLETE status
    incompleteApplicant = await prisma.user.create({
      data: {
        email: `applicant_incomplete_${timestamp}@test.com`,
        username: `applicant_incomplete_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    incompleteOnboarding = await prisma.userOnboarding.create({
      data: {
        userId: incompleteApplicant.id,
        status: "PROFILE_INCOMPLETE",
        siteName: "Incomplete Site",
      },
    });

    // Create an onboarding application owned by adminUser (for self-approval tests)
    adminSelfOnboarding = await prisma.userOnboarding.create({
      data: {
        userId: adminUser.id,
        status: "PENDING_VERIFICATION",
        siteName: "Admin Personal Solar",
      },
    });
  });

  afterAll(async () => {
    // Cleanup created users (cascades to onboarding)
    const userIds = [
      adminUser?.id,
      operatorUser?.id,
      auditorUser?.id,
      derOwnerUser?.id,
      viewerUser?.id,
      pendingApplicant?.id,
      incompleteApplicant?.id,
    ].filter(Boolean);

    for (const uid of userIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }

    await disconnectPrisma();
  });

  describe("RBAC & Authorization Matrix", () => {
    it("should deny unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/admin/onboarding");
      expect(res.status).toBe(401);
    });

    it("should deny DER_OWNER and VIEWER from listing applications (403)", async () => {
      const resDer = await request(app)
        .get("/api/admin/onboarding")
        .set("Authorization", `Bearer ${derOwnerToken}`);
      expect(resDer.status).toBe(403);

      const resViewer = await request(app)
        .get("/api/admin/onboarding")
        .set("Authorization", `Bearer ${viewerToken}`);
      expect(resViewer.status).toBe(403);
    });

    it("should allow ADMIN, GRID_OPERATOR, and AUDITOR to list applications", async () => {
      const resAdmin = await request(app)
        .get("/api/admin/onboarding")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
      expect(Array.isArray(resAdmin.body)).toBe(true);

      const resOp = await request(app)
        .get("/api/admin/onboarding")
        .set("Authorization", `Bearer ${operatorToken}`);
      expect(resOp.status).toBe(200);

      const resAuditor = await request(app)
        .get("/api/admin/onboarding")
        .set("Authorization", `Bearer ${auditorToken}`);
      expect(resAuditor.status).toBe(200);
    });

    it("should deny AUDITOR, DER_OWNER, and VIEWER from mutating state (403)", async () => {
      // Approve mutation
      const resAuditor = await request(app)
        .post(`/api/admin/onboarding/${pendingOnboarding.id}/approve`)
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ reason: "Auditor trying to approve" });
      expect(resAuditor.status).toBe(403);

      const resDer = await request(app)
        .post(`/api/admin/onboarding/${pendingOnboarding.id}/approve`)
        .set("Authorization", `Bearer ${derOwnerToken}`)
        .send({ reason: "DER owner trying to approve" });
      expect(resDer.status).toBe(403);

      const resViewer = await request(app)
        .post(`/api/admin/onboarding/${pendingOnboarding.id}/approve`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ reason: "Viewer trying to approve" });
      expect(resViewer.status).toBe(403);
    });
  });

  describe("Private Operational Data Protection", () => {
    it("should decrypt sensitive parameters for ADMIN and GRID_OPERATOR in detail view", async () => {
      const resAdmin = await request(app)
        .get(`/api/admin/onboarding/${pendingOnboarding.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.capacityKw).toBe(2500);
      expect(resAdmin.body.batteryCapacityKwh).toBe(1000);
      expect(resAdmin.body.generationCost).toBe(0.045);
      expect(resAdmin.body.hasPrivateInfo).toBe(true);
      // Ensure encrypted ciphertext is not leaked
      expect(resAdmin.body.hiddenCapacity).toBeUndefined();

      const resOp = await request(app)
        .get(`/api/admin/onboarding/${pendingOnboarding.id}`)
        .set("Authorization", `Bearer ${operatorToken}`);

      expect(resOp.status).toBe(200);
      expect(resOp.body.capacityKw).toBe(2500);
    });

    it("should redact sensitive operational fields for AUDITOR in detail view", async () => {
      const resAuditor = await request(app)
        .get(`/api/admin/onboarding/${pendingOnboarding.id}`)
        .set("Authorization", `Bearer ${auditorToken}`);

      expect(resAuditor.status).toBe(200);
      expect(resAuditor.body.capacityKw).toBeNull();
      expect(resAuditor.body.batteryCapacityKwh).toBeNull();
      expect(resAuditor.body.generationCost).toBeNull();
      expect(resAuditor.body.hasPrivateInfo).toBe(true);
      expect(resAuditor.body.siteName).toBe("Solar Array Alpha");
    });
  });

  describe("Self-Approval Prevention", () => {
    it("should prevent an administrator from approving their own application (403)", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${adminSelfOnboarding.id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Self approval attempt" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("SELF_APPROVAL_FORBIDDEN");
    });
  });

  describe("State Transition Validation & Lifecycle", () => {
    it("should reject approval if application is not in PENDING_VERIFICATION (400)", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${incompleteOnboarding.id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Premature approval" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_STATE");
    });

    it("should allow GRID_OPERATOR to approve a PENDING_VERIFICATION application and record audit event", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${pendingOnboarding.id}/approve`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({ reason: "Interconnection check passed" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
      expect(res.body.onboarding.reviewedBy).toBe(operatorUser.id);
      expect(res.body.onboarding.reason).toBe("Interconnection check passed");

      // Verify AuditEvent was appended in DB
      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          eventType: "ONBOARDING_APPROVED",
          actorId: operatorUser.id,
        },
        orderBy: { sequence: "desc" },
      });

      expect(auditEvent).not.toBeNull();
      expect((auditEvent?.payload as any).onboardingId).toBe(pendingOnboarding.id);
      expect((auditEvent?.payload as any).newStatus).toBe("APPROVED");
      expect(auditEvent?.eventHash).toBeDefined();
    });

    it("should be idempotent when approving an already approved application", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${pendingOnboarding.id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Second approval" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
      expect(res.body.message).toContain("already approved");
    });

    it("should allow suspending an approved application and record audit event", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${pendingOnboarding.id}/suspend`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Safety anomaly reported" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUSPENDED");

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          eventType: "ONBOARDING_SUSPENDED",
          actorId: adminUser.id,
        },
        orderBy: { sequence: "desc" },
      });

      expect(auditEvent).not.toBeNull();
      expect((auditEvent?.payload as any).newStatus).toBe("SUSPENDED");
    });

    it("should be idempotent when suspending an already suspended application", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${pendingOnboarding.id}/suspend`)
        .set("Authorization", `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUSPENDED");
    });

    it("should allow rejecting an incomplete application and record audit event", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${incompleteOnboarding.id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Invalid grid coordinates" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
      expect(res.body.onboarding.reason).toBe("Invalid grid coordinates");

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          eventType: "ONBOARDING_REJECTED",
          actorId: adminUser.id,
        },
        orderBy: { sequence: "desc" },
      });

      expect(auditEvent).not.toBeNull();
      expect((auditEvent?.payload as any).newStatus).toBe("REJECTED");
    });

    it("should be idempotent when rejecting an already rejected application", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${incompleteOnboarding.id}/reject`)
        .set("Authorization", `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
    });

    it("should disallow suspending a rejected application (400)", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${incompleteOnboarding.id}/suspend`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_STATE");
    });
  });
});
