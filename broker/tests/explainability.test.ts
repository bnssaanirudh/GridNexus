import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";
import { prisma } from "../src/db/prisma.js";
import { signToken } from "../src/middleware/auth.js";
import { commitSettlement } from "../src/services/settlementService.js";

describe("Phase 9 — Agent Decision Explainability Layer (Prompt 9.1)", () => {
  let userA: any;
  let userB: any;
  let userC: any;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

  let mgA: any;
  let mgB: any;
  let mgC: any;

  let sellerAgent: any;
  let buyerAgent: any;
  let negId: string;
  let stabCheckId: string;
  let gridCertId: string;
  let oracleSignalId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = "supersecret_test_jwt_key_must_be_at_least_32_chars_long_123456";
    process.env.ENCRYPTION_KEY = "1234567890123456789012345678901234567890123456789012345678901234";

    const timestamp = Date.now();

    // 1. Create 3 test users
    userA = await prisma.user.create({
      data: {
        username: `explain_owner_a_${timestamp}`,
        email: `explain_a_${timestamp}@example.com`,
        passwordHash: "hash_a",
        role: "DER_OWNER",
      },
    });

    userB = await prisma.user.create({
      data: {
        username: `explain_owner_b_${timestamp}`,
        email: `explain_b_${timestamp}@example.com`,
        passwordHash: "hash_b",
        role: "DER_OWNER",
      },
    });

    userC = await prisma.user.create({
      data: {
        username: `explain_owner_c_${timestamp}`,
        email: `explain_c_${timestamp}@example.com`,
        passwordHash: "hash_c",
        role: "DER_OWNER",
      },
    });

    tokenA = signToken({ userId: userA.id, role: userA.role, username: userA.username });
    tokenB = signToken({ userId: userB.id, role: userB.role, username: userB.username });
    tokenC = signToken({ userId: userC.id, role: userC.role, username: userC.username });

    // 2. Create Microgrids
    mgA = await prisma.microgrid.create({
      data: {
        name: `Solar/Battery Microgrid A ${timestamp}`,
        type: "SOLAR_BATTERY",
        hiddenbatterycapacity: "100",
        hiddengenerationcost: "10",
      },
    });
    mgB = await prisma.microgrid.create({
      data: {
        name: `Consumer Microgrid B ${timestamp}`,
        type: "CONSUMER_SITE",
        hiddenbatterycapacity: "0",
        hiddengenerationcost: "0",
      },
    });
    mgC = await prisma.microgrid.create({
      data: {
        name: `Isolated Microgrid C ${timestamp}`,
        type: "COMMERCIAL",
        hiddenbatterycapacity: "50",
        hiddengenerationcost: "12",
      },
    });

    // 3. Memberships
    await prisma.userMicrogridMembership.createMany({
      data: [
        { userId: userA.id, microgridId: mgA.id, role: "OWNER" },
        { userId: userB.id, microgridId: mgB.id, role: "OWNER" },
        { userId: userC.id, microgridId: mgC.id, role: "OWNER" },
      ],
    });

    // 4. Create DERs for mgA (Solar + Battery)
    await prisma.dER.createMany({
      data: [
        {
          microgridId: mgA.id,
          type: "SOLAR_PV",
          ratedPowerKw: 25.0,
          minPowerKw: 0,
          maxPowerKw: 25.0,
          efficiency: 0.95,
        },
        {
          microgridId: mgA.id,
          type: "BATTERY_STORAGE",
          ratedPowerKw: 15.0,
          energyCapacityKwh: 40.0,
          minPowerKw: -15.0,
          maxPowerKw: 15.0,
          efficiency: 0.92,
          metadata: { currentSoC: 0.70 },
        },
      ],
    });

    // 5. Create Preferences for mgA and mgB
    await prisma.tradingPreference.create({
      data: {
        microgridId: mgA.id,
        tradingEnabled: true,
        minimumBatteryReservePct: 20.0,
        minimumPreferredSalePrice: 0.10,
        riskProfile: "BALANCED",
      },
    });

    await prisma.tradingPreference.create({
      data: {
        microgridId: mgB.id,
        tradingEnabled: true,
        maximumPreferredBuyPrice: 0.18,
        riskProfile: "BALANCED",
      },
    });

    // 6. Create Agents
    sellerAgent = await prisma.agent.create({
      data: {
        microgridId: mgA.id,
        type: "SELLER",
      },
    });

    buyerAgent = await prisma.agent.create({
      data: {
        microgridId: mgB.id,
        type: "BUYER",
      },
    });

    // 7. Create Negotiation & Evidence
    negId = `neg-explain-${timestamp}`;
    await prisma.negotiation.create({
      data: {
        id: negId,
        sellerMicrogridId: mgA.id,
        buyerMicrogridId: mgB.id,
        status: "COMMITTED",
        currency: "USD",
      },
    });

    // Oracle Signal
    const sig = await prisma.oracleSignal.create({
      data: {
        signalData: JSON.stringify({ frequencyHz: 60.01, congestionPct: 15.2, confidence: 0.94 }),
      },
    });
    oracleSignalId = sig.id;

    // Belief Update
    await prisma.beliefUpdate.create({
      data: {
        negotiationId: negId,
        triggeringsignalid: oracleSignalId,
        prior: 0.5,
        likelihood: 0.85,
        posterior: 0.73,
        confidence: 0.94,
        decisionSource: "LLM",
        status: "COMPLETE",
        beforeBelief: 0.5,
        afterBelief: 0.73,
      },
    });

    // Reasoning Deficit with sensitive chain of thought that MUST NEVER leak
    await prisma.reasoningDeficit.create({
      data: {
        agentId: sellerAgent.id,
        negotiationId: negId,
        round: 1,
        rawLlmOutput: "SECRET_CHAIN_OF_THOUGHT: I should price at cost 0.05 but opponent is desperate",
        validationError: "FORMAT_DISCREPANCY",
        fallbackUsed: false,
      },
    });

    // Stability Check
    const stab = await prisma.stabilityCheck.create({
      data: {
        id: `sc-exp-${timestamp}`,
        isStable: true,
        margin: 7.85,
        negotiationId: negId,
        topologyVersion: 1,
      },
    });
    stabCheckId = stab.id;

    // Grid Certificate
    const cert = await prisma.gridFeasibilityCertificate.create({
      data: {
        id: `cert-exp-${timestamp}`,
        negotiationId: negId,
        networkVersion: 1,
        solver: "AC Feasibility Engine",
        solverVersion: "2.1",
        feasible: true,
        violations: [],
        maxLineLoadingPct: 32.5,
        minVoltagePu: 0.985,
        maxVoltagePu: 1.015,
        powerBalanceError: 0.0001,
        inputHash: "input-hash-exp",
        resultHash: "result-hash-exp",
      },
    });
    gridCertId = cert.id;

    // Negotiation Rounds
    await prisma.negotiationRound.createMany({
      data: [
        {
          negotiationId: negId,
          roundNumber: 1,
          activeAgentId: sellerAgent.id,
          opponentAgentId: buyerAgent.id,
          action: "OFFER",
          surplus: 1.25,
          decisionSource: "LLM_AGENT",
        },
        {
          negotiationId: negId,
          roundNumber: 2,
          activeAgentId: buyerAgent.id,
          opponentAgentId: sellerAgent.id,
          action: "ACCEPT",
          surplus: 0.95,
          decisionSource: "LLM_AGENT",
        },
      ],
    });

    // Commit Settlement
    const deliveryStart = new Date();
    await commitSettlement({
      idempotencyKey: `settle-exp-${timestamp}`,
      negotiationId: negId,
      sellerMicrogridId: mgA.id,
      buyerMicrogridId: mgB.id,
      energyKwh: 30.0,
      pricePerKwh: 0.125,
      deliveryStart,
      deliveryEnd: new Date(deliveryStart.getTime() + 3600_000),
      stabilityCheckId: stabCheckId,
      gridCertificateId: gridCertId,
      actorId: "test-explain",
      energyTransferData: {
        amount: 30.0,
        price: 0.125,
        startTime: deliveryStart,
        intervalMinutes: 60,
        averagePowerKw: 30.0,
        stabilitycheckid: stabCheckId,
        gridcertificateid: gridCertId,
      },
    });
  });

  afterAll(async () => {
    // Database is in append-only audit mode for settlements; test entities are uniquely keyed by timestamp
  });

  it("1.1 should require authentication for /api/me/explanations", async () => {
    const res = await request(app).get("/api/me/explanations");
    expect(res.status).toBe(401);
  });

  it("1.2 should return structured decision explanations for authorized DER owner", async () => {
    const res = await request(app)
      .get("/api/me/explanations")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const explanation = res.body.find((e: any) => e.negotiationId === negId);
    expect(explanation).toBeDefined();

    // Verify all required fields from Prompt 9.1
    expect(explanation).toHaveProperty("decision");
    expect(explanation).toHaveProperty("offeredPrice");
    expect(explanation).toHaveProperty("energyKwh");
    expect(explanation).toHaveProperty("confidence");
    expect(explanation).toHaveProperty("decisionSource");
    expect(explanation).toHaveProperty("topFactors");
    expect(explanation).toHaveProperty("ownerConstraintsSatisfied");
    expect(explanation).toHaveProperty("stabilityStatus");
    expect(explanation).toHaveProperty("gridStatus");
    expect(explanation).toHaveProperty("oracleSignalIds");
    expect(explanation).toHaveProperty("timestamp");

    // Specific values
    expect(explanation.stabilityStatus).toBe("STABLE");
    expect(explanation.gridStatus).toBe("FEASIBLE");
    expect(explanation.ownerConstraintsSatisfied).toBe(true);
    expect(Array.isArray(explanation.topFactors)).toBe(true);
    expect(explanation.topFactors.length).toBeGreaterThan(0);
  });

  it("1.3 should trace explanations to persisted evidence IDs for auditability", async () => {
    const res = await request(app)
      .get(`/api/me/negotiations/${negId}/explanation`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const exp = res.body[0];

    expect(exp.evidenceIds).toBeDefined();
    expect(exp.evidenceIds.stabilityCheckId).toBe(stabCheckId);
    expect(exp.evidenceIds.gridCertificateId).toBe(gridCertId);
    expect(exp.oracleSignalIds).toContain(oracleSignalId);
  });

  it("1.4 PRIVACY GUARANTEE: should NEVER expose raw LLM chain-of-thought or sensitive scratchpads", async () => {
    const res = await request(app)
      .get("/api/me/explanations")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const rawPayload = JSON.stringify(res.body);

    // Assert that raw chain-of-thought is nowhere in the payload
    expect(rawPayload).not.toContain("SECRET_CHAIN_OF_THOUGHT");
    expect(rawPayload).not.toContain("opponent is desperate");
    expect(rawPayload).not.toContain("rawLlmOutput");
  });

  it("1.5 PRIVACY GUARANTEE: should not expose private opponent strategy secrets", async () => {
    // Owner B requests explanation
    const res = await request(app)
      .get(`/api/me/negotiations/${negId}/explanation`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    const rawPayload = JSON.stringify(res.body);

    // Private values belonging to owner A must not leak to owner B
    expect(rawPayload).not.toContain("hiddenGenCost");
    expect(rawPayload).not.toContain("hiddenBattery");
    expect(rawPayload).not.toContain("hiddenCapacity");
  });

  it("1.6 TENANT ISOLATION: third-party owner C cannot view explanations for negotiations between A and B", async () => {
    const resList = await request(app)
      .get("/api/me/explanations")
      .set("Authorization", `Bearer ${tokenC}`);

    expect(resList.status).toBe(200);
    const found = resList.body.find((e: any) => e.negotiationId === negId);
    expect(found).toBeUndefined();

    const resSingle = await request(app)
      .get(`/api/me/negotiations/${negId}/explanation`)
      .set("Authorization", `Bearer ${tokenC}`);

    expect(resSingle.status).toBe(404);
  });

  it("1.7 should report owner price constraint violation if offered price breaches minimum", async () => {
    // Update owner A minimum price to be higher than offered price
    await prisma.tradingPreference.update({
      where: { microgridId: mgA.id },
      data: { minimumPreferredSalePrice: 0.20 }, // offered price is 0.125
    });

    const res = await request(app)
      .get(`/api/me/negotiations/${negId}/explanation`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const exp = res.body[0];
    expect(exp.ownerConstraintsSatisfied).toBe(false);
    expect(exp.topFactors.some((f: string) => f.includes("violated"))).toBe(true);

    // Reset back
    await prisma.tradingPreference.update({
      where: { microgridId: mgA.id },
      data: { minimumPreferredSalePrice: 0.10 },
    });
  });
});
