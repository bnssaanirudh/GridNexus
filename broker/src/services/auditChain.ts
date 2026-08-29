/**
 * broker/src/services/auditChain.ts
 * ──────────────────────────────────
 * Cryptographic SHA-256 append chain for AuditEvent records.
 *
 * eventHash = SHA-256(previousHash || canonicalPayloadJSON)
 *
 * The genesis event uses previousHash = "0".
 * All subsequent events chain from the prior event's hash.
 *
 * Designed to run inside an existing Prisma transaction (txClient).
 */

import crypto from "crypto";

type TxClient = {
  auditEvent: {
    findFirst: (args: object) => Promise<{ eventHash: string; sequence: number } | null>;
    create: (args: object) => Promise<{ id: string; sequence: number; eventHash: string }>;
  };
};

export interface AppendAuditEventArgs {
  eventType: string;
  negotiationId?: string;
  actorId?: string;
  payload: Record<string, unknown>;
}

/** Canonical JSON: sorted keys, no extra whitespace */
function canonicalJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** SHA-256 hex digest */
function sha256(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Appends a new AuditEvent to the hash chain.
 * Must be called within a Prisma transaction.
 *
 * @param txClient - Prisma transaction client
 * @param args - Event details
 * @returns The created AuditEvent with its sequence and hash
 */
export async function appendAuditEvent(
  txClient: TxClient,
  args: AppendAuditEventArgs
): Promise<{ id: string; sequence: number; eventHash: string }> {
  // Fetch the latest event's hash to chain from (lock via ordering in tx)
  const lastEvent = await txClient.auditEvent.findFirst({
    where: {},
    orderBy: { sequence: "desc" } as object,
    select: { eventHash: true, sequence: true } as object,
  } as object);

  const previousHash = lastEvent?.eventHash ?? "0";

  const canonical = canonicalJson({
    ...args.payload,
    eventType: args.eventType,
    negotiationId: args.negotiationId ?? null,
    actorId: args.actorId ?? null,
  });

  const eventHash = sha256(previousHash + canonical);

  return txClient.auditEvent.create({
    data: {
      eventType: args.eventType,
      negotiationId: args.negotiationId,
      actorId: args.actorId,
      previousHash,
      eventHash,
      payload: args.payload as object,
    } as object,
  });
}

/** Utility: compute expected hash for a given event (for verification) */
export function computeEventHash(previousHash: string, payload: Record<string, unknown>, eventType: string, negotiationId?: string, actorId?: string): string {
  const canonical = canonicalJson({
    ...payload,
    eventType,
    negotiationId: negotiationId ?? null,
    actorId: actorId ?? null,
  });
  return sha256(previousHash + canonical);
}
