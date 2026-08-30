import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding canonical physical network topology with 1000 Agents...");

  // 1. Create Topology Revision
  const revision = await prisma.topologyRevision.create({
    data: { notes: "1000 Agent Swarm Topology" },
  });
  console.log(`Created TopologyRevision: v${revision.version}`);

  // 2. Create a central distribution Bus
  const centralBus = await prisma.bus.create({
    data: { externalCode: "BUS-CENTRAL", voltageLevelKv: 12.4, latitude: 37.7749, longitude: -122.4194 },
  });

  // 3. Create 1000 Microgrids
  console.log("Generating 1000 microgrids...");
  const NUM_AGENTS = 1000;
  
  // We'll create them sequentially to avoid overwhelming the connection pool
  for (let i = 0; i < NUM_AGENTS; i++) {
    const isSolar = i % 2 === 0;
    await prisma.microgrid.create({
      data: {
        name: `Agent Microgrid ${i}`,
        type: isSolar ? "solar" : "wind",
        externalCode: `MG-${i}`,
        latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
        longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
        hiddenbatterycapacity: "enc_0",
        hiddengenerationcost: "enc_1",
        ders: {
          create: [
            { 
              type: isSolar ? "SOLAR" : "WIND", 
              ratedPowerKw: 100 + Math.random() * 400, 
              minPowerKw: 0, 
              maxPowerKw: 500, 
              efficiency: 0.95 
            },
          ],
        },
        busMappings: {
          create: [{ busId: centralBus.id, phase: ["A", "B", "C"][i % 3] }],
        },
        agents: {
          // Explicitly giving them IDs like agent_0 for easier matching
          create: [{ 
            id: `agent_${i}`,
            type: "Qwen-LLM", 
            qre_lambda: 0.5 
          }],
        },
      },
    });
    
    if ((i + 1) % 100 === 0) {
      console.log(`...Created ${i + 1} / ${NUM_AGENTS} agents`);
    }
  }

  console.log("Database seeded successfully with 1000 agents.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
