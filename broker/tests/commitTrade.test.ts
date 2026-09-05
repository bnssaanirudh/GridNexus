import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { commitTrade } from "../src/services/commitTrade.js";
import { encrypt, decrypt } from "../src/db/encryption.js";

const prisma = new PrismaClient();

describe("commitTrade Transaction", () => {
  let mg1: any, mg2: any, agent1: any, agent2: any, negotiation: any, oracleSignal: any, stabilityCheck: any;

  beforeAll(async () => {
    try {
      await prisma.$executeRawUnsafe("SELECT 1");
    } catch (e) {
      console.warn("Database unavailable. Skipping commitTrade tests.");
      return;
    }
    // Setup base data
    mg1 = await prisma.microgrid.create({
      data: { name: "Test MG1", type: "SOLAR", hiddenbatterycapacity: encrypt("100"), hiddengenerationcost: encrypt("0.1") }
    });
    mg2 = await prisma.microgrid.create({
      data: { name: "Test MG2", type: "WIND", hiddenbatterycapacity: encrypt("200"), hiddengenerationcost: encrypt("0.2") }
    });
    oracleSignal = await prisma.oracleSignal.create({
      data: { signalData: "{}" }
    });
    negotiation = await prisma.negotiation.create({
      data: { status: "TESTING" }
    });
    agent1 = await prisma.agent.create({
      data: { type: "BUYER", microgridId: mg1.id }
    });
    stabilityCheck = await prisma.stabilityCheck.create({
      data: { isStable: true, margin: 10 }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully commit all 3 rows when valid", async (ctx) => {
    if (!agent1) {
      console.warn("Skipping due to DB unavailable");
      ctx.skip();
      return;
    }
    const result = await commitTrade({
      beliefUpdate: {
        negotiationId: negotiation.id,
        triggeringsignalid: oracleSignal.id,
        beforeBelief: 0.1,
        afterBelief: 0.2
      },
      rlReward: {
        agentId: agent1.id,
        negotiationId: negotiation.id,
        rewardValue: 1.0
      },
      energyTransfer: {
        fromMicrogridId: mg1.id,
        toMicrogridId: mg2.id,
        amount: 100,
        price: 0.1,
        stabilitycheckid: stabilityCheck.id
      }
    });

    expect(result.beliefUpdate).toBeDefined();
    expect(result.rlReward).toBeDefined();
    expect(result.energyTransfer).toBeDefined();

    const dbTransfer = await prisma.energyTransfer.findUnique({ where: { id: result.energyTransfer.id }});
    expect(dbTransfer).not.toBeNull();
    expect(dbTransfer?.amount.toNumber()).toBe(100);
  });

  it("should rollback transaction if energyTransfer fails", async (ctx) => {
    if (!agent1) {
      console.warn("Skipping due to DB unavailable");
      ctx.skip();
      return;
    }
    const failNegotiation = await prisma.negotiation.create({ data: { status: "FAIL_TEST" } });
    
    let errorThrown = false;
    try {
      await commitTrade({
        beliefUpdate: {
          negotiationId: failNegotiation.id,
          triggeringsignalid: oracleSignal.id,
          beforeBelief: 0.1,
          afterBelief: 0.2
        },
        rlReward: {
          agentId: agent1.id,
          negotiationId: failNegotiation.id,
          rewardValue: 1.0
        },
        energyTransfer: {
          fromMicrogridId: "00000000-0000-0000-0000-000000000000", // invalid foreign key
          toMicrogridId: mg2.id,
          amount: 100,
          price: 0.1,
          stabilitycheckid: stabilityCheck.id
        }
      });
    } catch (e) {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);

    const beliefUpdates = await prisma.beliefUpdate.findMany({ where: { negotiationId: failNegotiation.id } });
    const rlRewards = await prisma.rlReward.findMany({ where: { negotiationId: failNegotiation.id } });
    
    // Ensure the rows from the same call never persisted due to rollback
    expect(beliefUpdates.length).toBe(0);
    expect(rlRewards.length).toBe(0);
  });
});

describe("Microgrid Encryption", () => {
  it("should encrypt hidden battery capacity so it is not plaintext", async (ctx) => {
    try {
      await prisma.$executeRawUnsafe("SELECT 1");
    } catch {
      console.warn("Database unavailable. Skipping encryption test.");
      ctx.skip();
      return;
    }

    const rawVal = "5000";
    const mg = await prisma.microgrid.create({
      data: { name: "Secret MG", type: "SOLAR", hiddenbatterycapacity: encrypt(rawVal), hiddengenerationcost: encrypt("0.1") }
    });

    // Use queryRawUnsafe to ensure we query exactly the raw db value without Prisma transforming it
    const rawMg = await prisma.$queryRawUnsafe<any[]>(`SELECT hiddenbatterycapacity FROM microgrids WHERE id = '${mg.id}'`);
    const dbValue = rawMg[0].hiddenbatterycapacity;
    
    expect(dbValue).not.toBe(rawVal);
    expect(dbValue).toContain(":"); // our iv:authTag:ciphertext format
    expect(decrypt(dbValue)).toBe(rawVal);
  });
});
