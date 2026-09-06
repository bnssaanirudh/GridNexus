/**
 * broker/src/services/provisioningService.ts
 * ──────────────────────────────────────────
 * Transactional provisioning workflow for approved DER-owner applications.
 * Atomically provisions Microgrid, DER, BusMapping (if topology provided),
 * Agent, and UserMicrogridMembership, appending cryptographic audit events.
 */

import { prisma } from "../db/prisma.js";
import { decrypt, encrypt } from "../db/encryption.js";
import { appendAuditEvent } from "./auditChain.js";

export interface ProvisioningOptions {
  onboardingId: string;
  actorId: string;
  busId?: string;
  phase?: string;
  agentType?: string;
}

export interface ProvisioningResult {
  success: boolean;
  status: string;
  microgridId: string;
  derId: string;
  agentId: string;
  busId: string | null;
  membershipId?: string;
  alreadyProvisioned: boolean;
}

/**
 * Atomically provisions or links resources for an approved onboarding application.
 */
export async function provisionOnboarding(
  options: ProvisioningOptions
): Promise<ProvisioningResult> {
  const { onboardingId, actorId, busId, phase, agentType } = options;

  const onboarding = await prisma.userOnboarding.findUnique({
    where: { id: onboardingId },
  });

  if (!onboarding) {
    const error: any = new Error("Onboarding application not found.");
    error.statusCode = 404;
    error.errorCode = "NOT_FOUND";
    throw error;
  }

  // Allowed states for provisioning
  const allowableStates = [
    "APPROVED",
    "PENDING_GRID_MAPPING",
    "MICROGRID_PROVISIONED",
    "AGENT_PROVISIONED",
    "ACTIVE",
  ];

  if (!allowableStates.includes(onboarding.status)) {
    const error: any = new Error(
      `Cannot provision application in status '${onboarding.status}'. Application must be APPROVED or PENDING_GRID_MAPPING.`
    );
    error.statusCode = 400;
    error.errorCode = "INVALID_STATE";
    throw error;
  }

  // Idempotency check: resources already created
  if (onboarding.microgridId && onboarding.agentId && onboarding.derId) {
    // Check if we need to update bus mapping now
    if (busId && onboarding.status === "PENDING_GRID_MAPPING") {
      await prisma.$transaction(async (tx) => {
        const bus = await tx.bus.findUnique({ where: { id: busId } });
        if (!bus) {
          const error: any = new Error(`Target electrical bus '${busId}' does not exist.`);
          error.statusCode = 400;
          error.errorCode = "BUS_NOT_FOUND";
          throw error;
        }

        await tx.microgridBusMapping.upsert({
          where: {
            microgridId_busId: {
              microgridId: onboarding.microgridId!,
              busId: bus.id,
            },
          },
          update: { phase: phase || "A" },
          create: {
            microgridId: onboarding.microgridId!,
            busId: bus.id,
            phase: phase || "A",
          },
        });

        await tx.userOnboarding.update({
          where: { id: onboarding.id },
          data: { status: "ACTIVE" },
        });

        await appendAuditEvent(tx as any, {
          eventType: "ONBOARDING_GRID_MAPPED",
          actorId,
          payload: {
            onboardingId: onboarding.id,
            microgridId: onboarding.microgridId,
            busId: bus.id,
            status: "ACTIVE",
          },
        });
      });

      return {
        success: true,
        status: "ACTIVE",
        microgridId: onboarding.microgridId,
        derId: onboarding.derId,
        agentId: onboarding.agentId,
        busId,
        alreadyProvisioned: true,
      };
    }

    return {
      success: true,
      status: onboarding.status,
      microgridId: onboarding.microgridId,
      derId: onboarding.derId,
      agentId: onboarding.agentId,
      busId: busId ?? null,
      alreadyProvisioned: true,
    };
  }

  // Decrypt operational parameters safely
  let capacityKw = 50;
  let batteryCapacityKwh = 20;

  if (onboarding.hiddenCapacity) {
    try {
      capacityKw = Number(decrypt(onboarding.hiddenCapacity)) || 50;
    } catch {}
  }
  if (onboarding.hiddenBattery) {
    try {
      batteryCapacityKwh = Number(decrypt(onboarding.hiddenBattery)) || 20;
    } catch {}
  }

  const targetStatus = busId ? "ACTIVE" : "PENDING_GRID_MAPPING";

  // Execute atomic transactional provisioning
  return await prisma.$transaction(async (tx) => {
    // If busId is supplied, verify it exists inside the transaction
    let validatedBus: { id: string } | null = null;
    if (busId) {
      validatedBus = await tx.bus.findUnique({ where: { id: busId } });
      if (!validatedBus) {
        const error: any = new Error(`Target electrical bus '${busId}' does not exist.`);
        error.statusCode = 400;
        error.errorCode = "BUS_NOT_FOUND";
        throw error;
      }
    }

    // 1. Create Microgrid
    const externalCode = `MG-${onboarding.id.slice(0, 8).toUpperCase()}`;
    const microgrid = await tx.microgrid.create({
      data: {
        externalCode,
        name: onboarding.siteName || `Microgrid ${onboarding.id.slice(0, 8)}`,
        type: "PROSUMER",
        active: true,
        hiddenbatterycapacity: onboarding.hiddenBattery || encrypt("20"),
        hiddengenerationcost: onboarding.hiddenGenCost || encrypt("0.05"),
      },
    });

    // 2. Create DER
    const der = await tx.dER.create({
      data: {
        microgridId: microgrid.id,
        type: onboarding.derType || "SOLAR",
        ratedPowerKw: capacityKw,
        energyCapacityKwh: batteryCapacityKwh > 0 ? batteryCapacityKwh : null,
        minPowerKw: 0,
        maxPowerKw: capacityKw,
        efficiency: 0.95,
        metadata: {
          source: "onboarding",
          onboardingId: onboarding.id,
        },
      },
    });

    // 3. Create Bus Mapping if topology is provided
    if (validatedBus) {
      await tx.microgridBusMapping.create({
        data: {
          microgridId: microgrid.id,
          busId: validatedBus.id,
          phase: phase || "A",
        },
      });
    }

    // 4. Create Agent
    const agent = await tx.agent.create({
      data: {
        microgridId: microgrid.id,
        type: agentType || "PROSUMER",
        qre_lambda: 0.6,
      },
    });

    // 5. Create UserMicrogridMembership
    const membership = await tx.userMicrogridMembership.create({
      data: {
        userId: onboarding.userId,
        microgridId: microgrid.id,
        role: "OWNER",
      },
    });

    // 6. Update legacy User.microgridId for compatibility
    await tx.user.update({
      where: { id: onboarding.userId },
      data: { microgridId: microgrid.id },
    });

    // 7. Update UserOnboarding with resource links and status
    await tx.userOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: targetStatus,
        microgridId: microgrid.id,
        derId: der.id,
        agentId: agent.id,
      },
    });

    // 8. Append cryptographic AuditEvent
    await appendAuditEvent(tx as any, {
      eventType: "ONBOARDING_PROVISIONED",
      actorId,
      payload: {
        onboardingId: onboarding.id,
        userId: onboarding.userId,
        microgridId: microgrid.id,
        derId: der.id,
        agentId: agent.id,
        busId: validatedBus ? validatedBus.id : null,
        status: targetStatus,
      },
    });

    return {
      success: true,
      status: targetStatus,
      microgridId: microgrid.id,
      derId: der.id,
      agentId: agent.id,
      busId: validatedBus ? validatedBus.id : null,
      membershipId: membership.id,
      alreadyProvisioned: false,
    };
  });
}
