/**
 * command-center/src/lib/adminOracleApi.ts
 * ─────────────────────────────────────────
 * Admin Oracle Source Management API Client (Phase 10 / Prompt 10.2).
 * Interfaces with /api/admin/oracle/* on the Broker.
 */

import { apiGet, apiPost, BROKER_URL } from "./apiClient";

export interface OracleSource {
  id: string;
  sourceType: string;
  sourceName: string | null;
  sourceUri: string | null;
  publisher: string | null;
  content: string;
  contentHash: string | null;
  observedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  trustScore: number | null;
  connectorVersion: string | null;
  embeddingModel: string | null;
  embeddingModelVersion: string | null;
  embeddingDimension: number | null;
  metadata: Record<string, unknown> | null;
  ingestedAt: string;
  status: "ACTIVE" | "REVOKED";
}

export interface OracleSourcesResponse {
  total: number;
  page: number;
  limit: number;
  sources: OracleSource[];
}

export interface SubmitOracleSourcePayload {
  content: string;
  sourceType: string;
  sourceName: string;
  publisher: string;
  sourceUri?: string | null;
  trustScore?: number;
  observedAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RetrievedAuditItem {
  id: string;
  query: string;
  documentIds: string[];
  similarityScore: number | null;
  ranking: number | null;
  modelVersion: string | null;
  timestamp: string;
}

export interface AuditLedgerEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  hash: string;
  previousHash: string | null;
  timestamp: string;
}

export interface OracleAuditsResponse {
  retrievedAudits: RetrievedAuditItem[];
  auditEvents: AuditLedgerEvent[];
}

export async function listOracleSources(
  params?: { status?: string; sourceType?: string; page?: number; limit?: number }
): Promise<OracleSourcesResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.sourceType) query.set("sourceType", params.sourceType);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  return apiGet<OracleSourcesResponse>(
    BROKER_URL,
    `/api/admin/oracle/sources${qs ? `?${qs}` : ""}`
  );
}

export async function submitOracleSource(
  payload: SubmitOracleSourcePayload
): Promise<OracleSource> {
  return apiPost<OracleSource>(
    BROKER_URL,
    "/api/admin/oracle/sources",
    payload
  );
}

export async function revokeOracleSource(
  id: string,
  reason?: string
): Promise<{ id: string; status: string; message: string }> {
  return apiPost<{ id: string; status: string; message: string }>(
    BROKER_URL,
    `/api/admin/oracle/sources/${encodeURIComponent(id)}/revoke`,
    { reason }
  );
}

export async function reingestOracleSource(
  id: string
): Promise<{ id: string; status: string; message: string }> {
  return apiPost<{ id: string; status: string; message: string }>(
    BROKER_URL,
    `/api/admin/oracle/sources/${encodeURIComponent(id)}/reingest`,
    {}
  );
}

export async function getOracleAudits(): Promise<OracleAuditsResponse> {
  return apiGet<OracleAuditsResponse>(
    BROKER_URL,
    "/api/admin/oracle/audits"
  );
}
