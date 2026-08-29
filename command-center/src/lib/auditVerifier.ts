/**
 * command-center/src/lib/auditVerifier.ts
 * ─────────────────────────────────────────
 * Client-side SHA-256 hash computation for audit chain verification.
 * Must match the algorithm in broker/src/services/auditChain.ts exactly.
 */

/** Canonical JSON — sorted keys, no whitespace (matches server-side) */
function canonicalJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** SHA-256 hex digest using Web Crypto API */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes the expected event hash for a given event.
 * Used in the frontend audit chain verifier.
 */
export function computeEventHash(
  previousHash: string,
  payload: Record<string, unknown>,
  eventType: string,
  negotiationId?: string,
  actorId?: string
): Promise<string> {
  const canonical = canonicalJson({
    ...payload,
    eventType,
    negotiationId: negotiationId ?? null,
    actorId: actorId ?? null,
  });
  return sha256Hex(previousHash + canonical);
}
