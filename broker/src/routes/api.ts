import { Router, type NextFunction, type Request, type Response } from "express";
import { Role } from "../middleware/rbac.js";
import { requireAuth } from "../middleware/auth.js";
import { isProduction } from "../config.js";
import { prisma } from "../db/prisma.js";
import { onboardingRouter } from "./onboarding.js";
import { adminOnboardingRouter } from "./adminOnboarding.js";
import { meRouter } from "./me.js";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const asyncRoute = (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };

const parseLimit = (value: unknown, fallback = 50, maximum = 200): number => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(1, parsed)) : fallback;
};

const number = (value: unknown): number => Number(value ?? 0);

/** Require a signed user JWT for operational data in strict production mode. */
const operationalAccess = isProduction()
  ? requireAuth([Role.ADMIN, Role.GRID_OPERATOR, Role.DER_OWNER, Role.AUDITOR, Role.VIEWER])
  : (_req: Request, _res: Response, next: NextFunction): void => next();

export const apiRouter = Router();
apiRouter.use(operationalAccess);

apiRouter.use("/onboarding", onboardingRouter);
apiRouter.use("/admin/onboarding", adminOnboardingRouter);
apiRouter.use("/me", meRouter);

apiRouter.get("/oracle/signals", asyncRoute(async (req, res) => {
  const signals = await prisma.oracleSignal.findMany({
    take: parseLimit(req.query.limit, 20),
    orderBy: { createdAt: "desc" },
    include: {
      beliefUpdates: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          posterior: true,
          confidence: true,
          hypothesis: true,
          decisionSource: true,
          status: true,
        },
      },
    },
  });
  res.json(signals.map((signal) => ({
    ...signal,
    beliefUpdates: signal.beliefUpdates.map((belief) => ({
      ...belief,
      posterior: number(belief.posterior),
      confidence: number(belief.confidence),
    })),
  })));
}));

// Backward-compatible envelope used by the compact OracleTimeline component.
apiRouter.get("/oracle-signals", asyncRoute(async (req, res) => {
  const signals = await prisma.oracleSignal.findMany({
    take: parseLimit(req.query.limit, 20),
    orderBy: { createdAt: "desc" },
    select: { id: true, signalData: true, createdAt: true },
  });
  res.json({ signals });
}));

apiRouter.get("/energy-transfers", asyncRoute(async (req, res) => {
  const transfers = await prisma.energyTransfer.findMany({
    take: parseLimit(req.query.limit),
    orderBy: { createdAt: "desc" },
    include: {
      fromMicrogrid: { select: { id: true, name: true, externalCode: true } },
      toMicrogrid: { select: { id: true, name: true, externalCode: true } },
    },
  });
  res.json(transfers.map((transfer) => ({
    ...transfer,
    amount: number(transfer.amount),
    energyKwh: number(transfer.energyKwh),
    averagePowerKw: number(transfer.averagePowerKw),
    price: number(transfer.price),
    from: transfer.fromMicrogrid.externalCode ?? transfer.fromMicrogrid.name,
    to: transfer.toMicrogrid.externalCode ?? transfer.toMicrogrid.name,
  })));
}));

apiRouter.get("/ders", asyncRoute(async (req, res) => {
  const ders = await prisma.dER.findMany({
    take: parseLimit(req.query.limit, 200, 2_000),
    orderBy: [{ microgridId: "asc" }, { type: "asc" }],
    include: { microgrid: { select: { name: true, externalCode: true, active: true } } },
  });
  res.json(ders.map((der) => ({
    ...der,
    ratedPowerKw: number(der.ratedPowerKw),
    energyCapacityKwh: der.energyCapacityKwh == null ? null : number(der.energyCapacityKwh),
    minPowerKw: number(der.minPowerKw),
    maxPowerKw: number(der.maxPowerKw),
    efficiency: number(der.efficiency),
  })));
}));

apiRouter.get("/topology", asyncRoute(async (_req, res) => {
  const [buses, lines, revision, latestCertificate] = await Promise.all([
    prisma.bus.findMany({ orderBy: { externalCode: "asc" } }),
    prisma.line.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.topologyRevision.findFirst({ orderBy: { version: "desc" } }),
    prisma.gridFeasibilityCertificate.findFirst({
      where: { feasible: true },
      orderBy: { createdAt: "desc" },
      select: { maxLineLoadingPct: true },
    }),
  ]);
  const observedUtilization = latestCertificate?.maxLineLoadingPct == null
    ? undefined
    : number(latestCertificate.maxLineLoadingPct);
  res.json({
    topologyVersion: revision?.version ?? 0,
    buses: buses.map((bus) => ({
      ...bus,
      voltageLevelKv: number(bus.voltageLevelKv),
      latitude: bus.latitude == null ? undefined : number(bus.latitude),
      longitude: bus.longitude == null ? undefined : number(bus.longitude),
    })),
    lines: lines.map((line) => ({
      ...line,
      resistance: number(line.resistance),
      reactance: number(line.reactance),
      thermalLimitKw: number(line.thermalLimitKw),
      utilization: observedUtilization,
    })),
  });
}));

apiRouter.get("/coalitions", asyncRoute(async (_req, res) => {
  const buses = await prisma.bus.findMany({
    orderBy: { externalCode: "asc" },
    include: {
      microgrids: {
        include: { microgrid: { include: { ders: { select: { ratedPowerKw: true } } } } },
      },
    },
  });
  const coalitions = buses
    .filter((bus) => bus.microgrids.length > 0)
    .map((bus) => {
      const capacityKw = bus.microgrids.reduce(
        (total, mapping) => total + mapping.microgrid.ders.reduce(
          (subtotal, der) => subtotal + number(der.ratedPowerKw), 0,
        ), 0,
      );
      return {
        id: bus.id,
        name: bus.externalCode ?? `Bus ${bus.id.slice(0, 8)}`,
        members: bus.microgrids.map((mapping) => mapping.microgridId),
        value: Number((capacityKw * 0.11).toFixed(2)),
        capacityKw: Number(capacityKw.toFixed(2)),
        epsilon: 0,
        currency: "USD",
        status: "ACTIVE",
      };
    });
  res.json(coalitions);
}));

apiRouter.get("/settlements", asyncRoute(async (req, res) => {
  const settlements = await prisma.settlement.findMany({
    take: parseLimit(req.query.limit),
    orderBy: { createdAt: "desc" },
  });
  res.json(settlements.map((settlement) => ({
    ...settlement,
    energyKwh: number(settlement.energyKwh),
    pricePerKwh: number(settlement.pricePerKwh),
  })));
}));

apiRouter.get("/audit-events", asyncRoute(async (req, res) => {
  const events = await prisma.auditEvent.findMany({
    take: parseLimit(req.query.limit),
    orderBy: { sequence: "desc" },
  });
  res.json(events);
}));

apiRouter.get("/analytics", asyncRoute(async (_req, res) => {
  const [settlementAgg, stabilityTotal, stabilityPassed, oracleCount] = await Promise.all([
    prisma.settlement.aggregate({
      where: { status: "COMMITTED" },
      _sum: { energyKwh: true },
      _avg: { pricePerKwh: true },
      _count: { id: true },
    }),
    prisma.stabilityCheck.count(),
    prisma.stabilityCheck.count({ where: { isStable: true } }),
    prisma.oracleSignal.count(),
  ]);
  const totalKwh = number(settlementAgg._sum.energyKwh);
  const averagePrice = number(settlementAgg._avg.pricePerKwh);
  res.json({
    summary: {
      totalTradedKwh: totalKwh,
      totalVolumeUsd: totalKwh * averagePrice,
      avgPricePerKwh: averagePrice,
      stabilityPassRatePct: stabilityTotal ? (stabilityPassed / stabilityTotal) * 100 : 0,
      totalStabilityChecks: stabilityTotal,
      totalOracleBroadcasts: oracleCount,
    },
    recentTransfersCount: settlementAgg._count.id,
    timestamp: new Date().toISOString(),
  });
}));

apiRouter.get("/metrics/overview", asyncRoute(async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [activeNegotiations, failedNegotiations, settlements, certificates, stableChecks, oracleSignals] = await Promise.all([
    prisma.negotiation.count({ where: { status: { in: ["CREATED", "NEGOTIATING", "PROVISIONALLY_ACCEPTED", "SAFETY_VERIFIED"] } } }),
    prisma.negotiation.count({ where: { status: { in: ["FAILED", "REJECTED", "WALKED_AWAY", "MAX_ROUNDS_REACHED"] } } }),
    prisma.settlement.aggregate({
      where: { status: "COMMITTED", createdAt: { gte: startOfDay } },
      _sum: { energyKwh: true },
      _avg: { pricePerKwh: true },
      _count: { id: true },
    }),
    prisma.gridFeasibilityCertificate.groupBy({ by: ["feasible"], _count: { _all: true } }),
    prisma.stabilityCheck.groupBy({ by: ["isStable"], _count: { _all: true } }),
    prisma.oracleSignal.count({ where: { createdAt: { gte: startOfDay } } }),
  ]);
  const certificateTotal = certificates.reduce((sum, item) => sum + item._count._all, 0);
  const certificatePassed = certificates.find((item) => item.feasible)?._count._all ?? 0;
  const stabilityTotal = stableChecks.reduce((sum, item) => sum + item._count._all, 0);
  const stabilityPassed = stableChecks.find((item) => item.isStable)?._count._all ?? 0;
  res.json({
    activeNegotiations,
    energyTradedKwh: number(settlements._sum.energyKwh),
    avgPricePerKwh: number(settlements._avg.pricePerKwh),
    committedSettlements: settlements._count.id,
    gridPassRate: certificateTotal ? Number(((certificatePassed / certificateTotal) * 100).toFixed(2)) : 0,
    coalitionStability: stabilityTotal ? Number(((stabilityPassed / stabilityTotal) * 100).toFixed(2)) : 0,
    oracleSignals,
    failedNegotiations,
  });
}));

apiRouter.post("/demo/live-trade", asyncRoute(async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "Missing or invalid apiKey" });
    return;
  }
  
  // Start the background process without blocking the response
  import("../services/demoTradeCoordinator.js")
    .then((module) => module.startLiveDemoTrade(apiKey))
    .catch((err) => console.error("Failed to start live demo trade:", err));

  res.json({ message: "Live demo trade initiated. Check the Negotiation Feed." });
}));
