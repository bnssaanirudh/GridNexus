import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";

describe("DER-Owner Onboarding", () => {
  let testUser: any;
  let validToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    testUser = await prisma.user.create({
      data: {
        email: `onboard_${Date.now()}@test.com`,
        username: `onboard_${Date.now()}`,
        passwordHash: "dummyhash",
        role: "DER_OWNER",
        active: true,
      },
    });

    validToken = signToken({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
      microgridIds: [],
    });
  });

  afterAll(async () => {
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    await disconnectPrisma();
  });

  it("should return NOT_STARTED initially", async () => {
    const res = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("NOT_STARTED");
  });

  it("should initialize onboarding record", async () => {
    const res = await request(app)
      .post("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        siteName: "Test Solar Farm",
        location: "Nevada",
        derType: "SOLAR",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PROFILE_INCOMPLETE");

    const statusRes = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", `Bearer ${validToken}`);
    
    expect(statusRes.body.status).toBe("PROFILE_INCOMPLETE");
    expect(statusRes.body.hasPrivateInfo).toBe(false);
  });

  it("should update and submit onboarding to PENDING_VERIFICATION", async () => {
    const res = await request(app)
      .put("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        capacityKw: 1500,
        batteryCapacityKwh: 500,
        generationCost: 0.05,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PENDING_VERIFICATION");

    const statusRes = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", `Bearer ${validToken}`);
    
    expect(statusRes.body.status).toBe("PENDING_VERIFICATION");
    expect(statusRes.body.hasPrivateInfo).toBe(true);
  });

  it("should block further edits once in PENDING_VERIFICATION", async () => {
    const res = await request(app)
      .put("/api/onboarding/der-owner")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        capacityKw: 2000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_STATE");
  });
});
