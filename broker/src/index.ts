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
import { randomUUID } from "crypto";
import { setupNegotiationNamespace } from "./ws/negotiate";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { healthRouter } from "./routes/health.js";
import { disconnectPrisma } from "./db/prisma.js";
import { isProduction } from "./config.js";


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
  : isProduction() ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];

app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false }));
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const requestId = String(req.headers["x-request-id"] ?? randomUUID());
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  next();
});

function validateRuntimeConfiguration(): void {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
    throw new Error("BROKER_PORT must be a valid TCP port.");
  }
  if (!isProduction()) return;
  const required = ["DATABASE_URL", "REDIS_URL", "ENGINE_URL", "JWT_SECRET", "ENGINE_JWT_SECRET", "ENCRYPTION_KEY", "CORS_ORIGINS"];
  const missing = required.filter((name) => !(process.env[name] ?? "").trim());
  if (missing.length) throw new Error("Production configuration is missing: " + missing.join(", "));
  if ((process.env.JWT_SECRET ?? "").length < 32 || (process.env.ENGINE_JWT_SECRET ?? "").length < 32) {
    throw new Error("Production JWT secrets must each be at least 32 characters.");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY ?? "")) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hexadecimal characters.");
  }
}

validateRuntimeConfiguration();

app.use(healthRouter);
app.use("/auth", authRouter);
app.use("/api", apiRouter);


// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use((error: unknown, req: Request, res: Response, _next: express.NextFunction): void => {
  const requestId = String(res.getHeader("x-request-id") ?? "unknown");
  console.error("[Broker] Request failed", { requestId, method: req.method, path: req.path, error });
  if (res.headersSent) return;
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "The request could not be completed.",
    requestId,
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
    // Queue modules are loaded only for a running service. App imports used by
    // unit tests and tooling stay side-effect free and never open Redis sockets.
    void Promise.all([
      import("./queues/oracleBroadcastQueue.js"),
      import("./queues/integrityQueue.js"),
    ]).then(([oracle, integrity]) => Promise.all([
      oracle.scheduleOracleBroadcast(),
      integrity.scheduleIntegrityCheck(),
    ])).catch((err) => {
      console.error("[Broker] Failed to initialize background schedules:", err);
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[Broker] Received " + signal + "; draining connections.");
    const forceExit = setTimeout(() => {
      console.error("[Broker] Graceful shutdown timed out.");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    io.close(() => {
      server.close(async () => {
        try {
          await disconnectPrisma();
          clearTimeout(forceExit);
          process.exit(0);
        } catch (error) {
          console.error("[Broker] Shutdown cleanup failed.", error);
          process.exit(1);
        }
      });
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}


export { app, server, io };
