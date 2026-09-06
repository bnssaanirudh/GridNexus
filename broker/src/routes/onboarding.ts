/**
 * broker/src/routes/onboarding.ts
 * ─────────────────────────────
 * Endpoints for DER owners to manage their onboarding application.
 */

import { Router, type Request, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth.js";
import { encrypt } from "../db/encryption.js";

export const onboardingRouter = Router();
const prisma = new PrismaClient();

// Must be authenticated to access onboarding endpoints
onboardingRouter.use(requireAuth());

/**
 * GET /api/onboarding/status
 * Returns the current onboarding state of the authenticated user.
 */
onboardingRouter.get("/status", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "User not identified." });
    return;
  }

  try {
    const onboarding = await prisma.userOnboarding.findUnique({
      where: { userId },
    });

    if (!onboarding) {
      res.json({ status: "NOT_STARTED" });
      return;
    }

    // Do not return encrypted private info directly in plain text
    res.json({
      id: onboarding.id,
      status: onboarding.status,
      siteName: onboarding.siteName,
      location: onboarding.location,
      derType: onboarding.derType,
      hasPrivateInfo: !!(onboarding.hiddenCapacity && onboarding.hiddenBattery && onboarding.hiddenGenCost),
      createdAt: onboarding.createdAt,
      updatedAt: onboarding.updatedAt,
    });
  } catch (error) {
    console.error("Failed to fetch onboarding status:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch status." });
  }
});

/**
 * POST /api/onboarding/der-owner
 * Initializes the onboarding record with public site information.
 */
onboardingRouter.post("/der-owner", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const { siteName, location, derType } = req.body;

  try {
    // Check if one already exists
    let onboarding = await prisma.userOnboarding.findUnique({ where: { userId } });
    
    if (onboarding) {
      res.status(409).json({ error: "CONFLICT", message: "Onboarding record already exists." });
      return;
    }

    onboarding = await prisma.userOnboarding.create({
      data: {
        userId,
        status: "PROFILE_INCOMPLETE",
        siteName,
        location,
        derType,
      },
    });

    res.json({ message: "Onboarding initiated.", status: onboarding.status });
  } catch (error) {
    console.error("Failed to create onboarding:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/**
 * PUT /api/onboarding/der-owner
 * Updates the onboarding record with private operational information and submits it for verification.
 */
onboardingRouter.put("/der-owner", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const { capacityKw, batteryCapacityKwh, generationCost, siteName, location, derType } = req.body;

  try {
    const onboarding = await prisma.userOnboarding.findUnique({ where: { userId } });
    if (!onboarding) {
      res.status(404).json({ error: "NOT_FOUND", message: "Onboarding record not found. POST first." });
      return;
    }

    // Only allow update if in an editable state
    if (["PENDING_VERIFICATION", "APPROVED", "MICROGRID_PROVISIONED", "AGENT_PROVISIONED", "ACTIVE"].includes(onboarding.status)) {
      res.status(400).json({ error: "INVALID_STATE", message: "Cannot edit onboarding application in its current state." });
      return;
    }

    // Validate inputs if provided
    if (capacityKw !== undefined && Number(capacityKw) < 0) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Capacity cannot be negative." });
      return;
    }
    if (batteryCapacityKwh !== undefined && Number(batteryCapacityKwh) < 0) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Battery capacity cannot be negative." });
      return;
    }

    const dataToUpdate: any = {};
    if (siteName !== undefined) dataToUpdate.siteName = siteName;
    if (location !== undefined) dataToUpdate.location = location;
    if (derType !== undefined) dataToUpdate.derType = derType;

    if (capacityKw !== undefined) {
      dataToUpdate.hiddenCapacity = encrypt(String(capacityKw));
    }
    if (batteryCapacityKwh !== undefined) {
      dataToUpdate.hiddenBattery = encrypt(String(batteryCapacityKwh));
    }
    if (generationCost !== undefined) {
      dataToUpdate.hiddenGenCost = encrypt(String(generationCost));
    }

    // Check if we have all required fields to move to PENDING_VERIFICATION
    const isComplete = (
      (dataToUpdate.siteName || onboarding.siteName) &&
      (dataToUpdate.location || onboarding.location) &&
      (dataToUpdate.derType || onboarding.derType) &&
      (dataToUpdate.hiddenCapacity || onboarding.hiddenCapacity) &&
      (dataToUpdate.hiddenBattery || onboarding.hiddenBattery) &&
      (dataToUpdate.hiddenGenCost || onboarding.hiddenGenCost)
    );

    if (isComplete) {
      dataToUpdate.status = "PENDING_VERIFICATION";
    }

    const updated = await prisma.userOnboarding.update({
      where: { userId },
      data: dataToUpdate,
    });

    res.json({ message: "Onboarding updated.", status: updated.status });
  } catch (error) {
    console.error("Failed to update onboarding:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
