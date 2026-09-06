import { stabilityQueue, StabilityJobPayload } from "./index.js";

/**
 * Enqueues a stability check for a proposed coalition.
 * @param coalition Array of microgrid IDs in the proposed coalition
 */
export async function enqueueStabilityCheck(coalition: string[], surplusMap?: Record<string, number>) {
  const payload: StabilityJobPayload = { coalition, surplusMap };
  const delay = process.env.NODE_ENV === "test" || process.env.VITEST ? 100 : 1000;
  return await stabilityQueue.add("check-stability", payload, {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay,
    },
  });
}
