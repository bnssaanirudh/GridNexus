/**
 * command-center/src/lib/meApi.ts
 * ────────────────────────────────
 * Scoped DER-Owner API Client.
 * Queries /api/me/* routes on the Broker.
 * Authorization is derived from the user's JWT session.
 */

import { apiGet, apiPut, BROKER_URL } from "./apiClient";

export interface MyMicrogrid {
  id: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  role: string;
}

export interface MyDER {
  id: string;
  microgridId: string;
  type: string;
  ratedPowerKw: number;
  energyCapacityKwh: number | null;
  minPowerKw: number;
  maxPowerKw: number;
  efficiency: number;
  metadata?: {
    currentSoC?: number;
    [key: string]: unknown;
  } | null;
  createdAt: string;
}

export interface MyAgent {
  id: string;
  microgridId: string;
  type: string;
  qre_lambda: number | null;
  microgridName?: string;
}

export interface MyNegotiationRound {
  id: string;
  roundNumber: number;
  action: string;
  surplus: number;
  decisionSource: string;
  createdAt: string;
}

export interface MyNegotiation {
  id: string;
  status: string;
  sellerMicrogridId: string | null;
  buyerMicrogridId: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
  negotiationRounds?: MyNegotiationRound[];
}

export interface MySettlement {
  id: string;
  idempotencyKey: string;
  negotiationId: string;
  sellerMicrogridId: string;
  buyerMicrogridId: string;
  energyKwh: number;
  pricePerKwh: number;
  currency: string;
  deliveryStart: string;
  deliveryEnd: string;
  status: string;
  createdAt: string;
  stabilityCheckId?: string | null;
  gridCertificateId?: string | null;
}

export interface MyAnalytics {
  totalTradedKwh: number;
  totalSoldKwh: number;
  totalPurchasedKwh: number;
  totalRevenueUsd: number;
  totalCostUsd: number;
  activeNegotiations: number;
  committedSettlements: number;
  derCount: number;
  totalCapacityKw: number;
  totalBatteryKwh: number;
}

export interface MyPreferences {
  id?: string;
  microgridId: string;
  tradingEnabled: boolean;
  minimumBatteryReservePct: number;
  maximumDailyExportKwh: number | null;
  minimumPreferredSalePrice: number | null;
  maximumPreferredBuyPrice: number | null;
  riskProfile: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE" | string;
  maxTransactionSizeKwh: number | null;
  updatedAt?: string;
}

export interface MyAuditEvent {
  id: string;
  sequence: number;
  eventType: string;
  negotiationId: string | null;
  actorId: string | null;
  previousHash: string;
  eventHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OracleSummary {
  status: "NORMAL" | "CONGESTED" | "CRITICAL" | "SURPLUS";
  recommendation: "HOLD" | "CHARGE" | "DISCHARGE";
  confidence: number;
  signalTime: string;
  frequencyHz: number;
  lossFactor: number;
}

export async function getMyMicrogrids(): Promise<MyMicrogrid[]> {
  return apiGet<MyMicrogrid[]>(BROKER_URL, "/api/me/microgrids");
}

export async function getMyDERs(): Promise<MyDER[]> {
  return apiGet<MyDER[]>(BROKER_URL, "/api/me/ders");
}

export async function getMyAgent(): Promise<MyAgent> {
  return apiGet<MyAgent>(BROKER_URL, "/api/me/agent");
}

export async function getMyNegotiations(limit = 10, skip = 0): Promise<MyNegotiation[]> {
  return apiGet<MyNegotiation[]>(BROKER_URL, `/api/me/negotiations?limit=${limit}&skip=${skip}`);
}

export async function getMySettlements(limit = 10, skip = 0): Promise<MySettlement[]> {
  return apiGet<MySettlement[]>(BROKER_URL, `/api/me/settlements?limit=${limit}&skip=${skip}`);
}

export async function getMyAnalytics(): Promise<MyAnalytics> {
  return apiGet<MyAnalytics>(BROKER_URL, "/api/me/analytics");
}

export async function getMyAuditEvents(limit = 20, skip = 0): Promise<MyAuditEvent[]> {
  return apiGet<MyAuditEvent[]>(BROKER_URL, `/api/me/audit?limit=${limit}&skip=${skip}`);
}

export async function getMyPreferences(microgridId?: string): Promise<MyPreferences> {
  const q = microgridId ? `?microgridId=${encodeURIComponent(microgridId)}` : "";
  return apiGet<MyPreferences>(BROKER_URL, `/api/me/preferences${q}`);
}

export async function updateMyPreferences(updates: Partial<MyPreferences>): Promise<MyPreferences> {
  return apiPut<MyPreferences>(BROKER_URL, "/api/me/preferences", updates);
}

export interface ExplanationFactor {
  category: string;
  factor: string;
  impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "CONSTRAINT";
  metricValue?: string | number;
}

export interface DecisionExplanation {
  id: string;
  negotiationId: string;
  roundNumber: number;
  decision: string;
  offeredPrice: number;
  energyKwh: number;
  confidence: number;
  decisionSource: string;
  topFactors: string[];
  detailedFactors?: ExplanationFactor[];
  ownerConstraintsSatisfied: boolean;
  stabilityStatus: "STABLE" | "UNSTABLE" | "NOT_EVALUATED";
  gridStatus: "FEASIBLE" | "VIOLATION_DETECTED" | "NOT_EVALUATED";
  oracleSignalIds: string[];
  evidenceIds: {
    roundId?: string;
    beliefUpdateId?: string;
    stabilityCheckId?: string;
    gridCertificateId?: string;
    reasoningDeficitId?: string;
    settlementId?: string;
  };
  timestamp: string;
}

export async function getMyExplanations(
  limit = 10,
  skip = 0,
  negotiationId?: string
): Promise<DecisionExplanation[]> {
  const q = negotiationId ? `&negotiationId=${encodeURIComponent(negotiationId)}` : "";
  return apiGet<DecisionExplanation[]>(BROKER_URL, `/api/me/explanations?limit=${limit}&skip=${skip}${q}`);
}

export async function getMyNegotiationExplanation(
  negotiationId: string
): Promise<DecisionExplanation[]> {
  return apiGet<DecisionExplanation[]>(
    BROKER_URL,
    `/api/me/negotiations/${encodeURIComponent(negotiationId)}/explanation`
  );
}

