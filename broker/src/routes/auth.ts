/**
 * broker/src/routes/auth.ts
 * ─────────────────────────
 * POST /auth/login — credential validation against User table, JWT issuance.
 *
 * Design: OIDC-ready local JWT.
 * - Passwords are bcrypt-hashed in the DB.
 * - To migrate to OIDC, replace this handler with redirect-to-IdP logic.
 *   The middleware (auth.ts) requires no changes.
 */

import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { signToken } from "../middleware/auth.js";

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /auth/login
 * Body: { email: string, password: string }
 * Returns: { token: string, expiresIn: string, user: { id, email, role, microgridId? } }
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "BAD_REQUEST", message: "email and password are required." });
    return;
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email: String(email) } });
  } catch (err) {
    res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable." });
    return;
  }

  // Constant-time-ish check: always run bcrypt even on missing user to resist timing attacks
  const hash = user?.passwordHash ?? "$2b$12$invalidhashfortimingprotection000000000000000000";
  const valid = await bcrypt.compare(String(password), hash);

  if (!user || !user.active || !valid) {
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    microgridId: user.microgridId ?? undefined,
  });

  const expiresIn = process.env.JWT_EXPIRES_IN ?? "8h";

  res.json({
    token,
    expiresIn,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      microgridId: user.microgridId,
    },
  });
});

export { router as authRouter };
