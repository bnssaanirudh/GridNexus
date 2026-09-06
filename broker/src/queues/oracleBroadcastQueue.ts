/**
 * broker/src/queues/oracleBroadcastQueue.ts
 * ──────────────────────────────────────────
 * Oracle Broadcast Queue
 *
 * Registers the `oracle-broadcast-jobs` BullMQ queue and a configurable
 * repeatable scheduler that fires an oracle broadcast cycle at a fixed
 * interval.  The interval is read from:
 *
 *   ORACLE_BROADCAST_INTERVAL_MS  (default: 60 000 ms)
 *
 * ASSUMPTION : A single repeatable job key is used
 * ("oracle-broadcast-cycle"). Any existing repeatable with the same key is
 * removed and replaced so a restart never creates duplicates.
 */

import { Queue } from "bullmq";
import { connection, qPrefix } from "./index.js";
import dotenv from "dotenv";

dotenv.config();

/** Payload carried by each oracle broadcast job (intentionally minimal). */
export interface OracleBroadcastJobPayload {
  /** ISO timestamp of when the job was scheduled (for log correlation). */
  scheduledAt: string;
}

/** The BullMQ queue for oracle broadcast cycles. */
export const oracleBroadcastQueue = new Queue<OracleBroadcastJobPayload>(
  `${qPrefix}oracle-broadcast-jobs`,
  { connection }
);

const ORACLE_JOB_KEY = "oracle-broadcast-cycle";

/**
 * Registers a BullMQ repeatable job scheduler that fires on the configured
 * interval.  Uses the v6 `upsertJobScheduler` API – idempotent on repeat calls.
 *
 * @param intervalMs - How often to fire (ms). Defaults to
 *   ORACLE_BROADCAST_INTERVAL_MS env var or 60 000.
 */
export async function scheduleOracleBroadcast(
  intervalMs: number = parseInt(
    process.env.ORACLE_BROADCAST_INTERVAL_MS ?? "60000",
    10
  )
): Promise<void> {
  // upsertJobScheduler is idempotent – calling it with the same schedulerId
  // simply updates the interval if it changed.  This is the BullMQ v6 API
  // replacing the deprecated getRepeatableJobs / removeRepeatableByKey.
  await oracleBroadcastQueue.upsertJobScheduler(
    ORACLE_JOB_KEY,
    { every: intervalMs },
    {
      name: ORACLE_JOB_KEY,
      data: { scheduledAt: new Date().toISOString() },
    }
  );

  console.log(
    `[OracleBroadcast] Repeatable job scheduled every ${intervalMs} ms`
  );
}

