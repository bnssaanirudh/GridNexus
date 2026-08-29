/**
 * broker/src/middleware/rbac.ts
 * ─────────────────────────────
 * Role constants and authorization helpers for GridNexus.
 */

export const Role = {
  ADMIN: "ADMIN",
  GRID_OPERATOR: "GRID_OPERATOR",
  DER_OWNER: "DER_OWNER",
  AUDITOR: "AUDITOR",
  VIEWER: "VIEWER",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Hierarchy: higher index = more privileged. */
const ROLE_HIERARCHY: Role[] = [
  Role.VIEWER,
  Role.AUDITOR,
  Role.DER_OWNER,
  Role.GRID_OPERATOR,
  Role.ADMIN,
];

/** Returns true if `userRole` is at least as privileged as `requiredRole`. */
export function roleAtLeast(userRole: string, requiredRole: Role): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(userRole as Role);
  const reqIdx = ROLE_HIERARCHY.indexOf(requiredRole);
  return userIdx >= reqIdx;
}

/** Returns true if `userRole` is one of the allowed roles. */
export function hasAnyRole(userRole: string, allowed: Role[]): boolean {
  return allowed.includes(userRole as Role);
}
