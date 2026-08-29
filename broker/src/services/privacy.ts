/**
 * broker/src/services/privacy.ts
 * ─────────────────────────────────────────────────────────────
 * Privacy aggregation and differential privacy utility functions.
 * 
 * Protects microgrid and DER identities when publishing analytics or telemetry.
 */

interface AggregationOptions {
  minCohortSize?: number; // k-anonymity parameter
}

/**
 * Aggregation Guard: Ensures that group sizes meet a minimum `k` before returning results.
 * @param cohort The cohort of elements being aggregated.
 * @param minCohortSize The minimum allowed cohort size for k-anonymity (default 3).
 * @throws Error if the cohort size is smaller than minCohortSize.
 */
export function enforceAggregationGuard<T>(cohort: T[], minCohortSize: number = 3): T[] {
  if (!cohort || cohort.length < minCohortSize) {
    throw new Error(`PRIVACY_VIOLATION: Cohort size ${cohort ? cohort.length : 0} is below the minimum required k-anonymity threshold (${minCohortSize}).`);
  }
  return cohort;
}

/**
 * Differential Privacy Noise Injection.
 * Injects Laplacian noise into a telemetry metric to provide epsilon-differential privacy.
 * 
 * NOTE: This must NOT be used on exact economic settlements, only on published analytics/telemetry.
 * 
 * @param value The exact true value
 * @param epsilon Privacy budget (smaller epsilon = more privacy = more noise)
 * @param sensitivity The sensitivity of the query (e.g. max possible change from one individual)
 * @returns Noised value
 */
export function addLaplaceNoise(value: number, epsilon: number, sensitivity: number = 1.0): number {
  if (epsilon <= 0) throw new Error("Epsilon must be greater than 0");
  
  const scale = sensitivity / epsilon;
  // Generate Laplace noise using uniform random
  const u = Math.random() - 0.5; // [-0.5, 0.5)
  const sign = Math.sign(u) !== 0 ? Math.sign(u) : 1;
  const noise = -scale * sign * Math.log(1 - 2 * Math.abs(u));
  
  return value + noise;
}
