import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";
import { encrypt } from "../src/db/encryption.js";

describe("Transactional Provisioning Workflow", () => {
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

  let testBus: any;

  let approvedApplicant: any;
  let approvedOnboarding: any;

  let unmappedApplicant: any;
  let unmappedOnboarding: any;

  let rollbackApplicant: any;
  let rollbackOnboarding: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    const timestamp = Date.now();

    // Create electrical bus for grid mapping
    testBus = await prisma.bus.create({
      data: {
        externalCode: `BUS-TEST-${timestamp}`,
        voltageLevelKv: 11.0,
        latitude: 12.9716,
        longitude: 77.5946,
      },
    });

    // Create users for each role
    adminUser = await prisma.user.create({
      data: {
        email: `prov_admin_${timestamp}@test.com`,
        username: `prov_admin_${timestamp}`,
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
        email: `prov_op_${timestamp}@test.com`,
        username: `prov_op_${timestamp}`,
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
        email: `prov_audit_${timestamp}@test.com`,
        username: `prov_audit_${timestamp}`,
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
        email: `prov_owner_${timestamp}@test.com`,
        username: `prov_owner_${timestamp}`,
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
        email: `prov_view_${timestamp}@test.com`,
        username: `prov_view_${timestamp}`,
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

    // Create approved applicant 1 (for full provisioning with bus mapping)
    approvedApplicant = await prisma.user.create({
      data: {
        email: `app_prov_1_${timestamp}@test.com`,
        username: `app_prov_1_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    approvedOnboarding = await prisma.userOnboarding.create({
      data: {
        userId: approvedApplicant.id,
        status: "APPROVED",
        siteName: "Solar Park Zeta",
        location: "Koppal, Karnataka",
        derType: "SOLAR",
        hiddenCapacity: encrypt("5000"),
        hiddenBattery: encrypt("2000"),
        hiddenGenCost: encrypt("0.038"),
        reviewedBy: adminUser.id,
        reviewedAt: new Date(),
        reason: "Initial approval",
      },
    });

    // Create approved applicant 2 (for PENDING_GRID_MAPPING test)
    unmappedApplicant = await prisma.user.create({
      data: {
        email: `app_unmap_${timestamp}@test.com`,
        username: `app_unmap_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    unmappedOnboarding = await prisma.userOnboarding.create({
      data: {
        userId: unmappedApplicant.id,
        status: "APPROVED",
        siteName: "Wind Hub Beta",
        location: "Tamil Nadu",
        derType: "WIND",
        hiddenCapacity: encrypt("8000"),
        hiddenBattery: encrypt("0"),
        hiddenGenCost: encrypt("0.042"),
        reviewedBy: operatorUser.id,
        reviewedAt: new Date(),
        reason: "Interconnection pending",
      },
    });

    // Create approved applicant 3 (for rollback test)
    rollbackApplicant = await prisma.user.create({
      data: {
        email: `app_roll_${timestamp}@test.com`,
        username: `app_roll_${timestamp}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });
    rollbackOnboarding = await prisma.userOnboarding.create({
      data: {
        userId: rollbackApplicant.id,
        status: "APPROVED",
        siteName: "Rollback Solar",
        derType: "SOLAR",
      },
    });
  });

  afterAll(async () => {
    // Teardown created microgrids and their associations
    try {
      const ob1 = await prisma.userOnboarding.findUnique({ where: { id: approvedOnboarding?.id } }).catch(() => null);
      const ob2 = await prisma.userOnboarding.findUnique({ where: { id: unmappedOnboarding?.id } }).catch(() => null);
      const mgIds = [ob1?.microgridId, ob2?.microgridId].filter(Boolean) as string[];

      for (const mgId of mgIds) {
        await prisma.agent.deleteMany({ where: { microgridId: mgId } }).catch(() => {});
        await prisma.dER.deleteMany({ where: { microgridId: mgId } }).catch(() => {});
        await prisma.microgridBusMapping.deleteMany({ where: { microgridId: mgId } }).catch(() => {});
        await prisma.userMicrogridMembership.deleteMany({ where: { microgridId: mgId } }).catch(() => {});
        await prisma.microgrid.delete({ where: { id: mgId } }).catch(() => {});
      }
    } catch {}

    // Teardown users (cascades to onboarding)
    const userIds = [
      adminUser?.id,
      operatorUser?.id,
      auditorUser?.id,
      derOwnerUser?.id,
      viewerUser?.id,
      approvedApplicant?.id,
      unmappedApplicant?.id,
      rollbackApplicant?.id,
    ].filter(Boolean);

    for (const uid of userIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }

    if (testBus) {
      await prisma.microgridBusMapping.deleteMany({ where: { busId: testBus.id } }).catch(() => {});
      await prisma.bus.delete({ where: { id: testBus.id } }).catch(() => {});
    }

    await disconnectPrisma();
  });

  describe("Authorization & Security Restrictions", () => {
    it("should deny unauthenticated provisioning with 401", async () => {
      const res = await request(app).post(`/api/admin/onboarding/${approvedOnboarding.id}/provision`);
      expect(res.status).toBe(401);
    });

    it("should deny AUDITOR, DER_OWNER, and VIEWER with 403", async () => {
      const resAuditor = await request(app)
        .post(`/api/admin/onboarding/${approvedOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ busId: testBus.id });
      expect(resAuditor.status).toBe(403);

      const resOwner = await request(app)
        .post(`/api/admin/onboarding/${approvedOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${derOwnerToken}`)
        .send({ busId: testBus.id });
      expect(resOwner.status).toBe(403);

      const resViewer = await request(app)
        .post(`/api/admin/onboarding/${approvedOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ busId: testBus.id });
      expect(resViewer.status).toBe(403);
    });
  });

  describe("Atomic Provisioning with Topology Mapping (Success)", () => {
    let provisionedMgId: string;
    let provisionedAgentId: string;
    let provisionedDerId: string;

    it("should atomically provision Microgrid, DER, Agent, BusMapping, and Membership", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${approvedOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          busId: testBus.id,
          phase: "B",
          agentType: "PROSUMER",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ACTIVE");
      expect(res.body.provisioning).toBeDefined();

      provisionedMgId = res.body.provisioning.microgridId;
      provisionedDerId = res.body.provisioning.derId;
      provisionedAgentId = res.body.provisioning.agentId;
      expect(provisionedMgId).toBeDefined();
      expect(provisionedDerId).toBeDefined();
      expect(provisionedAgentId).toBeDefined();
      expect(res.body.provisioning.busId).toBe(testBus.id);

      // Verify no JWT secret or sensitive key is returned
      expect(res.body.jwtSecret).toBeUndefined();
      expect(res.body.secret).toBeUndefined();

      // Verify Microgrid in DB
      const mg = await prisma.microgrid.findUnique({ where: { id: provisionedMgId } });
      expect(mg).not.toBeNull();
      expect(mg?.name).toBe("Solar Park Zeta");
      expect(mg?.active).toBe(true);

      // Verify DER in DB
      const der = await prisma.dER.findUnique({ where: { id: provisionedDerId } });
      expect(der).not.toBeNull();
      expect(der?.microgridId).toBe(provisionedMgId);
      expect(Number(der?.ratedPowerKw)).toBe(5000);
      expect(Number(der?.energyCapacityKwh)).toBe(2000);

      // Verify Bus Mapping in DB
      const busMapping = await prisma.microgridBusMapping.findUnique({
        where: {
          microgridId_busId: {
            microgridId: provisionedMgId,
            busId: testBus.id,
          },
        },
      });
      expect(busMapping).not.toBeNull();
      expect(busMapping?.phase).toBe("B");

      // Verify Agent in DB
      const agent = await prisma.agent.findUnique({ where: { id: provisionedAgentId } });
      expect(agent).not.toBeNull();
      expect(agent?.microgridId).toBe(provisionedMgId);
      expect(agent?.type).toBe("PROSUMER");

      // Verify UserMicrogridMembership in DB
      const membership = await prisma.userMicrogridMembership.findUnique({
        where: {
          userId_microgridId: {
            userId: approvedApplicant.id,
            microgridId: provisionedMgId,
          },
        },
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe("OWNER");

      // Verify User.microgridId
      const user = await prisma.user.findUnique({ where: { id: approvedApplicant.id } });
      expect(user?.microgridId).toBe(provisionedMgId);

      // Verify UserOnboarding
      const updatedOnboarding = await prisma.userOnboarding.findUnique({
        where: { id: approvedOnboarding.id },
      });
      expect(updatedOnboarding?.status).toBe("ACTIVE");
      expect(updatedOnboarding?.microgridId).toBe(provisionedMgId);
      expect(updatedOnboarding?.derId).toBe(provisionedDerId);
      expect(updatedOnboarding?.agentId).toBe(provisionedAgentId);

      // Verify AuditEvent in cryptographic append chain
      const audit = await prisma.auditEvent.findFirst({
        where: {
          eventType: "ONBOARDING_PROVISIONED",
          actorId: adminUser.id,
        },
        orderBy: { sequence: "desc" },
      });
      expect(audit).not.toBeNull();
      expect((audit?.payload as any).onboardingId).toBe(approvedOnboarding.id);
      expect((audit?.payload as any).microgridId).toBe(provisionedMgId);
      expect(audit?.eventHash).toBeDefined();
    });

    it("should be idempotent and prevent duplicate creation on retry", async () => {
      // Repeat the provisioning request
      const res = await request(app)
        .post(`/api/admin/onboarding/${approvedOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({
          busId: testBus.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("already provisioned");
      expect(res.body.provisioning.microgridId).toBe(provisionedMgId);
      expect(res.body.provisioning.derId).toBe(provisionedDerId);
      expect(res.body.provisioning.agentId).toBe(provisionedAgentId);

      // Verify no duplicate agents or DERs were created
      const agents = await prisma.agent.findMany({ where: { microgridId: provisionedMgId } });
      expect(agents.length).toBe(1);

      const ders = await prisma.dER.findMany({ where: { microgridId: provisionedMgId } });
      expect(ders.length).toBe(1);
    });
  });

  describe("Pending Grid Mapping Workflow", () => {
    let unmappedMgId: string;

    it("should transition to PENDING_GRID_MAPPING when busId is omitted", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${unmappedOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({}); // No busId provided

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PENDING_GRID_MAPPING");

      unmappedMgId = res.body.provisioning.microgridId;
      expect(unmappedMgId).toBeDefined();
      expect(res.body.provisioning.busId).toBeNull();

      // Verify no bus mapping exists yet
      const mappings = await prisma.microgridBusMapping.findMany({
        where: { microgridId: unmappedMgId },
      });
      expect(mappings.length).toBe(0);

      // Verify onboarding status in DB
      const ob = await prisma.userOnboarding.findUnique({ where: { id: unmappedOnboarding.id } });
      expect(ob?.status).toBe("PENDING_GRID_MAPPING");
    });

    it("should map bus and transition to ACTIVE on subsequent call with busId", async () => {
      const res = await request(app)
        .post(`/api/admin/onboarding/${unmappedOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({
          busId: testBus.id,
          phase: "A",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ACTIVE");
      expect(res.body.provisioning.busId).toBe(testBus.id);

      // Verify bus mapping was created
      const mapping = await prisma.microgridBusMapping.findUnique({
        where: {
          microgridId_busId: {
            microgridId: unmappedMgId,
            busId: testBus.id,
          },
        },
      });
      expect(mapping).not.toBeNull();
      expect(mapping?.phase).toBe("A");

      // Verify onboarding status in DB
      const ob = await prisma.userOnboarding.findUnique({ where: { id: unmappedOnboarding.id } });
      expect(ob?.status).toBe("ACTIVE");
    });
  });

  describe("Failure Rollback Guarantee", () => {
    it("should roll back all entities if target bus does not exist", async () => {
      const nonExistentBusId = "00000000-0000-0000-0000-000000000000";

      const res = await request(app)
        .post(`/api/admin/onboarding/${rollbackOnboarding.id}/provision`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          busId: nonExistentBusId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BUS_NOT_FOUND");

      // Verify that onboarding status was NOT changed
      const ob = await prisma.userOnboarding.findUnique({ where: { id: rollbackOnboarding.id } });
      expect(ob?.status).toBe("APPROVED");
      expect(ob?.microgridId).toBeNull();
      expect(ob?.agentId).toBeNull();
      expect(ob?.derId).toBeNull();

      // Verify no microgrid was left behind for this applicant
      const memberships = await prisma.userMicrogridMembership.findMany({
        where: { userId: rollbackApplicant.id },
      });
      expect(memberships.length).toBe(0);
    });
  });
});
