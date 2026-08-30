import { Server } from "socket.io";
import { createServer } from "http";

const server = createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const namespace = io.of("/negotiate");

namespace.on("connection", (socket) => {
  console.log("UI Connected to mock simulation feed.");
  
  let round = 1;
  const numAgents = 1000;
  
  // Simulate 10 concurrent negotiations happening per second
  setInterval(() => {
    for (let i = 0; i < 10; i++) {
      const negotiationId = `neg_${Math.floor(Math.random() * 100000)}`;
      const seller = `agent_${Math.floor(Math.random() * numAgents)}`;
      const buyer = `agent_${Math.floor(Math.random() * numAgents)}`;
      
      // Emit Start
      namespace.emit("negotiation_start", {
        negotiationId,
        actorId: seller,
        payload: { message: "Starting negotiation for 50kWh" },
        timestamp: new Date().toISOString()
      });

      // Emit Round Updates
      setTimeout(() => {
        namespace.emit("round_update", {
          negotiationId,
          actorId: buyer,
          payload: { offer: 0.12, message: "Counter-offer: $0.12/kWh" },
          timestamp: new Date().toISOString()
        });
      }, 500);

      // Emit Belief Updates
      setTimeout(() => {
        namespace.emit("belief_update", {
          negotiationId,
          actorId: seller,
          payload: { new_belief: "Buyer seems price-sensitive.", confidence: 0.8 },
          timestamp: new Date().toISOString()
        });
      }, 1000);

      // Emit End
      setTimeout(() => {
        namespace.emit("negotiation_end", {
          negotiationId,
          actorId: "System",
          payload: { status: "ACCEPTED", finalPrice: 0.12, volume: 50 },
          timestamp: new Date().toISOString()
        });
      }, 1500);
    }
    console.log(`Simulated round ${round} with 10 concurrent negotiations...`);
    round++;
  }, 2000);
});

server.listen(3000, () => {
  console.log("Mock Negotiation Broker listening on port 3000...");
  console.log("Streaming simulated events to the Command Center UI.");
});
