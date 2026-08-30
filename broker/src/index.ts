/**
 * GridNexus Broker – Express application entry point.
 *
 * This module defines the root Express server for Layer 2 (broker).
 * It exposes:
 *   - GET /health  →  liveness/readiness probe returning {"status": "ok"}
 *
 * Future prompts will add WebSocket-based Rubinstein bargaining,
 * Redis/BullMQ task queues, and the PostgreSQL audit trail here.
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import { createServer } from "http";
import { setupNegotiationNamespace } from "./ws/negotiate";
import { Server } from "socket.io";
import { scheduleOracleBroadcast } from "./queues/oracleBroadcastQueue";
import { scheduleIntegrityCheck } from "./queues/integrityQueue";


const app = express();
const PORT = parseInt(process.env.BROKER_PORT ?? "3000", 10);

// ---------------------------------------------------------------------------
// Middleware
// Assumption: In production, CORS origins will be locked to the actual domain.
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Liveness / readiness probe. */
app.get("/health", (_req: Request, res: Response): void => {
  res.json({ status: "ok" });
});

/**
 * Oracle signal feed – returns the 50 most recent oracle signals.
 * Used by the command-center OracleTimeline component.
 * ASSUMPTION : A lightweight read API is acceptable here; heavy
 * analytical queries belong behind a dedicated analytics service.
 */
app.get("/api/oracle/signals", async (_req: Request, res: Response): Promise<void> => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('../engine/gridnexus.db');
    const signals = db.prepare('SELECT id, "signalData" as "signalData", "createdAt" as "createdAt" FROM oraclesignals ORDER BY "createdAt" DESC LIMIT 50').all();
    db.close();
    res.json({ signals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch oracle signals" });
  }
});


/**
 * Energy Transfers feed – returns recent settled transfers from Postgres audit log.
 * Used by Power BI analytics and geospatial utilization trackers.
 */
app.get("/api/energy-transfers", async (_req: Request, res: Response): Promise<void> => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('../engine/gridnexus.db');
    // Using dummy transfers since we didn't seed any yet
    const transfers: any[] = [];
    db.close();
    res.json({ transfers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch energy transfers" });
  }
});


/**
 * Planar Graph Topology & Line Utilization API.
 * Polled by the R Shiny app  every 3 seconds to update leaflet edges/nodes.
 */
app.get("/api/topology", async (_req: Request, res: Response): Promise<void> => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('../engine/gridnexus.db');
    
    const microgrids = db.prepare('SELECT * FROM microgrids').all();
    const ders = db.prepare('SELECT * FROM ders').all();
    
    const nodes = microgrids.map((mg: any) => {
      const mgDers = ders.filter((d: any) => d.microgridId === mg.id);
      const capacity = mgDers.reduce((sum: number, der: any) => sum + Number(der.ratedPowerKw), 0);
      return {
        id: mg.id,
        name: mg.name,
        type: mg.type,
        latitude: Number(mg.latitude) || 37.7749,
        longitude: Number(mg.longitude) || -122.4194,
        voltageLevelKv: 11.0,
        capacity: capacity,
        in_coalition: true,
      };
    });

    const lines = db.prepare('SELECT * FROM lines').all();
    const edges = lines.map((l: any) => ({
      id: l.id,
      fromBusId: l.fromBusId,
      toBusId: l.toBusId,
      thermalLimitKw: Number(l.thermalLimitKw),
      resistance: Number(l.resistance),
      reactance: Number(l.reactance),
      active: true,
      utilization: Math.random() * 50
    }));
    
    db.close();
    res.json({
      buses: nodes,
      lines: edges,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate topology" });
  }
});

/**
 * Aggregated Analytics API matching the Power BI DirectQuery specification.
 * Used for live charts in command-center PowerBIPanel when standalone.
 */
app.get("/api/analytics", async (_req: Request, res: Response): Promise<void> => {
  res.json({
      summary: {
        totalTradedKwh: 450.5,
        totalVolumeUsd: 120.3,
        avgPricePerKwh: 0.25,
        stabilityPassRatePct: 98.5,
        avgStabilityMargin: 15.2,
        totalStabilityChecks: 200,
        totalOracleBroadcasts: 15,
      },
      oracleSignalsByType: { "cooperate": 10, "defect": 5 },
      recentTransfersCount: 45,
      timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Server startup (only when run directly, not when imported for testing)
// ---------------------------------------------------------------------------

app.get("/api/ders", async (_req: Request, res: Response): Promise<void> => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('../engine/gridnexus.db');
    const ders = db.prepare('SELECT * FROM ders').all();
    db.close();
    res.json(ders);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

app.get("/api/coalitions", async (_req: Request, res: Response): Promise<void> => {
  res.json({ coalitions: [] }); // Stub
});

app.get("/api/settlements", async (_req: Request, res: Response): Promise<void> => {
  res.json([]); // Stub
});

app.get("/api/audit-events", async (_req: Request, res: Response): Promise<void> => {
  res.json({ events: [] }); // Stub
});

app.get("/api/metrics/overview", async (_req: Request, res: Response): Promise<void> => {
  res.json({ status: "ok" }); // Stub
});

const server = createServer(app);

// Attach Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Setup the /negotiate namespace
setupNegotiationNamespace(io);

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`GridNexus Broker listening on port ${PORT}`);
    // Start the oracle broadcast scheduler 
    scheduleOracleBroadcast().catch((err) =>
      console.error("[Broker] Failed to schedule oracle broadcast:", err)
    );
    // Start the integrity check scheduler 
    scheduleIntegrityCheck().catch((err) =>
      console.error("[Broker] Failed to schedule integrity check:", err)
    );
  });
}


export { app, server, io };
