import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import request from "supertest";
import express from "express";
import { authRouter } from "../src/routes/auth";

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use("/auth", authRouter);

describe("Tenant Membership Integration", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
  });

  let testUser: any;
  let testMicrogrid1: any;
  let testMicrogrid2: any;

  beforeAll(async () => {
    // Clean up
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "microgrids" CASCADE`);
    
    // Create Microgrids
    testMicrogrid1 = await prisma.microgrid.create({
      data: {
        name: "Test Microgrid 1",
        type: "RESIDENTIAL",
        hiddenbatterycapacity: "enc_batt_1",
        hiddengenerationcost: "enc_gen_1",
      },
    });

    testMicrogrid2 = await prisma.microgrid.create({
      data: {
        name: "Test Microgrid 2",
        type: "COMMERCIAL",
        hiddenbatterycapacity: "enc_batt_2",
        hiddengenerationcost: "enc_gen_2",
      },
    });

    // Create User
    const passwordHash = await bcrypt.hash("password123", 10);
    testUser = await prisma.user.create({
      data: {
        username: "tenant_owner",
        email: "tenant@example.com",
        passwordHash,
        role: "DER_OWNER",
        microgridId: testMicrogrid1.id, // Legacy compatibility
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "microgrids" CASCADE`);
    await prisma.$disconnect();
  });

  it("should create a UserMicrogridMembership and enforce uniqueness", async () => {
    // 1. Create a membership
    const membership1 = await prisma.userMicrogridMembership.create({
      data: {
        userId: testUser.id,
        microgridId: testMicrogrid1.id,
        role: "OWNER",
      },
    });
    expect(membership1).toBeDefined();
    expect(membership1.role).toBe("OWNER");

    // 2. Prevent duplicate identical membership
    await expect(
      prisma.userMicrogridMembership.create({
        data: {
          userId: testUser.id,
          microgridId: testMicrogrid1.id,
          role: "VIEWER",
        },
      })
    ).rejects.toThrow();

    // 3. Allow membership to a different microgrid
    const membership2 = await prisma.userMicrogridMembership.create({
      data: {
        userId: testUser.id,
        microgridId: testMicrogrid2.id,
        role: "OWNER",
      },
    });
    expect(membership2).toBeDefined();
  });

  it("should include microgridIds in the /auth/login response and token payload", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "tenant@example.com", password: "password123" })
      .expect(200);

    // Verify response body
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.microgridId).toBe(testMicrogrid1.id);
    expect(res.body.user.microgridIds).toBeDefined();
    expect(res.body.user.microgridIds).toHaveLength(2);
    expect(res.body.user.microgridIds).toContain(testMicrogrid1.id);
    expect(res.body.user.microgridIds).toContain(testMicrogrid2.id);

    // Decode token to verify payload
    const jwtPayload = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64').toString());
    expect(jwtPayload.microgridId).toBe(testMicrogrid1.id);
    expect(jwtPayload.microgridIds).toBeDefined();
    expect(jwtPayload.microgridIds).toContain(testMicrogrid1.id);
    expect(jwtPayload.microgridIds).toContain(testMicrogrid2.id);
  });
});
