import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { encrypt } from "../db/encryption.js";
import { commitSettlement } from "../services/settlementService.js";

const prisma = new PrismaClient();
const AGENT_COUNT = Number.parseInt(process.env.SEED_AGENT_COUNT ?? "1000", 10);
const IS_PRODUCTION = (process.env.GRIDNEXUS_MODE ?? "simulation").toLowerCase() === "production";
const DEMO_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

if (!Number.isInteger(AGENT_COUNT) || AGENT_COUNT < 2 || AGENT_COUNT > 10_000) {
  throw new Error("SEED_AGENT_COUNT must be an integer between 2 and 10000.");
}
if (!process.env.ENCRYPTION_KEY) {
  if (IS_PRODUCTION) throw new Error("ENCRYPTION_KEY is required for production seeding.");
  process.env.ENCRYPTION_KEY = DEMO_KEY;
}

const pad = (value: number, width = 4): string => String(value).padStart(width, "0");
const chunk = <T>(values: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

async function seedUsers(): Promise<void> {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? (IS_PRODUCTION ? "" : "GridNexus-Demo-2026!");
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD ?? (IS_PRODUCTION ? "" : "GridNexus-Viewer-2026!");
  if (!adminPassword || !viewerPassword) {
    throw new Error("SEED_ADMIN_PASSWORD and SEED_VIEWER_PASSWORD are required in production.");
  }
  const [adminHash, viewerHash] = await Promise.all([
    bcrypt.hash(adminPassword, 12),
    bcrypt.hash(viewerPassword, 12),
  ]);
  await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@gridnexus.local" },
      update: { passwordHash: adminHash, role: "ADMIN", active: true },
      create: { username: "grid_admin", email: "admin@gridnexus.local", passwordHash: adminHash, role: "ADMIN" },
    }),
    prisma.user.upsert({
      where: { email: "viewer@gridnexus.local" },
      update: { passwordHash: viewerHash, role: "VIEWER", active: true },
      create: { username: "grid_viewer", email: "viewer@gridnexus.local", passwordHash: viewerHash, role: "VIEWER" },
    }),
  ]);
  if (!IS_PRODUCTION && !process.env.SEED_ADMIN_PASSWORD) {
    console.warn("Simulation credentials: grid_admin / GridNexus-Demo-2026! (change before deployment)");
  }
}

async function seedTopology(): Promise<Map<number, string>> {
  const buses = Array.from({ length: 25 }, (_, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    return {
      id: `seed-bus-${pad(index, 2)}`,
      externalCode: `BLR-BUS-${pad(index + 1, 2)}`,
      voltageLevelKv: index === 0 ? 66 : 11,
      latitude: 12.88 + row * 0.045,
      longitude: 77.50 + column * 0.05,
    };
  });
  for (const bus of buses) {
    await prisma.bus.upsert({ where: { id: bus.id }, update: bus, create: bus });
  }

  const lines: Array<{ id: string; fromBusId: string; toBusId: string }> = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const index = row * 5 + column;
      if (column < 4) lines.push({ id: `seed-line-h-${row}-${column}`, fromBusId: buses[index].id, toBusId: buses[index + 1].id });
      if (row < 4) lines.push({ id: `seed-line-v-${row}-${column}`, fromBusId: buses[index].id, toBusId: buses[index + 5].id });
    }
  }
  for (const [index, line] of lines.entries()) {
    await prisma.line.upsert({
      where: { id: line.id },
      update: { ...line, active: true },
      create: {
        ...line,
        resistance: 0.006 + (index % 7) * 0.0005,
        reactance: 0.018 + (index % 5) * 0.001,
        thermalLimitKw: 8_000 + (index % 4) * 1_500,
        active: true,
      },
    });
  }
  const existingRevision = await prisma.topologyRevision.findFirst({ where: { notes: "Operational 25-bus / 1000-microgrid seed" } });
  if (!existingRevision) await prisma.topologyRevision.create({ data: { notes: "Operational 25-bus / 1000-microgrid seed" } });
  return new Map(buses.map((bus, index) => [index, bus.id]));
}

async function seedMicrogrids(busIds: Map<number, string>): Promise<void> {
  const indices = Array.from({ length: AGENT_COUNT }, (_, index) => index);
  for (const batch of chunk(indices, 25)) {
    await Promise.all(batch.map(async (index) => {
      const code = `MG-${pad(index + 1)}`;
      const busIndex = index % 25;
      const row = Math.floor(busIndex / 5);
      const column = busIndex % 5;
      const seller = index % 2 === 0;
      const ratedPowerKw = seller ? 90 + (index % 17) * 7 : 35 + (index % 11) * 4;
      const microgrid = await prisma.microgrid.upsert({
        where: { externalCode: code },
        update: {
          name: `Bengaluru Microgrid ${pad(index + 1)}`,
          type: seller ? "PROSUMER" : "CONSUMER",
          latitude: 12.88 + row * 0.045 + ((index % 8) - 4) * 0.0015,
          longitude: 77.50 + column * 0.05 + ((index % 7) - 3) * 0.0015,
          active: true,
        },
        create: {
          externalCode: code,
          name: `Bengaluru Microgrid ${pad(index + 1)}`,
          type: seller ? "PROSUMER" : "CONSUMER",
          latitude: 12.88 + row * 0.045 + ((index % 8) - 4) * 0.0015,
          longitude: 77.50 + column * 0.05 + ((index % 7) - 3) * 0.0015,
          active: true,
          hiddenbatterycapacity: encrypt(String(40 + (index % 60))),
          hiddengenerationcost: encrypt((0.045 + (index % 19) * 0.0015).toFixed(4)),
        },
      });
      await Promise.all([
        prisma.agent.upsert({
          where: { id: `agent_${pad(index + 1)}` },
          update: { microgridId: microgrid.id, type: seller ? "SELLER" : "BUYER", qre_lambda: 0.5 + (index % 5) * 0.05 },
          create: { id: `agent_${pad(index + 1)}`, microgridId: microgrid.id, type: seller ? "SELLER" : "BUYER", qre_lambda: 0.5 + (index % 5) * 0.05 },
        }),
        prisma.dER.upsert({
          where: { id: `seed-der-${pad(index + 1)}` },
          update: { microgridId: microgrid.id, type: seller ? (index % 4 === 0 ? "WIND" : "SOLAR") : "BATTERY", ratedPowerKw, minPowerKw: 0, maxPowerKw: ratedPowerKw, efficiency: seller ? 0.94 : 0.91 },
          create: { id: `seed-der-${pad(index + 1)}`, microgridId: microgrid.id, type: seller ? (index % 4 === 0 ? "WIND" : "SOLAR") : "BATTERY", ratedPowerKw, energyCapacityKwh: seller ? null : ratedPowerKw * 2.5, minPowerKw: 0, maxPowerKw: ratedPowerKw, efficiency: seller ? 0.94 : 0.91, metadata: { source: "operational-seed", region: "Bengaluru" } },
        }),
        prisma.microgridBusMapping.upsert({
          where: { microgridId_busId: { microgridId: microgrid.id, busId: busIds.get(busIndex)! } },
          update: { phase: ["A", "B", "C"][index % 3] },
          create: { microgridId: microgrid.id, busId: busIds.get(busIndex)!, phase: ["A", "B", "C"][index % 3] },
        }),
      ]);
    }));
    console.log(`Seeded ${Math.min(batch[batch.length - 1] + 1, AGENT_COUNT)} / ${AGENT_COUNT} microgrids`);
  }
}

async function seedOperations(): Promise<void> {
  const agents = await prisma.agent.findMany({
    where: { id: { in: Array.from({ length: 40 }, (_, index) => `agent_${pad(index + 1)}`) } },
    include: { microgrid: true },
    orderBy: { id: "asc" },
  });
  const byId = new Map(agents.map((agent) => [agent.id, agent]));

  await prisma.oracleSignal.upsert({
    where: { id: "seed-oracle-current" },
    update: { signalData: JSON.stringify({ signal: "BALANCED_GRID", confidence: 0.93, synthetic: true, source: "OPSD + India TMY replay", reasoning: "Seeded operational replay for local validation." }) },
    create: { id: "seed-oracle-current", signalData: JSON.stringify({ signal: "BALANCED_GRID", confidence: 0.93, synthetic: true, source: "OPSD + India TMY replay", reasoning: "Seeded operational replay for local validation." }) },
  });

  for (let index = 0; index < 20; index += 1) {
    const seller = byId.get(`agent_${pad(index * 2 + 1)}`);
    const buyer = byId.get(`agent_${pad(index * 2 + 2)}`);
    if (!seller || !buyer) continue;
    const negotiationId = `seed-negotiation-${pad(index + 1, 2)}`;
    const stabilityId = `seed-stability-${pad(index + 1, 2)}`;
    const certificateId = `seed-certificate-${pad(index + 1, 2)}`;
    const energyKwh = 18 + index * 1.75;
    const pricePerKwh = 0.082 + (index % 6) * 0.004;
    await prisma.negotiation.upsert({
      where: { id: negotiationId },
      update: { sellerMicrogridId: seller.microgridId, buyerMicrogridId: buyer.microgridId },
      create: { id: negotiationId, status: "NEGOTIATING", sellerMicrogridId: seller.microgridId, buyerMicrogridId: buyer.microgridId, currency: "USD" },
    });
    await prisma.stabilityCheck.upsert({
      where: { id: stabilityId },
      update: { isStable: true, margin: 8 + index * 0.35, negotiationId },
      create: { id: stabilityId, isStable: true, margin: 8 + index * 0.35, negotiationId, topologyVersion: 1 },
    });
    await prisma.gridFeasibilityCertificate.upsert({
      where: { id: certificateId },
      update: { feasible: true, negotiationId },
      create: { id: certificateId, negotiationId, networkVersion: 1, solver: "GridNexus AC Validator", solverVersion: "1.0.0", feasible: true, violations: [], maxLineLoadingPct: 48 + index, minVoltagePu: 0.982, maxVoltagePu: 1.018, powerBalanceError: 0.0001, inputHash: `seed-input-${index}`, resultHash: `seed-result-${index}` },
    });
    const deliveryStart = new Date(Date.now() - index * 45 * 60_000);
    await commitSettlement({
      idempotencyKey: `seed-settlement-${pad(index + 1, 2)}`,
      negotiationId,
      sellerMicrogridId: seller.microgridId,
      buyerMicrogridId: buyer.microgridId,
      energyKwh,
      pricePerKwh,
      deliveryStart,
      deliveryEnd: new Date(deliveryStart.getTime() + 60 * 60_000),
      stabilityCheckId: stabilityId,
      gridCertificateId: certificateId,
      actorId: "operational-seed",
      energyTransferData: { amount: energyKwh, price: pricePerKwh, startTime: deliveryStart, intervalMinutes: 60, averagePowerKw: energyKwh, stabilitycheckid: stabilityId, gridcertificateid: certificateId },
      negotiationRoundData: { roundNumber: 1, activeAgentId: seller.id, opponentAgentId: buyer.id, action: "ACCEPT", surplus: energyKwh * (0.13 - pricePerKwh), decisionSource: "SEEDED_REPLAY" },
      rlRewardData: { agentId: seller.id, rewardValue: energyKwh * (0.13 - pricePerKwh) },
    });
  }
}

async function main(): Promise<void> {
  console.log(`Seeding GridNexus operational topology with ${AGENT_COUNT} agents...`);
  await seedUsers();
  const buses = await seedTopology();
  await seedMicrogrids(buses);
  await seedOperations();
  console.log("Operational seed complete: 25 buses, 40 lines, microgrids, users, Oracle signal, and settled trades.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
