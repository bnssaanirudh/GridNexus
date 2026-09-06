/**
 * broker/src/routes/me.ts
 * ────────────────────────
 * Explicit DER-owner scoped APIs.
 * All queries are strictly derived from the authenticated user's
 * UserMicrogridMembership records. Client-supplied IDs are never trusted.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";

export const meRouter = Router();

// All /api/me routes require authentication
meRouter.use(requireAuth());

// Verify user account is active (inactive/suspended users lose access immediately)
meRouter.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "User not identified." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { active: true },
    });

    if (!user || !user.active) {
      res.status(403).json({
        error: "ACCOUNT_INACTIVE",
        message: "User account is inactive or suspended.",
      });
      return;
    }
    next();
  } catch (err) {
    console.error("[Me] User active check failed:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Derives the list of authorized microgrid IDs for the authenticated user.
 * Combines UserMicrogridMembership and legacy User.microgridId.
 */
export async function getAuthorizedMicrogridIds(userId: string): Promise<string[]> {
  const [memberships, user] = await Promise.all([
    prisma.userMicrogridMembership.findMany({
      where: { userId },
      select: { microgridId: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { microgridId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const m of memberships) {
    if (m.microgridId) ids.add(m.microgridId);
  }
  if (user?.microgridId) {
    ids.add(user.microgridId);
  }

  return Array.from(ids);
}

const parsePagination = (req: Request) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? 50), 10) || 50));
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? 1), 10) || 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
};

const number = (val: unknown): number => Number(val ?? 0);

/**
 * GET /api/me/microgrids
 * Returns microgrids owned/operated by the authenticated user.
 * Excludes private encrypted operational secrets (hiddengenerationcost, hiddenbatterycapacity).
 */
meRouter.get("/microgrids", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);

    if (microgridIds.length === 0) {
      res.json([]);
      return;
    }

    const microgrids = await prisma.microgrid.findMany({
      where: { id: { in: microgridIds } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        externalCode: true,
        name: true,
        type: true,
        latitude: true,
        longitude: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(
      microgrids.map((mg) => ({
        ...mg,
        latitude: mg.latitude ? number(mg.latitude) : null,
        longitude: mg.longitude ? number(mg.longitude) : null,
      }))
    );
  } catch (error) {
    console.error("[Me] Failed to get microgrids:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * GET /api/me/ders
 * Returns DERs associated with the authenticated user's microgrids.
 */
meRouter.get("/ders", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);

    if (microgridIds.length === 0) {
      res.json([]);
      return;
    }

    const ders = await prisma.dER.findMany({
      where: { microgridId: { in: microgridIds } },
      orderBy: [{ microgridId: "asc" }, { type: "asc" }],
      include: {
        microgrid: { select: { id: true, name: true, externalCode: true } },
      },
    });

    res.json(
      ders.map((der) => ({
        id: der.id,
        microgridId: der.microgridId,
        microgrid: der.microgrid,
        type: der.type,
        ratedPowerKw: number(der.ratedPowerKw),
        energyCapacityKwh: der.energyCapacityKwh != null ? number(der.energyCapacityKwh) : null,
        minPowerKw: number(der.minPowerKw),
        maxPowerKw: number(der.maxPowerKw),
        efficiency: number(der.efficiency),
        metadata: der.metadata,
        createdAt: der.createdAt,
        updatedAt: der.updatedAt,
      }))
    );
  } catch (error) {
    console.error("[Me] Failed to get ders:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * GET /api/me/agent
 * Returns Agent(s) associated with the authenticated user's microgrids.
 */
meRouter.get("/agent", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);

    if (microgridIds.length === 0) {
      res.json([]);
      return;
    }

    const agents = await prisma.agent.findMany({
      where: { microgridId: { in: microgridIds } },
      orderBy: { id: "asc" },
      include: {
        microgrid: { select: { id: true, name: true, externalCode: true } },
      },
    });

    res.json(
      agents.map((ag) => ({
        id: ag.id,
        microgridId: ag.microgridId,
        microgrid: ag.microgrid,
        type: ag.type,
        qre_lambda: ag.qre_lambda != null ? number(ag.qre_lambda) : null,
      }))
    );
  } catch (error) {
    console.error("[Me] Failed to get agents:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * GET /api/me/negotiations
 * Returns negotiations where the user's microgrid was seller or buyer.
 */
meRouter.get("/negotiations", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);

    if (microgridIds.length === 0) {
      res.json([]);
      return;
    }

    const { limit, skip } = parsePagination(req);

    const negotiations = await prisma.negotiation.findMany({
      where: {
        OR: [
          { sellerMicrogridId: { in: microgridIds } },
          { buyerMicrogridId: { in: microgridIds } },
        ],
      },
      take: limit,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        negotiationRounds: {
          orderBy: { roundNumber: "asc" },
          select: {
            roundNumber: true,
            activeAgentId: true,
            opponentAgentId: true,
            action: true,
            surplus: true,
          },
        },
      },
    });

    res.json(
      negotiations.map((neg) => ({
        ...neg,
        negotiationRounds: neg.negotiationRounds.map((r) => ({
          ...r,
          surplus: number(r.surplus),
        })),
      }))
    );
  } catch (error) {
    console.error("[Me] Failed to get negotiations:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * GET /api/me/trades
 * Returns EnergyTransfers (trades) involving the user's microgrids.
 */
meRouter.get("/trades", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);

    if (microgridIds.length === 0) {
      res.json([]);
      return;
    }

    const { limit, skip } = parsePagination(req);

    const transfers = await prisma.energyTransfer.findMany({
      where: {
        OR: [
          { fromMicrogridId: { in: microgridIds } },
          { toMicrogridId: { in: microgridIds } },
        ],
      },
      take: limit,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        fromMicrogrid: { select: { id: true, name: true, externalCode: true } },
        toMicrogrid: { select: { id: true, name: true, externalCode: true } },
      },
    });

    res.json(
      transfers.map((t) => ({
        ...t,
        amount: number(t.amount),
        price: number(t.price),
        energyKwh: number(t.energyKwh),
        averagePowerKw: number(t.averagePowerKw),
      }))
    );
  } catch (error) {
    console.error("[Me] Failed to get trades:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * GET /api/me/settlements
 * Returns settlements involving the user's microgrids.
 */
meRouter.get("/settlements", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);

    if (microgridIds.length === 0) {
      res.json([]);
      return;
    }

    const { limit, skip } = parsePagination(req);

    const settlements = await prisma.settlement.findMany({
      where: {
        OR: [
          { sellerMicrogridId: { in: microgridIds } },
          { buyerMicrogridId: { in: microgridIds } },
        ],
      },
      take: limit,
      skip,
      orderBy: { createdAt: "desc" },
    });

    res.json(
      settlements.map((s) => ({
        ...s,
        energyKwh: number(s.energyKwh),
        pricePerKwh: number(s.pricePerKwh),
      }))
    );
  } catch (error) {
    console.error("[Me] Failed to get settlements:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * GET /api/me/analytics
 * Returns aggregated trading and DER statistics scoped to the user's microgrids.
 */
meRouter.get("/analytics", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);

    if (microgridIds.length === 0) {
      res.json({
        totalTradedKwh: 0,
        totalRevenueUsd: 0,
        totalCostUsd: 0,
        activeNegotiations: 0,
        committedSettlements: 0,
        derCount: 0,
        totalCapacityKw: 0,
      });
      return;
    }

    const [salesAgg, purchasesAgg, activeNegs, committedSettlements, ders] = await Promise.all([
      // As seller
      prisma.settlement.aggregate({
        where: {
          sellerMicrogridId: { in: microgridIds },
          status: "COMMITTED",
        },
        _sum: { energyKwh: true },
        _avg: { pricePerKwh: true },
      }),
      // As buyer
      prisma.settlement.aggregate({
        where: {
          buyerMicrogridId: { in: microgridIds },
          status: "COMMITTED",
        },
        _sum: { energyKwh: true },
        _avg: { pricePerKwh: true },
      }),
      // Active negotiations
      prisma.negotiation.count({
        where: {
          OR: [
            { sellerMicrogridId: { in: microgridIds } },
            { buyerMicrogridId: { in: microgridIds } },
          ],
          status: { in: ["CREATED", "NEGOTIATING", "PROVISIONALLY_ACCEPTED", "SAFETY_VERIFIED"] },
        },
      }),
      // Committed settlements count
      prisma.settlement.count({
        where: {
          OR: [
            { sellerMicrogridId: { in: microgridIds } },
            { buyerMicrogridId: { in: microgridIds } },
          ],
          status: "COMMITTED",
        },
      }),
      // DER assets
      prisma.dER.findMany({
        where: { microgridId: { in: microgridIds } },
        select: { ratedPowerKw: true, energyCapacityKwh: true },
      }),
    ]);

    const soldKwh = number(salesAgg._sum.energyKwh);
    const avgSalePrice = number(salesAgg._avg.pricePerKwh);
    const boughtKwh = number(purchasesAgg._sum.energyKwh);
    const avgBuyPrice = number(purchasesAgg._avg.pricePerKwh);

    const totalCapacityKw = ders.reduce((sum, d) => sum + number(d.ratedPowerKw), 0);
    const totalBatteryKwh = ders.reduce((sum, d) => sum + (d.energyCapacityKwh ? number(d.energyCapacityKwh) : 0), 0);

    res.json({
      totalTradedKwh: soldKwh + boughtKwh,
      totalSoldKwh: soldKwh,
      totalPurchasedKwh: boughtKwh,
      totalRevenueUsd: soldKwh * avgSalePrice,
      totalCostUsd: boughtKwh * avgBuyPrice,
      activeNegotiations: activeNegs,
      committedSettlements,
      derCount: ders.length,
      totalCapacityKw,
      totalBatteryKwh,
    });
  } catch (error) {
    console.error("[Me] Failed to get analytics:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * GET /api/me/audit
 * Returns audit events relevant to the authenticated user.
 */
meRouter.get("/audit", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const microgridIds = await getAuthorizedMicrogridIds(userId);
    const { limit, skip } = parsePagination(req);

    // Find negotiations belonging to user's microgrids
    const negs = await prisma.negotiation.findMany({
      where: {
        OR: [
          { sellerMicrogridId: { in: microgridIds } },
          { buyerMicrogridId: { in: microgridIds } },
        ],
      },
      select: { id: true },
    });
    const userNegIds = negs.map((n) => n.id);

    const events = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { actorId: userId },
          { negotiationId: { in: userNegIds } },
        ],
      },
      take: limit,
      skip,
      orderBy: { sequence: "desc" },
    });

    res.json(events);
  } catch (error) {
    console.error("[Me] Failed to get audit events:", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
