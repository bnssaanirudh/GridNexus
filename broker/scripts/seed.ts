import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding canonical physical network topology...");

  // 1. Create Topology Revision
  const revision = await prisma.topologyRevision.create({
    data: { notes: "Initial Bootstrap Topology" },
  });
  console.log(`Created TopologyRevision: v${revision.version}`);

  // 2. Create Buses
  const busA = await prisma.bus.create({
    data: { externalCode: "BUS-A", voltageLevelKv: 12.4, latitude: 37.7749, longitude: -122.4194 },
  });
  const busB = await prisma.bus.create({
    data: { externalCode: "BUS-B", voltageLevelKv: 12.4, latitude: 37.7849, longitude: -122.4094 },
  });
  const busC = await prisma.bus.create({
    data: { externalCode: "BUS-C", voltageLevelKv: 12.4, latitude: 37.7649, longitude: -122.4294 },
  });

  // 3. Create Lines (Edges)
  await prisma.line.create({
    data: {
      fromBusId: busA.id,
      toBusId: busB.id,
      resistance: 0.05,
      reactance: 0.1,
      thermalLimitKw: 2000,
    },
  });
  await prisma.line.create({
    data: {
      fromBusId: busB.id,
      toBusId: busC.id,
      resistance: 0.04,
      reactance: 0.08,
      thermalLimitKw: 1500,
    },
  });
  await prisma.line.create({
    data: {
      fromBusId: busC.id,
      toBusId: busA.id,
      resistance: 0.06,
      reactance: 0.12,
      thermalLimitKw: 1800,
    },
  });

  // 4. Create Microgrids
  const mg1 = await prisma.microgrid.create({
    data: {
      name: "Solar Array Alpha",
      type: "solar",
      externalCode: "MG-ALPHA",
      latitude: 37.7749,
      longitude: -122.4194,
      hiddenbatterycapacity: "enc_0",
      hiddengenerationcost: "enc_1",
      ders: {
        create: [
          { type: "SOLAR", ratedPowerKw: 500, minPowerKw: 0, maxPowerKw: 500, efficiency: 0.98 },
        ],
      },
      busMappings: {
        create: [{ busId: busA.id, phase: "A" }],
      },
      agents: {
        create: [{ type: "Q-Learning", qre_lambda: 0.5 }],
      },
    },
  });

  const mg2 = await prisma.microgrid.create({
    data: {
      name: "Wind Farm Beta",
      type: "wind",
      externalCode: "MG-BETA",
      latitude: 37.7849,
      longitude: -122.4094,
      hiddenbatterycapacity: "enc_0",
      hiddengenerationcost: "enc_2",
      ders: {
        create: [
          { type: "WIND", ratedPowerKw: 350, minPowerKw: 0, maxPowerKw: 350, efficiency: 0.95 },
        ],
      },
      busMappings: {
        create: [{ busId: busB.id, phase: "B" }],
      },
      agents: {
        create: [{ type: "PPO", qre_lambda: 0.8 }],
      },
    },
  });

  console.log(`Seeded microgrids: ${mg1.id}, ${mg2.id}`);
  console.log("Database seeded successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
