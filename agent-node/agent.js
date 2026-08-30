import { io } from "socket.io-client";
import { Ollama } from "ollama";

const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });
const MODEL = "qwen2.5:0.5b";

export class Agent {
  constructor(id, brokerUrl) {
    this.id = id;
    this.socket = io(`${brokerUrl}/negotiate`, {
      query: { agentId: this.id }
    });

    this.socket.on("connect", () => {
      // Register this socket with the broker
      this.socket.emit("register_agent", { agentId: this.id });
    });

    this.socket.on("your_turn", async (data) => {
      const decision = await this.makeDecision(data);
      this.socket.emit("agent_action", {
        negotiationId: data.negotiationId,
        agentId: this.id,
        action: decision.action,
        counter_offer_price: decision.price,
        counter_requested_kwh: decision.kwh,
      });
    });
  }

  async makeDecision(context) {
    try {
      const prompt = `You are an energy trading agent in a microgrid. You must reply in JSON format only: {"action": "ACCEPT"|"COUNTER_OFFER"|"WALK_AWAY", "price": float, "kwh": float}.
The current surplus is ${context.surplus} kWh. The opponent offered $${context.offerPrice} for ${context.requestedKwh} kWh.
What is your move? Reply only with JSON.`;

      const response = await ollama.chat({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
        options: { temperature: 0.1 }
      });

      return JSON.parse(response.message.content);
    } catch (err) {
      console.error(`Agent ${this.id} fallback used due to LLM error:`, err.message);
      // Fallback behavior
      return {
        action: "COUNTER_OFFER",
        price: context.offerPrice ? context.offerPrice + 0.5 : 5.0,
        kwh: context.requestedKwh || context.surplus / 2
      };
    }
  }

  disconnect() {
    this.socket.disconnect();
  }
}
