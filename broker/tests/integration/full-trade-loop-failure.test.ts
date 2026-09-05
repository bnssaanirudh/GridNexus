/**
 * broker/tests/integration/full-trade-loop-failure.test.ts
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Failure-injection variant of the full trade-loop test .
 *
 * Injects a deliberate FK violation into the commitTrade transaction to
 * simulate a mid-transaction Postgres failure.  Asserts that zero partial rows
 * are visible after the failure (ACID rollback guarantee).
 *
 * ASSUMPTION: We simulate a "Postgres connection kill" by supplying an invalid
 * microgrid UUID inside a commitTrade call, which causes the DB to reject the
 * INSERT and roll back the whole transaction.  Actual connection-level kill
 * would require Docker socket access not available in CI; this is the most
 * defensible offline equivalent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { commitTrade } from "../../src/services/commitTrade.js";
import { encrypt } from "../../src/db/encryption.js";

const prisma = new PrismaClient();

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

describe("Full Trade-Loop Failure Injection", () => {
  let negotiation: { id: string };
  let oracleSignal: { id: string };
  let stabilityCheck: { id: string };
  let agent: { id: string };
  let mg1: { id: string };
  let mg2: { id: string };

  beforeAll(async () => {
    mg1 = await prisma.microgrid.create({
      data: {
        name: "FailInject-MG1",
        type: "SOLAR",
        hiddenbatterycapacity: encrypt("100"),
        hiddengenerationcost: encrypt("0.10"),
      }
    });
    mg2 = await prisma.microgrid.create({
      data: {
        name: "FailInject-MG2",
        type: "WIND",
        hiddenbatterycapacity: encrypt("200"),
        hiddengenerationcost: encrypt("0.20"),
      }
    });
    oracleSignal  = await prisma.oracleSignal.create({ data: { signalData: "{}" } });
    negotiation   = await prisma.negotiation.create({ data: { status: "PENDING" } });
    stabilityCheck = await prisma.stabilityCheck.create({ data: { isStable: true, margin: 5.0 } });
    agent = await prisma.agent.create({ data: { type: "SELLER", microgridId: mg1.id } });
  });

  afterAll(async () => {
    // cleanup – FK order matters; raw SQL bypasses any append-only triggers
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "energytransfers"`);
      await prisma.$executeRawUnsafe(`DELETE FROM "rlrewards"`);
      await prisma.$executeRawUnsafe(`DELETE FROM "beliefupdates"`);
      await prisma.negotiation.deleteMany({});
      await prisma.stabilityCheck.deleteMany({});
      await prisma.agent.deleteMany({});
      await prisma.microgrid.deleteMany({});
    } catch (_) { /* ignore */ }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Purge any rows written by a previous test run in this suite
    await prisma.$executeRawUnsafe(`DELETE FROM "energytransfers"`);
    await prisma.$executeRawUnsafe(`DELETE FROM "rlrewards"`);
    await prisma.$executeRawUnsafe(`DELETE FROM "beliefupdates" WHERE "negotiationId" = '${negotiation.id}'`);
  });

  it("rolls back entirely when the EnergyTransfer has an invalid microgrid FK", async () => {
    // Snapshot counts before the attempted commit
    const beforeBelief  = await prisma.beliefUpdate.count({ where: { negotiationId: negotiation.id } });
    const beforeReward  = await prisma.rlReward.count({    where: { negotiationId: negotiation.id } });
    const beforeTransfer = await prisma.energyTransfer.count({});

    let threw = false;
    try {
      await commitTrade({
        beliefUpdate: {
          negotiationId:      negotiation.id,
          triggeringsignalid: oracleSignal.id,
          beforeBelief:       0.1,
          afterBelief:        0.9,
          decisionSource:     "LLM",
        },
        rlReward: {
          agentId:       agent.id,
          negotiationId: negotiation.id,
          rewardValue:   5.0,
        },
        energyTransfer: {
          fromMicrogridId: NULL_UUID,   // ← invalid FK – triggers Postgres error
          toMicrogridId:   mg2.id,
          amount:          100,
          price:           0.1,
          stabilitycheckid: stabilityCheck.id,
          negotiationId:   negotiation.id,
        },
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);

    // ── No partial rows should be visible ─────────────────────────────────────
    const afterBelief   = await prisma.beliefUpdate.count({ where: { negotiationId: negotiation.id } });
    const afterReward   = await prisma.rlReward.count({    where: { negotiationId: negotiation.id } });
    const afterTransfer = await prisma.energyTransfer.count({});

    expect(afterBelief).toBe(beforeBelief);
    expect(afterReward).toBe(beforeReward);
    expect(afterTransfer).toBe(beforeTransfer);
  });

  it("allows a valid commit after a previously failed transaction (connection is not poisoned)", async () => {
    // After the failure above, the Prisma connection pool should still work.
    const result = await commitTrade({
      beliefUpdate: {
        negotiationId:      negotiation.id,
        triggeringsignalid: oracleSignal.id,
        beforeBelief:       0.3,
        afterBelief:        0.7,
        decisionSource:     "DQN_GATE",
      },
      rlReward: {
        agentId:       agent.id,
        negotiationId: negotiation.id,
        rewardValue:   8.0,
      },
      energyTransfer: {
        fromMicrogridId: mg1.id,   // ← valid this time
        toMicrogridId:   mg2.id,
        amount:          150,
        price:           0.15,
        stabilitycheckid: stabilityCheck.id,
        negotiationId:   negotiation.id,
      },
    });

    expect(result.beliefUpdate).toBeDefined();
    expect(result.rlReward).toBeDefined();
    expect(result.energyTransfer).toBeDefined();
    expect(result.energyTransfer.amount.toNumber()).toBe(150);
  });
});
