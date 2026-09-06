import { io } from "socket.io-client";

// Deterministic Negotiation Simulator
// This script simulates two agents connecting via WebSocket to the GridNexus broker
// and deterministically negotiating an energy trade without relying on an LLM.
// It is intended for demonstrations and end-to-end testing of the negotiation loop.

const BROKER_URL = process.env.BROKER_URL || "http://localhost:3000/negotiate";

class DeterministicAgent {
  public id: string;
  private socket: any;
  private strategy: any;
  private currentPrice: number;

  constructor(id: string, startPrice: number, strategy: "buyer" | "seller") {
    this.id = id;
    this.strategy = strategy;
    this.currentPrice = startPrice;
    this.socket = io(BROKER_URL, { query: { agentId: this.id } });

    this.socket.on("connect", () => {
      console.log(`[${this.id}] Connected to broker`);
    });

    this.socket.on("disconnect", () => {
      console.log(`[${this.id}] Disconnected`);
    });

    this.socket.on("error", (err: any) => {
      console.error(`[${this.id}] Error:`, err);
    });

    this.socket.on("your_turn", (data: any) => {
      console.log(`[${this.id}] Turn received. Current round: ${data.round}, Surplus: ${data.surplus}`);
      
      const { negotiationId, opponentOffer } = data;
      const kwh = 50.0; // Fixed volume for this demo
      
      let action = "COUNTER_OFFER";
      let price = this.currentPrice;

      if (opponentOffer) {
        console.log(`[${this.id}] Opponent offered $${opponentOffer.price} for ${opponentOffer.kwh} kWh.`);
        
        if (this.strategy === "buyer") {
          // Buyer increases price by $1 each turn
          if (opponentOffer.price <= this.currentPrice) {
            action = "ACCEPT";
          } else {
            this.currentPrice += 1.0;
            price = this.currentPrice;
          }
        } else {
          // Seller decreases price by $1 each turn
          if (opponentOffer.price >= this.currentPrice) {
            action = "ACCEPT";
          } else {
            this.currentPrice -= 1.0;
            price = this.currentPrice;
          }
        }
      }

      console.log(`[${this.id}] Decided action: ${action} at $${price}`);
      
      this.socket.emit("agent_action", {
        negotiationId,
        action,
        counter_offer_price: price,
        counter_requested_kwh: kwh,
        decision_source: "DETERMINISTIC_SIMULATOR"
      });
    });

    this.socket.on("round_update", (data: any) => {
      console.log(`[System] Round Update: Agent ${data.activeAgent} chose ${data.action}`);
    });

    this.socket.on("negotiation_complete", (data: any) => {
      console.log(`[System] Negotiation Complete: Status ${data.status}`);
      if (data.status === "ACCEPTED") {
        console.log(`[System] Trade finalized! Checking stability gate...`);
      } else {
        process.exit(0);
      }
    });

    this.socket.on("stability_rejected", (data: any) => {
      console.log(`[System] Stability Gate Rejected trade! Margin: ${data.margin}`);
      process.exit(1);
    });

    this.socket.on("belief_update_pending", (data: any) => {
      console.log(`[System] Negotiation deferred because agents are updating beliefs: ${data.agents.join(", ")}`);
    });

    this.socket.on("status", (data: any) => {
      console.log(`[System] Status: ${data.message}`);
    });
  }

  startNegotiation(opponentId: string, initialSurplus: number) {
    console.log(`[${this.id}] Initiating negotiation with ${opponentId}...`);
    this.socket.emit("start_negotiation", {
      agentIds: [this.id, opponentId],
      initialSurplus
    });
  }
}

async function runDemo() {
  console.log("Starting Deterministic Negotiation Demo...");
  
  // Buyer starts low ($2), Seller starts high ($10)
  const agentBuyer = new DeterministicAgent("demo-buyer-1", 2.0, "buyer");
  const agentSeller = new DeterministicAgent("demo-seller-1", 10.0, "seller");

  // Wait a moment for connections to establish
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Start the negotiation
  agentBuyer.startNegotiation(agentSeller.id, 100.0);
}

runDemo();
