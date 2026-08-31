import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var gridNexusPrisma: PrismaClient | undefined;
}

/**
 * Process-wide Prisma client. Reusing one pool prevents connection exhaustion
 * under health checks, API polling, workers, and hot reload.
 */
export const prisma = globalThis.gridNexusPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalThis.gridNexusPrisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
