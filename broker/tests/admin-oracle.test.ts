import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";

describe("Admin Oracle Source Management APIs", () => {
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

  const testSourceIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    const timestamp = Date.now();

    adminUser = await prisma.user.create({
      data: {
        email: `oracle_admin_${timestamp}@test.com`,
        username: `oracle_admin_${timestamp}`,
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
        email: `oracle_op_${timestamp}@test.com`,
        username: `oracle_op_${timestamp}`,
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
        email: `oracle_aud_${timestamp}@test.com`,
        username: `oracle_aud_${timestamp}`,
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
        email: `oracle_owner_${timestamp}@test.com`,
        username: `oracle_owner_${timestamp}`,
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
        email: `oracle_view_${timestamp}@test.com`,
        username: `oracle_view_${timestamp}`,
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
  });

  afterAll(async () => {
    // Clean up created sources
    for (const id of testSourceIds) {
      try {
        await prisma.$executeRaw`DELETE FROM embedded_documents WHERE id = ${id}`;
      } catch (_e) {}
    }

    // Clean up users
    const userIds = [adminUser?.id, operatorUser?.id, auditorUser?.id, derOwnerUser?.id, viewerUser?.id].filter(Boolean);
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await disconnectPrisma();
  });

  describe("GET /api/admin/oracle/sources - Read RBAC", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/admin/oracle/sources");
      expect(res.status).toBe(401);
    });

    it("rejects DER_OWNER with 403", async () => {
      const res = await request(app)
        .get("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${derOwnerToken}`);
      expect(res.status).toBe(403);
    });

    it("rejects VIEWER with 403", async () => {
      const res = await request(app)
        .get("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${viewerToken}`);
      expect(res.status).toBe(403);
    });

    it("allows ADMIN to list sources", async () => {
      const res = await request(app)
        .get("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sources");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.sources)).toBe(true);
    });

    it("allows AUDITOR to list sources (read-only)", async () => {
      const res = await request(app)
        .get("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${auditorToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sources)).toBe(true);
    });
  });

  describe("POST /api/admin/oracle/sources - Ingestion & Mutation RBAC", () => {
    it("rejects mutation by AUDITOR with 403", async () => {
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({
          content: "Auditor attempting manual injection of signal data.",
          sourceType: "REGULATORY",
          sourceName: "FERC Order 2222 Update",
          publisher: "FERC",
        });
      expect(res.status).toBe(403);
    });

    it("rejects mutation by DER_OWNER with 403", async () => {
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${derOwnerToken}`)
        .send({
          content: "DER Owner attempting signal injection.",
          sourceType: "WEATHER",
          sourceName: "Local Weather",
          publisher: "Community",
        });
      expect(res.status).toBe(403);
    });

    it("rejects payload with too short content", async () => {
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          content: "hi",
          sourceType: "WEATHER",
          sourceName: "Solar Forecast",
          publisher: "NREL",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("CONTENT_BOUND_ERROR");
    });

    it("rejects payload missing source provenance", async () => {
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          content: "Valid length content for grid stability update.",
          sourceType: "GRID_NOTICE",
          // missing sourceName and publisher
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("MISSING_SOURCE_NAME");
    });

    it("rejects payload with invalid URI format", async () => {
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          content: "Valid content about transmission line maintenance.",
          sourceType: "GRID_NOTICE",
          sourceName: "CAISO Maintenance",
          publisher: "CAISO",
          sourceUri: "ftp://bad-protocol.com/file",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_URI");
    });

    it("rejects payload with invalid trust score outside [0, 1]", async () => {
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          content: "Valid content with out of bounds trust score.",
          sourceType: "PRICE_FEED",
          sourceName: "Day Ahead LMP",
          publisher: "ERCOT",
          trustScore: 1.5,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_TRUST_SCORE");
    });

    it("rejects payload where validUntil is earlier than validFrom", async () => {
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          content: "Valid content with invalid date interval.",
          sourceType: "WEATHER",
          sourceName: "Storm Warning",
          publisher: "NOAA",
          validFrom: "2026-09-10T00:00:00Z",
          validUntil: "2026-09-08T00:00:00Z",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_DATE_RANGE");
    });

    it("allows ADMIN to manually submit an approved Oracle source and audits it", async () => {
      const payload = {
        content: "Solar irradiance forecast indicates clear skies with peak 980 W/m2 at solar noon across Microgrid Alpha cluster.",
        sourceType: "WEATHER",
        sourceName: "NOAA Solar GHI Model",
        sourceUri: "https://api.weather.gov/gridpoints/MTR/88,126/forecast",
        publisher: "NOAA National Weather Service",
        observedAt: new Date().toISOString(),
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        trustScore: 0.98,
        metadata: { solarZenithAngleDeg: 14.2, clearSkyIndex: 0.95 },
      };

      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.sourceType).toBe("WEATHER");
      expect(res.body.sourceName).toBe("NOAA Solar GHI Model");
      expect(res.body.publisher).toBe("NOAA National Weather Service");
      expect(res.body.trustScore).toBe(0.98);
      expect(res.body.status).toBe("ACTIVE");
      expect(res.body).toHaveProperty("contentHash");

      testSourceIds.push(res.body.id);

      // Verify audit event persisted in SHA-256 audit chain
      const audit = await prisma.auditEvent.findFirst({
        where: {
          eventType: "ORACLE_SOURCE_INGESTED",
          actorId: adminUser.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
      expect(audit?.eventHash).toBeTruthy();
    });

    it("allows GRID_OPERATOR to manually submit an approved Oracle source", async () => {
      const payload = {
        content: "Transformer substations T-104 and T-105 operating under nominal thermal headroom; line ampacity rating 1200A.",
        sourceType: "GRID_NOTICE",
        sourceName: "Substation Telemetry Feed",
        publisher: "Regional Transmission Operator",
        trustScore: 0.92,
      };

      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${operatorToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.sourceType).toBe("GRID_NOTICE");
      testSourceIds.push(res.body.id);
    });
  });

  describe("POST /api/admin/oracle/sources/:id/revoke & reingest", () => {
    let targetSourceId: string;

    beforeAll(async () => {
      // Ingest a source to test revoking and re-ingesting
      const res = await request(app)
        .post("/api/admin/oracle/sources")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          content: "Pre-storm capacity conservation advisory: DERs advised to sustain 40% state-of-charge reserve.",
          sourceType: "OPERATIONAL",
          sourceName: "Severe Weather Advisory",
          publisher: "System Emergency Operations Center",
          trustScore: 0.95,
        });
      targetSourceId = res.body.id;
      testSourceIds.push(targetSourceId);
    });

    it("rejects revoking by AUDITOR with 403", async () => {
      const res = await request(app)
        .post(`/api/admin/oracle/sources/${targetSourceId}/revoke`)
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ reason: "Auditor attempting revocation" });
      expect(res.status).toBe(403);
    });

    it("allows ADMIN to revoke an active source and records audit event", async () => {
      const res = await request(app)
        .post(`/api/admin/oracle/sources/${targetSourceId}/revoke`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Storm track moved out of forecast zone; advisory expired." });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REVOKED");

      // Verify status in GET /sources
      const listRes = await request(app)
        .get("/api/admin/oracle/sources?status=revoked")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      const revokedItem = listRes.body.sources.find((s: any) => s.id === targetSourceId);
      expect(revokedItem).toBeDefined();
      expect(revokedItem?.status).toBe("REVOKED");

      // Verify audit event
      const audit = await prisma.auditEvent.findFirst({
        where: {
          eventType: "ORACLE_SOURCE_REVOKED",
          actorId: adminUser.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
      expect((audit?.payload as any)?.documentId).toBe(targetSourceId);
    });

    it("allows GRID_OPERATOR to re-ingest / reactivate a revoked source", async () => {
      const res = await request(app)
        .post(`/api/admin/oracle/sources/${targetSourceId}/reingest`)
        .set("Authorization", `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ACTIVE");

      // Verify status in GET /sources
      const listRes = await request(app)
        .get("/api/admin/oracle/sources?status=active")
        .set("Authorization", `Bearer ${operatorToken}`);
      const activeItem = listRes.body.sources.find((s: any) => s.id === targetSourceId);
      expect(activeItem).toBeDefined();
      expect(activeItem?.status).toBe("ACTIVE");

      // Verify audit event
      const audit = await prisma.auditEvent.findFirst({
        where: {
          eventType: "ORACLE_SOURCE_REINGESTED",
          actorId: operatorUser.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
      expect((audit?.payload as any)?.documentId).toBe(targetSourceId);
    });
  });

  describe("GET /api/admin/oracle/audits", () => {
    it("rejects DER_OWNER with 403", async () => {
      const res = await request(app)
        .get("/api/admin/oracle/audits")
        .set("Authorization", `Bearer ${derOwnerToken}`);
      expect(res.status).toBe(403);
    });

    it("allows ADMIN to retrieve audits", async () => {
      const res = await request(app)
        .get("/api/admin/oracle/audits")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("retrievedAudits");
      expect(res.body).toHaveProperty("auditEvents");
      expect(Array.isArray(res.body.auditEvents)).toBe(true);
      // Check that at least one of our ORACLE_* events appears
      const hasOracleAudit = res.body.auditEvents.some((e: any) => e.eventType.startsWith("ORACLE_"));
      expect(hasOracleAudit).toBe(true);
    });

    it("allows AUDITOR to view audit trail (governance)", async () => {
      const res = await request(app)
        .get("/api/admin/oracle/audits")
        .set("Authorization", `Bearer ${auditorToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.auditEvents)).toBe(true);
    });
  });
});
