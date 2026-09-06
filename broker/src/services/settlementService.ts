/**
 * broker/src/services/settlementService.ts
 * ─────────────────────────────────────────
 * Settlement lifecycle management with idempotency guarantees.
 *
 * States: PROVISIONAL → VERIFYING → COMMITTING → COMMITTED / FAILED
 *
 * Idempotency: idempotencyKey is a UNIQUE constraint in the DB.
 * Repeated calls with the same key return the existing settlement without
 * creating a duplicate EnergyTransfer.
 */

import { PrismaClient } from "@prisma/client";
import { appendAuditEvent } from "./auditChain.js";

const prisma = new PrismaClient();

export interface SettlementInput {
  idempotencyKey: string;
  negotiationId: string;
  sellerMicrogridId: string;
  buyerMicrogridId: string;
  energyKwh: number;
  pricePerKwh: number;
  currency?: string;
  deliveryStart: Date;
  deliveryEnd: Date;
  stabilityCheckId?: string;
  gridCertificateId?: string;
  actorId?: string;
  /** Pre-existing EnergyTransfer data to record */
  energyTransferData?: {
    amount: number;
    price: number;
    startTime: Date;
    intervalMinutes: number;
    averagePowerKw: number;
    stabilitycheckid: string;
    gridcertificateid: string;
  };
  rlRewardData?: {
    agentId: string;
    rewardValue: number;
  };
  negotiationRoundData?: {
    roundNumber: number;
    activeAgentId: string;
    opponentAgentId: string;
    action: string;
    surplus: number;
    decisionSource?: string;
  };
}

export type SettlementResult = {
  settlement: { id: string; status: string; idempotencyKey: string };
  wasIdempotent: boolean;
};

/**
 * Creates a settlement atomically with the full evidence chain.
 * If `idempotencyKey` already exists, returns the existing record (idempotent).
 *
 * Transaction scope:
 * 1. Check idempotency
 * 2. Set Negotiation → PROVISIONALLY_ACCEPTED
 * 3. Create Settlement (PROVISIONAL)
 * 4. Run verifications (external, pre-checked by caller)
 * 5. Create EnergyTransfer
 * 6. Create NegotiationRound
 * 7. Create RlReward
 * 8. Append AuditEvents (SETTLEMENT_PROVISIONAL → SETTLEMENT_COMMITTED)
 * 9. Set Negotiation → COMMITTED, Settlement → COMMITTED
 */
export async function commitSettlement(input: SettlementInput): Promise<SettlementResult> {
  return prisma.$transaction(async (tx) => {
    // ── 1. Idempotency check ────────────────────────────────────────────
    const existing = await tx.settlement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, status: true, idempotencyKey: true },
    });
    if (existing) {
      return { settlement: existing, wasIdempotent: true };
    }

    // ── 2. Mark negotiation PROVISIONALLY_ACCEPTED ──────────────────────
    await tx.negotiation.update({
      where: { id: input.negotiationId },
      data: { status: "PROVISIONALLY_ACCEPTED" },
    });

    // ── 3. Create Settlement (COMMITTED directly due to append-only) ────
    const settlement = await tx.settlement.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        negotiationId: input.negotiationId,
        sellerMicrogridId: input.sellerMicrogridId,
        buyerMicrogridId: input.buyerMicrogridId,
        energyKwh: input.energyKwh,
        pricePerKwh: input.pricePerKwh,
        currency: input.currency ?? "USD",
        deliveryStart: input.deliveryStart,
        deliveryEnd: input.deliveryEnd,
        status: "COMMITTED",
        stabilityCheckId: input.stabilityCheckId,
        gridCertificateId: input.gridCertificateId,
      },
    });

    // ── 4. Append provisional audit event ───────────────────────────────
    await appendAuditEvent(tx as any, {
      eventType: "SETTLEMENT_PROVISIONAL",
      negotiationId: input.negotiationId,
      actorId: input.actorId,
      payload: {
        settlementId: settlement.id,
        idempotencyKey: input.idempotencyKey,
        energyKwh: input.energyKwh,
        pricePerKwh: input.pricePerKwh,
        currency: input.currency ?? "USD",
      },
    });

    // ── 5. Create EnergyTransfer ─────────────────────────────────────────
    if (input.energyTransferData) {
      const et = input.energyTransferData;
      await tx.energyTransfer.create({
        data: {
          fromMicrogridId: input.sellerMicrogridId,
          toMicrogridId: input.buyerMicrogridId,
          amount: et.amount,
          price: et.price,
          currency: input.currency ?? "USD",
          energyUnit: "kWh",
          status: "COMMITTED",
          startTime: et.startTime,
          intervalMinutes: et.intervalMinutes,
          energyKwh: input.energyKwh,
          averagePowerKw: et.averagePowerKw,
          stabilitycheckid: et.stabilitycheckid,
          gridcertificateid: et.gridcertificateid,
          negotiationId: input.negotiationId,
          settlementId: settlement.id,
        },
      });
    }

    // ── 6. Create NegotiationRound ───────────────────────────────────────
    if (input.negotiationRoundData) {
      const nr = input.negotiationRoundData;
      await tx.negotiationRound.create({
        data: {
          negotiationId: input.negotiationId,
          roundNumber: nr.roundNumber,
          activeAgentId: nr.activeAgentId,
          opponentAgentId: nr.opponentAgentId,
          action: nr.action,
          surplus: nr.surplus,
          decisionSource: nr.decisionSource ?? "LLM",
        },
      });
    }

    // ── 7. Create RlReward ───────────────────────────────────────────────
    if (input.rlRewardData) {
      const rr = input.rlRewardData;
      await tx.rlReward.create({
        data: {
          agentId: rr.agentId,
          negotiationId: input.negotiationId,
          rewardValue: rr.rewardValue,
        },
      });
    }

    // ── 8. Commit negotiation ───────────────────────────────
    await tx.negotiation.update({
      where: { id: input.negotiationId },
      data: { status: "COMMITTED" },
    });

    // ── 9. Append committed audit event ─────────────────────────────────
    await appendAuditEvent(tx as any, {
      eventType: "SETTLEMENT_COMMITTED",
      negotiationId: input.negotiationId,
      actorId: input.actorId,
      payload: {
        settlementId: settlement.id,
        energyKwh: input.energyKwh,
        pricePerKwh: input.pricePerKwh,
      },
    });

    return {
      settlement: { id: settlement.id, status: "COMMITTED", idempotencyKey: input.idempotencyKey },
      wasIdempotent: false,
    };
  }, {
    maxWait: 10000,
    timeout: 30000,
    isolationLevel: "Serializable",
  });
}
