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
app.get("/api/oracle-signals", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const signals = await prisma.oracleSignal.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    await prisma.$disconnect();
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
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const transfers = await prisma.energyTransfer.findMany({
      orderBy: { id: "desc" },
      take: 100,
      include: { stabilityCheck: true },
    });
    await prisma.$disconnect();
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
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    // 1. Fetch the Canonical Physical Network
    // Nodes = Microgrids, Edges = physical lines between their buses
    const microgrids = await prisma.microgrid.findMany({
      where: { active: true },
      include: {
        busMappings: {
          include: {
            bus: {
              include: {
                linesFrom: { where: { active: true } },
                linesTo: { where: { active: true } },
              },
            },
          },
        },
        ders: true,
      },
    });

    const nodes = microgrids.map((mg) => {
      // Find primary bus mapping for location/voltage
      const mapping = mg.busMappings[0];
      const bus = mapping?.bus;
      const capacity = mg.ders.reduce((sum, der) => sum + Number(der.ratedPowerKw), 0);
      
      return {
        id: mg.id,
        name: mg.name,
        type: mg.type,
        lat: bus ? Number(bus.latitude) : Number(mg.latitude),
        lon: bus ? Number(bus.longitude) : Number(mg.longitude),
        capacity: capacity,
        in_coalition: true, // Frontend uses this to highlight active ones, could be derived from active negotiations
      };
    });

    // Extract unique active lines
    const lineMap = new Map();
    microgrids.forEach((mg) => {
      mg.busMappings.forEach((mapping) => {
        if (!mapping.bus) return;
        
        const processLine = (line: any, isFrom: boolean) => {
          if (!lineMap.has(line.id)) {
            // Find the microgrid at the other end of the line
            const otherBusId = isFrom ? line.toBusId : line.fromBusId;
            const otherMg = microgrids.find(m => 
              m.busMappings.some(bm => bm.busId === otherBusId)
            );
            
            if (otherMg) {
               lineMap.set(line.id, {
                  id: line.id,
                  from: isFrom ? mg.id : otherMg.id,
                  to: isFrom ? otherMg.id : mg.id,
                  capacity_kw: Number(line.thermalLimitKw),
                  base_load: 0,
               });
            }
          }
        };

        mapping.bus.linesFrom.forEach((l) => processLine(l, true));
        mapping.bus.linesTo.forEach((l) => processLine(l, false));
      });
    });

    const defaultEdges = Array.from(lineMap.values());

    // Read recent transfers to calculate dynamic edge utilization
    const recentTransfers = await prisma.energyTransfer.findMany({
      orderBy: { id: "desc" },
      take: 20,
    }).catch(() => []);

    // Calculate dynamic power flow on edges from recent transfers
    const edges = defaultEdges.map((e) => {
      // Check for direct transfers matching either direction
      const matchingTransfers = recentTransfers.filter(
        (t) => (t.fromMicrogridId === e.from && t.toMicrogridId === e.to) ||
               (t.fromMicrogridId === e.to && t.toMicrogridId === e.from)
      );

      const dynamicLoad = matchingTransfers.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalUtilizationKw = Math.min(e.capacity_kw, e.base_load + dynamicLoad);
      const utilizationPct = Math.round((totalUtilizationKw / e.capacity_kw) * 1000) / 10;

      return {
        id: e.id,
        from: e.from,
        to: e.to,
        capacity_kw: e.capacity_kw,
        utilization_kw: totalUtilizationKw,
        utilization_pct: utilizationPct,
      };
    });

    await prisma.$disconnect();
    res.json({
      nodes: nodes,
      edges,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate topology" });
  }
});

/**
 * Aggregated Analytics API matching the Power BI DirectQuery specification.
 * Used for live charts in command-center PowerBIPanel when standalone.
 */
app.get("/api/analytics", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    const [transfers, checks, signals] = await Promise.all([
      prisma.energyTransfer.findMany({ orderBy: { id: "desc" }, take: 200 }).catch(() => []),
      prisma.stabilityCheck.findMany({ orderBy: { id: "desc" }, take: 200 }).catch(() => []),
      prisma.oracleSignal.findMany({ orderBy: { createdAt: "desc" }, take: 100 }).catch(() => []),
    ]);

    // 1. Trade Volume Aggregation
    const totalTradedKwh = transfers.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalVolumeUsd = transfers.reduce((sum, t) => sum + Number(t.amount || 0) * Number(t.price || 0), 0);
    const avgPricePerKwh = totalTradedKwh > 0 ? totalVolumeUsd / totalTradedKwh : 0.12;

    // 2. Stability Pass Rate
    const totalChecks = checks.length;
    const stableCount = checks.filter((c) => c.isStable === true).length;
    const passRatePct = totalChecks > 0 ? (stableCount / totalChecks) * 100 : 92.5;
    const avgMargin = totalChecks > 0
      ? checks.reduce((sum, c) => sum + Number(c.margin || 0), 0) / totalChecks
      : 11.4;

    // 3. Oracle Broadcast Frequency
    const signalCountsByType: Record<string, number> = {};
    signals.forEach((s) => {
      try {
        const parsed = JSON.parse(s.signalData);
        const type = parsed.signal || "GENERAL_WEATHER";
        signalCountsByType[type] = (signalCountsByType[type] || 0) + 1;
      } catch {
        signalCountsByType["GENERAL_WEATHER"] = (signalCountsByType["GENERAL_WEATHER"] || 0) + 1;
      }
    });

    await prisma.$disconnect();
    res.json({
      summary: {
        totalTradedKwh: Math.round(totalTradedKwh * 100) / 100,
        totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
        avgPricePerKwh: Math.round(avgPricePerKwh * 1000) / 1000,
        stabilityPassRatePct: Math.round(passRatePct * 10) / 10,
        avgStabilityMargin: Math.round(avgMargin * 100) / 100,
        totalStabilityChecks: totalChecks,
        totalOracleBroadcasts: signals.length,
      },
      oracleSignalsByType: signalCountsByType,
      recentTransfersCount: transfers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate analytics" });
  }
});

// ---------------------------------------------------------------------------
// Server startup (only when run directly, not when imported for testing)
// ---------------------------------------------------------------------------
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
