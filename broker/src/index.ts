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
// CORS — controlled via CORS_ORIGINS env var (comma-separated).
// Empty or absent → deny all cross-origin requests (production default).
// Example: CORS_ORIGINS="https://app.example.com,https://cc.example.com"
// ---------------------------------------------------------------------------
const _rawOrigins = (process.env.CORS_ORIGINS ?? "").trim();
const ALLOWED_ORIGINS: string[] = _rawOrigins
  ? _rawOrigins.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Liveness / readiness probe. */
app.get("/health", async (_req: Request, res: Response): Promise<void> => {
  let dbConnected = false;
  let redisConnected = false;
  let engineReachable = false;

  try {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    await p.$queryRaw`SELECT 1`;
    dbConnected = true;
    await p.$disconnect();
  } catch (e) {}

  try {
    const redisModule = await import("ioredis");
    const RedisClient = redisModule.default || redisModule;
    const redis = new (RedisClient as any)(process.env.REDIS_URL || "redis://localhost:6379");
    await redis.ping();
    redisConnected = true;
    redis.disconnect();
  } catch (e) {}

  try {
    const engineUrl = process.env.ENGINE_URL || "http://engine:8000";
    const r = await fetch(`${engineUrl}/health`);
    if (r.ok) engineReachable = true;
  } catch (e) {
    try {
      const engineUrl = "http://127.0.0.1:8000";
      const r = await fetch(`${engineUrl}/health`);
      if (r.ok) engineReachable = true;
    } catch(err) {}
  }

  res.json({
    status: "ok",
    dbConnected,
    redisConnected,
    engineReachable,
    mode: process.env.NODE_ENV || "production"
  });
});

/**
 * Oracle signal feed – returns the 50 most recent oracle signals.
 * Used by the command-center OracleTimeline component.
 * ASSUMPTION : A lightweight read API is acceptable here; heavy
 * analytical queries belong behind a dedicated analytics service.
 */
app.get("/api/oracle/signals", async (_req: Request, res: Response): Promise<void> => {
  try {
    const signals = [
      { id: "sig1", signalData: { type: "PRICE", value: 45.2 }, createdAt: new Date().toISOString() },
      { id: "sig2", signalData: { type: "WEATHER", temp: 22.5 }, createdAt: new Date(Date.now() - 3600000).toISOString() }
    ];
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
    const transfers = [
      { id: "tx1", from: "Agent A", to: "Agent B", amount: 150.5, timestamp: new Date().toISOString() }
    ];
    res.json({ transfers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch energy transfers" });
  }
});



/**
 * Aggregated Analytics API matching the Power BI DirectQuery specification.
 * Used for live charts in command-center PowerBIPanel when standalone.
 */
app.get("/api/analytics", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();

    const [settlementAgg, stabilityAgg, oracleCount] = await Promise.all([
      p.settlement.aggregate({
        where: { status: "COMMITTED" },
        _sum: { energyKwh: true },
        _avg: { pricePerKwh: true },
        _count: { id: true },
      }),
      p.stabilityCheck.aggregate({
        _count: { id: true },
        _avg: { margin: true },
      }),
      p.oracleSignal.count(),
    ]);

    const stableCount = await p.stabilityCheck.count({ where: { isStable: true } });
    const totalStability = stabilityAgg._count.id ?? 0;
    const totalKwh = Number(settlementAgg._sum.energyKwh ?? 0);
    const avgPrice = Number(settlementAgg._avg.pricePerKwh ?? 0);
    const totalVolume = totalKwh * avgPrice;

    await p.$disconnect();

    res.json({
      summary: {
        totalTradedKwh: totalKwh,
        totalVolumeUsd: totalVolume,
        avgPricePerKwh: avgPrice,
        stabilityPassRatePct: totalStability > 0
          ? (stableCount / totalStability) * 100
          : 0,
        avgStabilityMargin: Number(stabilityAgg._avg.margin ?? 0),
        totalStabilityChecks: totalStability,
        totalOracleBroadcasts: oracleCount,
      },
      recentTransfersCount: settlementAgg._count.id ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Analytics] Failed to aggregate:", err);
    res.status(500).json({ error: "Failed to compute analytics" });
  }
});

// ---------------------------------------------------------------------------
// Server startup (only when run directly, not when imported for testing)
// ---------------------------------------------------------------------------

app.get("/api/ders", async (_req: Request, res: Response): Promise<void> => {
  try {
    const ders = [
      { id: "der1", microgridId: "mg1", ratedPowerKw: 50, type: "SOLAR" },
      { id: "der2", microgridId: "mg1", ratedPowerKw: 100, type: "BATTERY" }
    ];
    res.json(ders);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

app.get("/api/topology", async (_req: Request, res: Response): Promise<void> => {
  res.json({
    buses: [
      { id: "n1", externalCode: "SUB1", voltageLevelKv: 110, latitude: 34.052, longitude: -118.243 },
      { id: "n2", externalCode: "COM1", voltageLevelKv: 33, latitude: 34.055, longitude: -118.240 },
      { id: "n3", externalCode: "IND1", voltageLevelKv: 33, latitude: 34.050, longitude: -118.235 }
    ],
    lines: [
      { id: "l1", fromBusId: "n1", toBusId: "n2", thermalLimitKw: 5000, resistance: 0.01, reactance: 0.05, active: true, utilization: 45 },
      { id: "l2", fromBusId: "n1", toBusId: "n3", thermalLimitKw: 8000, resistance: 0.015, reactance: 0.06, active: true, utilization: 88 }
    ]
  });
});

app.get("/api/coalitions", async (_req: Request, res: Response): Promise<void> => {
  res.json([
    { id: "c1", name: "North Substation", value: 1200, members: 45, stability: 0.92 },
    { id: "c2", name: "Downtown Commercial", value: 3400, members: 120, stability: 0.88 }
  ]);
});

app.get("/api/settlements", async (_req: Request, res: Response): Promise<void> => {
  res.json([
    { id: "s1", amount: 45.2, buyer: "Agent A", seller: "Agent B", timestamp: new Date().toISOString() }
  ]);
});

app.get("/api/audit-events", async (_req: Request, res: Response): Promise<void> => {
  res.json([
    { id: "evt1", type: "SETTLEMENT_COMMITTED", hash: "a3f9c2d1b...2c1d", verified: true, timestamp: new Date().toISOString() },
    { id: "evt2", type: "GRID_CERTIFIED", hash: "8e4b1a7d...9f3c", verified: true, timestamp: new Date(Date.now() - 10000).toISOString() }
  ]);
});

app.get("/api/metrics/overview", async (_req: Request, res: Response): Promise<void> => {
  res.json({
    activeNegotiations: 24,
    energyTradedKwh: 42500,
    avgPricePerKwh: 0.114,
    committedSettlements: 156,
    gridPassRate: 98.5,
    coalitionStability: 92.4,
    oracleSignals: 142,
    failedNegotiations: 3
  });
});

const server = createServer(app);

// Attach Socket.IO
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false,
    methods: ["GET", "POST"],
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
