import { Router, type Response } from "express";
import Redis from "ioredis";
import { prisma } from "../db/prisma.js";
import { getGridNexusMode } from "../config.js";

interface DependencyHealth {
  dbConnected: boolean;
  redisConnected: boolean;
  engineReachable: boolean;
}

async function checkDependencies(): Promise<DependencyHealth> {
  const database = prisma.$queryRawUnsafe("SELECT 1")
    .then(() => true)
    .catch(() => false);

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/0", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    enableOfflineQueue: false,
  });
  const redisCheck = redis.connect()
    .then(() => redis.ping())
    .then(() => true)
    .catch(() => false)
    .finally(() => redis.disconnect());

  const engineUrl = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";
  const engine = fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(2_500) })
    .then((response) => response.ok)
    .catch(() => false);

  const [dbConnected, redisConnected, engineReachable] = await Promise.all([
    database,
    redisCheck,
    engine,
  ]);
  return { dbConnected, redisConnected, engineReachable };
}

const payload = (dependencies: DependencyHealth) => ({
  status: Object.values(dependencies).every(Boolean) ? "ok" : "degraded",
  ...dependencies,
  mode: getGridNexusMode(),
  uptime: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
});

export const healthRouter = Router();

healthRouter.get("/live", (_req, res) => {
  res.json({ status: "ok", uptime: Math.round(process.uptime()) });
});

// Compatibility endpoint for the dashboard: detailed, but always a liveness 200.
healthRouter.get("/health", async (_req, res, next) => {
  try {
    res.json(payload(await checkDependencies()));
  } catch (error) {
    next(error);
  }
});

healthRouter.get("/ready", async (_req, res: Response, next) => {
  try {
    const dependencies = await checkDependencies();
    const ready = Object.values(dependencies).every(Boolean);
    res.status(ready ? 200 : 503).json({ ...payload(dependencies), status: ready ? "ready" : "unavailable" });
  } catch (error) {
    next(error);
  }
});
