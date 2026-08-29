/**
 * scripts/simulate_negotiation.js
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Simulates an interactive multi-round Rubinstein bargaining negotiation
 * between two microgrid agents (e.g. Solar Array Alpha and Wind Farm Beta).
 *
 * Connects to the GridNexus Broker WebSocket (/negotiate namespace),
 * starts a session, logs each alternating round, and waits for stability verification & trade settlement.
 *
 * Usage:
 *   node scripts/simulate_negotiation.js
 */

import { io } from "socket.io-client";

const BROKER_URL = process.env.BROKER_URL || "http://localhost:3000";

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("⚡ GridNexus Live Negotiation Simulator");
console.log(`Connecting to Broker at ${BROKER_URL}/negotiate ...`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

const socket = io(`${BROKER_URL}/negotiate`, {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log(`[WS] Connected with Socket ID: ${socket.id}`);
  console.log("Initiating bargaining session between Microgrid-1 (Solar) and Microgrid-2 (Wind)...");

  // Start negotiation between 2 agents with an initial surplus of 300.0 kWh
  socket.emit("start_negotiation", {
    agentId1: "mg-1",
    agentId2: "mg-2",
    initialSurplus: 300.0,
  });
});

socket.on("status", (data) => {
  console.log(`📌 Status: ${data.message} (ID: ${data.negotiationId})`);
});

socket.on("round_update", (data) => {
  const price = data.counter_offer_price ? `$${data.counter_offer_price.toFixed(3)}/kWh` : "Pending offer";
  const energy = data.counter_requested_kwh ? `${data.counter_requested_kwh.toFixed(1)} kWh` : "";
  console.log(
    `🔄 Round ${data.round}: Agent ${data.activeAgent} -> Action: [${data.action}] ` +
    `| Surplus: ${data.discountedSurplus?.toFixed(2)} kWh | Offer: ${price} ${energy} (${data.decision_source})`
  );
});

socket.on("stability_checked", (data) => {
  console.log(`⚖️  Stability Gate: ${data.isStable ? "✅ APPROVED (Core-Stable)" : "❌ REJECTED"} | Margin: ${data.margin?.toFixed(2)}`);
});

socket.on("negotiation_complete", (data) => {
  console.log(`\n🏁 Negotiation FINISHED: Status [${data.status}] in ${data.finalRound} rounds!`);
  console.log("👉 Check Command Center (http://localhost:5173) to see the updated Trade Log and Topology line flows!");
  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 1000);
});

socket.on("belief_update_pending", (data) => {
  console.log(`\n⏳ Agent ${data.agentId} is currently updating beliefs from Oracle signal. Retrying shortly...`);
  setTimeout(() => {
    socket.emit("start_negotiation", {
      agentId1: "mg-1",
      agentId2: "mg-2",
      initialSurplus: 300.0,
    });
  }, 2000);
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log("\nSimulation complete.");
  socket.disconnect();
  process.exit(0);
}, 15000);
