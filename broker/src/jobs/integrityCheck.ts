/**
 * broker/src/jobs/integrityCheck.ts
 * ─────────────────────────────────
 * Nightly Integrity Check Job
 * 
 * Recomputes checksums over the three audit tables (energytransfers, beliefupdates, rlrewards).
 * Compares against the previously stored checksum and row count in integrity_snapshots.
 * Alerts if any unexplained discrepancy (tampering) is detected.
 */

import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const AUDIT_TABLES = ["energytransfers", "beliefupdates", "rlrewards"] as const;

/**
 * Computes a deterministic SHA-256 hash for a set of rows.
 */
function computeHash(rows: any[]): string {
  const hash = crypto.createHash("sha256");
  for (const row of rows) {
    // Stringify with sorted keys for deterministic hashing
    const sortedObj: any = {};
    Object.keys(row).sort().forEach(key => {
      sortedObj[key] = row[key];
    });
    hash.update(JSON.stringify(sortedObj));
  }
  return hash.digest("hex");
}

let defaultPrisma: PrismaClient | null = null;

function getPrisma(client?: PrismaClient): PrismaClient {
  if (client) return client;
  if (!defaultPrisma) {
    defaultPrisma = new PrismaClient();
  }
  return defaultPrisma;
}

export async function disconnectIntegrityClient() {
  if (defaultPrisma) {
    await defaultPrisma.$disconnect();
    defaultPrisma = null;
  }
}

export async function runIntegrityCheck(client?: PrismaClient): Promise<boolean> {
  const prisma = getPrisma(client);
  let allIntact = true;

  console.log("[IntegrityCheck] Starting audit trail integrity verification...");

  for (const tableName of AUDIT_TABLES) {
    let rows: any[] = [];
    
    // Fetch all rows for the table, sorted by ID for consistent hashing
    if (tableName === "energytransfers") {
      rows = await prisma.energyTransfer.findMany({ orderBy: { id: "asc" } });
    } else if (tableName === "beliefupdates") {
      rows = await prisma.beliefUpdate.findMany({ orderBy: { id: "asc" } });
    } else if (tableName === "rlrewards") {
      rows = await prisma.rlReward.findMany({ orderBy: { id: "asc" } });
    }

    const currentCount = rows.length;
    const currentChecksum = computeHash(rows);

    // Fetch previous snapshot
    const prevSnapshot = await prisma.integritySnapshot.findFirst({
      where: { tableName },
      orderBy: { computedAt: "desc" }
    });

    if (prevSnapshot) {
      if (currentCount < prevSnapshot.rowCount) {
        console.error(`[ALERT] Row count decreased for ${tableName}! Expected >= ${prevSnapshot.rowCount}, got ${currentCount}. Tampering suspected.`);
        allIntact = false;
      } else {
        // If row count hasn't changed, checksums should match exactly.
        // If row count increased, the prefix of rows should match the previous checksum.
        // (For simplicity in this prompt, we just flag if the current state doesn't logically follow).
        // A strict append-only check would hash the first N rows (where N = prevSnapshot.rowCount)
        // and ensure it matches prevSnapshot.checksum.
        const prefixRows = rows.slice(0, prevSnapshot.rowCount);
        const prefixChecksum = computeHash(prefixRows);

        if (prefixChecksum !== prevSnapshot.checksum) {
          console.error(`[ALERT] Checksum mismatch for ${tableName}! Historical data was modified (UPDATE/DELETE). Tampering detected.`);
          allIntact = false;
        } else {
          console.log(`[IntegrityCheck] ${tableName} passed. (Count: ${currentCount})`);
        }
      }
    } else {
      console.log(`[IntegrityCheck] ${tableName} passed (initial snapshot). (Count: ${currentCount})`);
    }

    // Save new snapshot
    await prisma.integritySnapshot.create({
      data: {
        tableName,
        rowCount: currentCount,
        checksum: currentChecksum
      }
    });
  }

  return allIntact;
}
