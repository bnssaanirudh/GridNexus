import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding canonical physical network topology with 5 reference Agents...");

  // Defensive check: ensure DB is clean of these specific MGs to avoid unique constraint errors if re-run
  await prisma.microgrid.deleteMany({
    where: { externalCode: { in: ["mg-1", "mg-2", "mg-3", "mg-4", "mg-5"] } }
  });
  await prisma.bus.deleteMany({
    where: { externalCode: { in: ["BUS-1", "BUS-2", "BUS-3", "BUS-4", "BUS-5"] } }
  });

  // 1. Create Topology Revision
  const revision = await prisma.topologyRevision.create({
    data: { notes: "Standard Reference 5-Agent Topology" },
  });
  console.log(`Created TopologyRevision: v${revision.version}`);

  // 2. Create 5 Buses
  const buses = [];
  for (let i = 1; i <= 5; i++) {
    buses.push(
      await prisma.bus.create({
        data: {
          id: `bus-${i}`,
          externalCode: `BUS-${i}`,
          voltageLevelKv: 12.4,
          latitude: 37.7749 + i * 0.01,
          longitude: -122.4194 + i * 0.01,
        },
      })
    );
  }

  // 3. Create Lines between Buses (Line topology: 1-2-3-4-5)
  for (let i = 0; i < 4; i++) {
    await prisma.line.create({
      data: {
        fromBusId: buses[i].id,
        toBusId: buses[i + 1].id,
        resistance: 0.01,
        reactance: 0.02,
        thermalLimitKw: 5000,
        active: true,
      },
    });
  }

  // 4. Create 5 standard Microgrids (mg-1 to mg-5)
  console.log("Generating standard reference microgrids mg-1 to mg-5...");
  
  for (let i = 1; i <= 5; i++) {
    const isSolar = i % 2 !== 0; // 1, 3, 5 are Solar, 2, 4 are Wind
    await prisma.microgrid.create({
      data: {
        id: `mg-${i}`,
        name: `Reference Microgrid ${i}`,
        type: isSolar ? "SOLAR" : "WIND", // Proper enum-like uppercase string
        externalCode: `mg-${i}`,
        latitude: 37.7749 + i * 0.01,
        longitude: -122.4194 + i * 0.01,
        hiddenbatterycapacity: "enc_capacity",
        hiddengenerationcost: "enc_cost",
        ders: {
          create: [
            { 
              type: isSolar ? "SOLAR" : "WIND", 
              ratedPowerKw: 100 + i * 50, 
              minPowerKw: 0, 
              maxPowerKw: 500, 
              efficiency: 0.95 
            },
          ],
        },
        busMappings: {
          create: [{ busId: buses[i - 1].id, phase: "A" }],
        },
        agents: {
          create: [{ 
            id: `agent_${i}`,
            type: "Qwen-LLM", 
            qre_lambda: 0.5 
          }],
        },
      },
    });
  }

  console.log("Database seeded successfully with 5 reference agents.");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
