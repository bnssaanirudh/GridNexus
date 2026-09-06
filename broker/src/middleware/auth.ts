/**
 * broker/src/middleware/auth.ts
 * ─────────────────────────────
 * JWT authentication middleware for GridNexus broker.
 *
 * Architecture: OIDC-ready local JWT.
 * - /auth/login issues JWTs from local User table.
 * - This middleware verifies them.
 * - Swap verify logic for OIDC discovery/JWKS when migrating to external IdP.
 *
 * Token payload shape:
 *   { sub: userId, email, role, microgridId? }
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "./rbac.js";
import { hasAnyRole } from "./rbac.js";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  microgridId?: string;
  microgridIds?: string[];
}

// Extend Express Request to carry the decoded user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is missing.");
  if (secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  return secret;
};

/**
 * Verifies the Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user.
 * Returns 401 if missing or invalid, 403 if role requirement not met.
 *
 * @param requiredRoles - If provided, user must have one of these roles.
 */
export function requireAuth(requiredRoles?: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or malformed Authorization header." });
      return;
    }

    const token = authHeader.slice(7);
    let payload: jwt.JwtPayload;

    try {
      payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    } catch (err) {
      const isExpired = err instanceof jwt.TokenExpiredError;
      res.status(401).json({
        error: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        message: isExpired ? "JWT has expired." : "JWT signature verification failed.",
      });
      return;
    }

    const user: AuthenticatedUser = {
      userId: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
      microgridId: payload.microgridId as string | undefined,
      microgridIds: payload.microgridIds as string[] | undefined,
    };
    req.user = user;

    if (requiredRoles && requiredRoles.length > 0) {
      if (!hasAnyRole(user.role, requiredRoles)) {
        res.status(403).json({
          error: "FORBIDDEN",
          message: `Role '${user.role}' is not permitted. Required: ${requiredRoles.join(" | ")}.`,
        });
        return;
      }
    }

    next();
  };
}

/**
 * Verifies a Socket.IO handshake auth token.
 * @returns decoded user payload or throws
 */
export function verifySocketToken(token: string): AuthenticatedUser {
  const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
  return {
    userId: payload.sub as string,
    email: payload.email as string,
    role: payload.role as string,
    microgridId: payload.microgridId as string | undefined,
    microgridIds: payload.microgridIds as string[] | undefined,
  };
}

/** Issues a signed JWT for the given user. Used by /auth/login. */
export function signToken(user: AuthenticatedUser): string {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "8h";
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
      role: user.role,
      microgridId: user.microgridId,
      microgridIds: user.microgridIds,
    },
    secret,
    { expiresIn } as jwt.SignOptions
  );
}
