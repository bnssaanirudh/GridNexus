import { Agent } from "./agent.js";

const BROKER_URL = process.env.BROKER_URL || "http://localhost:3000";
const NUM_AGENTS = 1000;

console.log(`Starting swarm of ${NUM_AGENTS} agents connecting to ${BROKER_URL}...`);

const agents = [];

for (let i = 0; i < NUM_AGENTS; i++) {
  const agentId = `agent_${i}`;
  const agent = new Agent(agentId, BROKER_URL);
  agents.push(agent);
}

console.log(`Successfully spawned ${NUM_AGENTS} independent agent instances.`);

// Handle shutdown
process.on('SIGINT', () => {
  console.log("Shutting down swarm...");
  agents.forEach(a => a.disconnect());
  process.exit(0);
});
