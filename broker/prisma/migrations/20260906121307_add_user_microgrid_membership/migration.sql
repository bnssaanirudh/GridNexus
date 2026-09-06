-- CreateTable
CREATE TABLE "user_microgrid_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "microgridId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_microgrid_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_microgrid_memberships_userId_idx" ON "user_microgrid_memberships"("userId");

-- CreateIndex
CREATE INDEX "user_microgrid_memberships_microgridId_idx" ON "user_microgrid_memberships"("microgridId");

-- CreateIndex
CREATE UNIQUE INDEX "user_microgrid_memberships_userId_microgridId_key" ON "user_microgrid_memberships"("userId", "microgridId");

-- AddForeignKey
ALTER TABLE "user_microgrid_memberships" ADD CONSTRAINT "user_microgrid_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_microgrid_memberships" ADD CONSTRAINT "user_microgrid_memberships_microgridId_fkey" FOREIGN KEY ("microgridId") REFERENCES "microgrids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
