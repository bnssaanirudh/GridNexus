/**
 * broker/src/services/preferenceService.ts
 * ─────────────────────────────────────────
 * Owner Trading Preferences & Safety Constraints Service.
 *
 * Enforces owner-configured boundaries on autonomous agents:
 * - Trading enabled/disabled
 * - Minimum battery reserve %
 * - Maximum daily export kWh
 * - Minimum preferred sale price
 * - Maximum preferred buy price
 * - Maximum transaction size kWh
 * - Risk profile (CONSERVATIVE | BALANCED | AGGRESSIVE)
 */

import { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export const RISK_PROFILES = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as const;
export type RiskProfile = (typeof RISK_PROFILES)[number];

export interface TradingPreferenceInput {
  tradingEnabled?: boolean;
  minimumBatteryReservePct?: number;
  maximumDailyExportKwh?: number | null;
  minimumPreferredSalePrice?: number | null;
  maximumPreferredBuyPrice?: number | null;
  riskProfile?: RiskProfile;
  maxTransactionSizeKwh?: number | null;
}

export interface TradingPreferenceRecord {
  id?: string;
  microgridId: string;
  tradingEnabled: boolean;
  minimumBatteryReservePct: number;
  maximumDailyExportKwh: number | null;
  minimumPreferredSalePrice: number | null;
  maximumPreferredBuyPrice: number | null;
  riskProfile: string;
  maxTransactionSizeKwh: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export const DEFAULT_PREFERENCES = {
  tradingEnabled: true,
  minimumBatteryReservePct: 20.0,
  maximumDailyExportKwh: null,
  minimumPreferredSalePrice: null,
  maximumPreferredBuyPrice: null,
  riskProfile: "BALANCED",
  maxTransactionSizeKwh: null,
};

/**
 * Validates preference update fields.
 * Throws an Error with descriptive message on invalid input.
 */
export function validatePreferenceInput(input: TradingPreferenceInput): void {
  if (input.tradingEnabled !== undefined && typeof input.tradingEnabled !== "boolean") {
    throw new Error("tradingEnabled must be a boolean");
  }

  if (input.minimumBatteryReservePct !== undefined && input.minimumBatteryReservePct !== null) {
    const val = Number(input.minimumBatteryReservePct);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      throw new Error("minimumBatteryReservePct must be a number between 0 and 100");
    }
  }

  if (input.maximumDailyExportKwh !== undefined && input.maximumDailyExportKwh !== null) {
    const val = Number(input.maximumDailyExportKwh);
    if (!Number.isFinite(val) || val < 0) {
      throw new Error("maximumDailyExportKwh must be a non-negative number");
    }
  }

  if (input.minimumPreferredSalePrice !== undefined && input.minimumPreferredSalePrice !== null) {
    const val = Number(input.minimumPreferredSalePrice);
    if (!Number.isFinite(val) || val < 0) {
      throw new Error("minimumPreferredSalePrice must be a non-negative number");
    }
  }

  if (input.maximumPreferredBuyPrice !== undefined && input.maximumPreferredBuyPrice !== null) {
    const val = Number(input.maximumPreferredBuyPrice);
    if (!Number.isFinite(val) || val < 0) {
      throw new Error("maximumPreferredBuyPrice must be a non-negative number");
    }
  }

  if (input.maxTransactionSizeKwh !== undefined && input.maxTransactionSizeKwh !== null) {
    const val = Number(input.maxTransactionSizeKwh);
    if (!Number.isFinite(val) || val <= 0) {
      throw new Error("maxTransactionSizeKwh must be a positive number");
    }
  }

  if (input.riskProfile !== undefined) {
    if (!RISK_PROFILES.includes(input.riskProfile as RiskProfile)) {
      throw new Error(`riskProfile must be one of: ${RISK_PROFILES.join(", ")}`);
    }
  }
}

/**
 * Retrieves preferences for a microgrid, returning defaults if not yet customized.
 */
export async function getPreferences(
  microgridId: string,
  dbClient: PrismaClient = prisma
): Promise<TradingPreferenceRecord> {
  if (!dbClient?.tradingPreference?.findUnique) {
    return {
      microgridId,
      ...DEFAULT_PREFERENCES,
    };
  }

  const existing = await dbClient.tradingPreference.findUnique({
    where: { microgridId },
  });

  if (!existing) {
    return {
      microgridId,
      ...DEFAULT_PREFERENCES,
    };
  }

  return {
    id: existing.id,
    microgridId: existing.microgridId,
    tradingEnabled: existing.tradingEnabled,
    minimumBatteryReservePct: Number(existing.minimumBatteryReservePct),
    maximumDailyExportKwh:
      existing.maximumDailyExportKwh !== null ? Number(existing.maximumDailyExportKwh) : null,
    minimumPreferredSalePrice:
      existing.minimumPreferredSalePrice !== null
        ? Number(existing.minimumPreferredSalePrice)
        : null,
    maximumPreferredBuyPrice:
      existing.maximumPreferredBuyPrice !== null
        ? Number(existing.maximumPreferredBuyPrice)
        : null,
    riskProfile: existing.riskProfile,
    maxTransactionSizeKwh:
      existing.maxTransactionSizeKwh !== null ? Number(existing.maxTransactionSizeKwh) : null,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  };
}

/**
 * Upserts trading preferences for a microgrid.
 */
export async function upsertPreferences(
  microgridId: string,
  updates: TradingPreferenceInput,
  dbClient: PrismaClient = prisma
): Promise<TradingPreferenceRecord> {
  validatePreferenceInput(updates);

  const dataToSave: Record<string, unknown> = {};
  if (updates.tradingEnabled !== undefined) dataToSave.tradingEnabled = updates.tradingEnabled;
  if (updates.minimumBatteryReservePct !== undefined)
    dataToSave.minimumBatteryReservePct = updates.minimumBatteryReservePct;
  if (updates.maximumDailyExportKwh !== undefined)
    dataToSave.maximumDailyExportKwh = updates.maximumDailyExportKwh;
  if (updates.minimumPreferredSalePrice !== undefined)
    dataToSave.minimumPreferredSalePrice = updates.minimumPreferredSalePrice;
  if (updates.maximumPreferredBuyPrice !== undefined)
    dataToSave.maximumPreferredBuyPrice = updates.maximumPreferredBuyPrice;
  if (updates.riskProfile !== undefined) dataToSave.riskProfile = updates.riskProfile;
  if (updates.maxTransactionSizeKwh !== undefined)
    dataToSave.maxTransactionSizeKwh = updates.maxTransactionSizeKwh;

  const result = await dbClient.tradingPreference.upsert({
    where: { microgridId },
    update: dataToSave,
    create: {
      microgridId,
      tradingEnabled: updates.tradingEnabled ?? DEFAULT_PREFERENCES.tradingEnabled,
      minimumBatteryReservePct:
        updates.minimumBatteryReservePct ?? DEFAULT_PREFERENCES.minimumBatteryReservePct,
      maximumDailyExportKwh:
        updates.maximumDailyExportKwh !== undefined
          ? updates.maximumDailyExportKwh
          : DEFAULT_PREFERENCES.maximumDailyExportKwh,
      minimumPreferredSalePrice:
        updates.minimumPreferredSalePrice !== undefined
          ? updates.minimumPreferredSalePrice
          : DEFAULT_PREFERENCES.minimumPreferredSalePrice,
      maximumPreferredBuyPrice:
        updates.maximumPreferredBuyPrice !== undefined
          ? updates.maximumPreferredBuyPrice
          : DEFAULT_PREFERENCES.maximumPreferredBuyPrice,
      riskProfile: updates.riskProfile ?? DEFAULT_PREFERENCES.riskProfile,
      maxTransactionSizeKwh:
        updates.maxTransactionSizeKwh !== undefined
          ? updates.maxTransactionSizeKwh
          : DEFAULT_PREFERENCES.maxTransactionSizeKwh,
    },
  });

  return {
    id: result.id,
    microgridId: result.microgridId,
    tradingEnabled: result.tradingEnabled,
    minimumBatteryReservePct: Number(result.minimumBatteryReservePct),
    maximumDailyExportKwh:
      result.maximumDailyExportKwh !== null ? Number(result.maximumDailyExportKwh) : null,
    minimumPreferredSalePrice:
      result.minimumPreferredSalePrice !== null ? Number(result.minimumPreferredSalePrice) : null,
    maximumPreferredBuyPrice:
      result.maximumPreferredBuyPrice !== null ? Number(result.maximumPreferredBuyPrice) : null,
    riskProfile: result.riskProfile,
    maxTransactionSizeKwh:
      result.maxTransactionSizeKwh !== null ? Number(result.maxTransactionSizeKwh) : null,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export interface ValidateActionParams {
  microgridId: string;
  agentId: string;
  role: "SELLER" | "BUYER";
  action: "COUNTER_OFFER" | "ACCEPT";
  price: number;
  kwh: number;
}

export interface ValidationResult {
  satisfied: boolean;
  reason?: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Enforces owner constraints server-side for a proposed negotiation action.
 */
export async function validateActionAgainstPreferences(
  params: ValidateActionParams,
  dbClient: PrismaClient = prisma
): Promise<ValidationResult> {
  const { microgridId, role, price, kwh } = params;
  const pref = await getPreferences(microgridId, dbClient);

  // 1. Trading enabled check
  if (!pref.tradingEnabled) {
    return {
      satisfied: false,
      code: "TRADING_DISABLED",
      reason: `Trading is disabled by owner preferences for microgrid ${microgridId}.`,
      details: { microgridId },
    };
  }

  // 2. Transaction size limit check
  if (pref.maxTransactionSizeKwh !== null && kwh > pref.maxTransactionSizeKwh) {
    return {
      satisfied: false,
      code: "MAX_TRANSACTION_SIZE_EXCEEDED",
      reason: `Proposed transaction size ${kwh} kWh exceeds maximum allowed size of ${pref.maxTransactionSizeKwh} kWh.`,
      details: { proposedKwh: kwh, maxAllowedKwh: pref.maxTransactionSizeKwh },
    };
  }

  // 3. Seller-specific constraints
  if (role === "SELLER") {
    // Minimum preferred sale price
    if (pref.minimumPreferredSalePrice !== null && price < pref.minimumPreferredSalePrice) {
      return {
        satisfied: false,
        code: "SALE_PRICE_BELOW_MINIMUM",
        reason: `Proposed sale price $${price.toFixed(4)}/kWh is below owner minimum preferred sale price of $${pref.minimumPreferredSalePrice.toFixed(4)}/kWh.`,
        details: { proposedPrice: price, minimumSalePrice: pref.minimumPreferredSalePrice },
      };
    }

    // Daily export limit
    if (pref.maximumDailyExportKwh !== null && dbClient?.settlement?.findMany) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const committedSettlements = await dbClient.settlement.findMany({
        where: {
          sellerMicrogridId: microgridId,
          status: "COMMITTED",
          createdAt: { gte: startOfDay },
        },
        select: { energyKwh: true },
      });

      const todayExportKwh = committedSettlements.reduce(
        (sum, s) => sum + Number(s.energyKwh),
        0
      );

      if (todayExportKwh + kwh > pref.maximumDailyExportKwh) {
        const remainingQuota = Math.max(0, pref.maximumDailyExportKwh - todayExportKwh);
        return {
          satisfied: false,
          code: "DAILY_EXPORT_EXCEEDED",
          reason: `Exporting ${kwh} kWh would exceed daily export limit of ${pref.maximumDailyExportKwh} kWh (${todayExportKwh.toFixed(2)} kWh already committed, ${remainingQuota.toFixed(2)} kWh remaining).`,
          details: {
            proposedKwh: kwh,
            todayExportKwh,
            dailyLimitKwh: pref.maximumDailyExportKwh,
          },
        };
      }
    }

    // Battery reserve constraint
    if (
      pref.minimumBatteryReservePct !== null &&
      pref.minimumBatteryReservePct > 0 &&
      dbClient?.dER?.findMany
    ) {
      const batteryDers = await dbClient.dER.findMany({
        where: {
          microgridId,
          type: { in: ["BATTERY", "STORAGE", "BESS"] },
        },
      });

      for (const der of batteryDers) {
        if (der.energyCapacityKwh) {
          const cap = Number(der.energyCapacityKwh);
          const meta = der.metadata as Record<string, unknown> | null;
          const directSoc = (der as any).currentSoC;
          const rawSoc =
            directSoc !== undefined && directSoc !== null
              ? Number(directSoc)
              : meta && meta.currentSoC !== undefined && meta.currentSoC !== null
                ? Number(meta.currentSoC)
                : null;

          if (rawSoc !== null) {
            const socRatio = rawSoc > 1.0 ? rawSoc / 100.0 : rawSoc;
            const currentEnergy = cap * socRatio;
            const remainingEnergy = currentEnergy - kwh;
            const minReserveRatio = pref.minimumBatteryReservePct / 100.0;
            const minReserveEnergy = cap * minReserveRatio;

            if (remainingEnergy < minReserveEnergy) {
              return {
                satisfied: false,
                code: "BATTERY_RESERVE_VIOLATION",
                reason: `Exporting ${kwh} kWh would reduce battery reserve below owner minimum of ${pref.minimumBatteryReservePct}% (remaining: ${((remainingEnergy / cap) * 100).toFixed(1)}%).`,
                details: {
                  proposedKwh: kwh,
                  capacityKwh: cap,
                  currentSocPct: socRatio * 100,
                  minReservePct: pref.minimumBatteryReservePct,
                },
              };
            }
          }
        }
      }
    }
  }

  // 4. Buyer-specific constraints
  if (role === "BUYER") {
    // Maximum preferred buy price
    if (pref.maximumPreferredBuyPrice !== null && price > pref.maximumPreferredBuyPrice) {
      return {
        satisfied: false,
        code: "BUY_PRICE_ABOVE_MAXIMUM",
        reason: `Proposed buy price $${price.toFixed(4)}/kWh is above owner maximum preferred buy price of $${pref.maximumPreferredBuyPrice.toFixed(4)}/kWh.`,
        details: { proposedPrice: price, maximumBuyPrice: pref.maximumPreferredBuyPrice },
      };
    }
  }

  return { satisfied: true };
}
