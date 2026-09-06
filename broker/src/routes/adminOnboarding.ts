/**
 * broker/src/routes/adminOnboarding.ts
 * ─────────────────────────────────────
 * Administrative endpoints for reviewing, approving, rejecting,
 * and suspending DER-owner onboarding applications.
 */

import { Router, type Request, type Response } from "express";
import { Role } from "../middleware/rbac.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";
import { decrypt } from "../db/encryption.js";
import { appendAuditEvent } from "../services/auditChain.js";

export const adminOnboardingRouter = Router();

/**
 * GET /api/admin/onboarding
 * List onboarding applications with filtering and pagination.
 * Accessible to ADMIN, GRID_OPERATOR, and AUDITOR.
 */
adminOnboardingRouter.get(
  "/",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR, Role.AUDITOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? 50), 10) || 50));
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? 1), 10) || 1);
      const skip = (page - 1) * limit;

      const where: any = {};
      if (statusFilter) {
        where.status = statusFilter;
      }

      const [total, records] = await Promise.all([
        prisma.userOnboarding.count({ where }),
        prisma.userOnboarding.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { id: true, email: true, username: true, role: true },
            },
          },
        }),
      ]);

      const items = records.map((record) => ({
        id: record.id,
        userId: record.userId,
        user: record.user,
        status: record.status,
        siteName: record.siteName,
        location: record.location,
        derType: record.derType,
        hasPrivateInfo: !!(record.hiddenCapacity && record.hiddenBattery && record.hiddenGenCost),
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt,
        reason: record.reason,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }));

      res.json(items);
    } catch (error) {
      console.error("[AdminOnboarding] Failed to list applications:", error);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to list applications." });
    }
  }
);

/**
 * GET /api/admin/onboarding/:id
 * Retrieve details for a specific onboarding application.
 * Accessible to ADMIN, GRID_OPERATOR, and AUDITOR.
 * Protects private operational fields:
 *   - ADMIN and GRID_OPERATOR receive decrypted operational values.
 *   - AUDITOR receives redacted fields.
 */
adminOnboardingRouter.get(
  "/:id",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR, Role.AUDITOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const record = await prisma.userOnboarding.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            select: { id: true, email: true, username: true, role: true },
          },
        },
      });

      if (!record) {
        res.status(404).json({ error: "NOT_FOUND", message: "Onboarding record not found." });
        return;
      }

      const userRole = req.user?.role;
      let capacityKw: number | null = null;
      let batteryCapacityKwh: number | null = null;
      let generationCost: number | null = null;

      // Only decrypt sensitive fields for ADMIN and GRID_OPERATOR
      if (userRole === Role.ADMIN || userRole === Role.GRID_OPERATOR) {
        if (record.hiddenCapacity) {
          try {
            capacityKw = Number(decrypt(record.hiddenCapacity));
          } catch (e) {
            console.error("[AdminOnboarding] Failed to decrypt capacity:", e);
          }
        }
        if (record.hiddenBattery) {
          try {
            batteryCapacityKwh = Number(decrypt(record.hiddenBattery));
          } catch (e) {
            console.error("[AdminOnboarding] Failed to decrypt battery:", e);
          }
        }
        if (record.hiddenGenCost) {
          try {
            generationCost = Number(decrypt(record.hiddenGenCost));
          } catch (e) {
            console.error("[AdminOnboarding] Failed to decrypt generationCost:", e);
          }
        }
      }

      res.json({
        id: record.id,
        userId: record.userId,
        user: record.user,
        status: record.status,
        siteName: record.siteName,
        location: record.location,
        derType: record.derType,
        capacityKw,
        batteryCapacityKwh,
        generationCost,
        hasPrivateInfo: !!(record.hiddenCapacity && record.hiddenBattery && record.hiddenGenCost),
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt,
        reason: record.reason,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    } catch (error) {
      console.error("[AdminOnboarding] Failed to retrieve application:", error);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to retrieve application." });
    }
  }
);

/**
 * POST /api/admin/onboarding/:id/approve
 * Approves a PENDING_VERIFICATION onboarding application.
 * Only ADMIN and GRID_OPERATOR may approve.
 */
adminOnboardingRouter.post(
  "/:id/approve",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reviewerId = req.user?.userId;
      if (!reviewerId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const record = await prisma.userOnboarding.findUnique({
        where: { id: req.params.id },
      });

      if (!record) {
        res.status(404).json({ error: "NOT_FOUND", message: "Onboarding record not found." });
        return;
      }

      // Prevent self-approval
      if (record.userId === reviewerId) {
        res.status(403).json({
          error: "SELF_APPROVAL_FORBIDDEN",
          message: "Users cannot approve their own onboarding application.",
        });
        return;
      }

      // Idempotency: already approved
      if (record.status === "APPROVED") {
        res.status(200).json({
          message: "Onboarding application is already approved.",
          status: "APPROVED",
          onboarding: record,
        });
        return;
      }

      // Validate state transition
      if (record.status !== "PENDING_VERIFICATION") {
        res.status(400).json({
          error: "INVALID_STATE",
          message: `Cannot approve application in status '${record.status}'. Application must be PENDING_VERIFICATION.`,
        });
        return;
      }

      const reason = (req.body?.reason as string) || "Administrative approval";

      const updated = await prisma.$transaction(async (tx) => {
        const resOnboarding = await tx.userOnboarding.update({
          where: { id: record.id },
          data: {
            status: "APPROVED",
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            reason,
          },
        });

        await appendAuditEvent(tx as any, {
          eventType: "ONBOARDING_APPROVED",
          actorId: reviewerId,
          payload: {
            onboardingId: record.id,
            targetUserId: record.userId,
            previousStatus: record.status,
            newStatus: "APPROVED",
            reason,
          },
        });

        return resOnboarding;
      });

      res.status(200).json({
        message: "Onboarding application approved successfully.",
        status: updated.status,
        onboarding: updated,
      });
    } catch (error) {
      console.error("[AdminOnboarding] Approval failed:", error);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to approve application." });
    }
  }
);

/**
 * POST /api/admin/onboarding/:id/reject
 * Rejects an onboarding application.
 * Only ADMIN and GRID_OPERATOR may reject.
 */
adminOnboardingRouter.post(
  "/:id/reject",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reviewerId = req.user?.userId;
      if (!reviewerId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const record = await prisma.userOnboarding.findUnique({
        where: { id: req.params.id },
      });

      if (!record) {
        res.status(404).json({ error: "NOT_FOUND", message: "Onboarding record not found." });
        return;
      }

      // Prevent self-rejection
      if (record.userId === reviewerId) {
        res.status(403).json({
          error: "SELF_ACTION_FORBIDDEN",
          message: "Users cannot reject their own onboarding application.",
        });
        return;
      }

      // Idempotency: already rejected
      if (record.status === "REJECTED") {
        res.status(200).json({
          message: "Onboarding application is already rejected.",
          status: "REJECTED",
          onboarding: record,
        });
        return;
      }

      // Cannot reject if already active or provisioned (use suspend instead)
      if (["MICROGRID_PROVISIONED", "AGENT_PROVISIONED", "ACTIVE"].includes(record.status)) {
        res.status(400).json({
          error: "INVALID_STATE",
          message: `Cannot reject application in status '${record.status}'. Use suspend instead for active/provisioned assets.`,
        });
        return;
      }

      const reason = (req.body?.reason as string) || "Administrative rejection";

      const updated = await prisma.$transaction(async (tx) => {
        const resOnboarding = await tx.userOnboarding.update({
          where: { id: record.id },
          data: {
            status: "REJECTED",
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            reason,
          },
        });

        await appendAuditEvent(tx as any, {
          eventType: "ONBOARDING_REJECTED",
          actorId: reviewerId,
          payload: {
            onboardingId: record.id,
            targetUserId: record.userId,
            previousStatus: record.status,
            newStatus: "REJECTED",
            reason,
          },
        });

        return resOnboarding;
      });

      res.status(200).json({
        message: "Onboarding application rejected.",
        status: updated.status,
        onboarding: updated,
      });
    } catch (error) {
      console.error("[AdminOnboarding] Rejection failed:", error);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to reject application." });
    }
  }
);

/**
 * POST /api/admin/onboarding/:id/suspend
 * Suspends an onboarding application or active asset.
 * Only ADMIN and GRID_OPERATOR may suspend.
 */
adminOnboardingRouter.post(
  "/:id/suspend",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reviewerId = req.user?.userId;
      if (!reviewerId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const record = await prisma.userOnboarding.findUnique({
        where: { id: req.params.id },
      });

      if (!record) {
        res.status(404).json({ error: "NOT_FOUND", message: "Onboarding record not found." });
        return;
      }

      // Prevent self-suspension
      if (record.userId === reviewerId) {
        res.status(403).json({
          error: "SELF_ACTION_FORBIDDEN",
          message: "Users cannot suspend their own onboarding application.",
        });
        return;
      }

      // Idempotency: already suspended
      if (record.status === "SUSPENDED") {
        res.status(200).json({
          message: "Onboarding application is already suspended.",
          status: "SUSPENDED",
          onboarding: record,
        });
        return;
      }

      // Cannot suspend rejected applications
      if (record.status === "REJECTED") {
        res.status(400).json({
          error: "INVALID_STATE",
          message: `Cannot suspend application in status '${record.status}'.`,
        });
        return;
      }

      const reason = (req.body?.reason as string) || "Administrative suspension";

      const updated = await prisma.$transaction(async (tx) => {
        const resOnboarding = await tx.userOnboarding.update({
          where: { id: record.id },
          data: {
            status: "SUSPENDED",
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            reason,
          },
        });

        await appendAuditEvent(tx as any, {
          eventType: "ONBOARDING_SUSPENDED",
          actorId: reviewerId,
          payload: {
            onboardingId: record.id,
            targetUserId: record.userId,
            previousStatus: record.status,
            newStatus: "SUSPENDED",
            reason,
          },
        });

        return resOnboarding;
      });

      res.status(200).json({
        message: "Onboarding application suspended.",
        status: updated.status,
        onboarding: updated,
      });
    } catch (error) {
      console.error("[AdminOnboarding] Suspension failed:", error);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to suspend application." });
    }
  }
);
