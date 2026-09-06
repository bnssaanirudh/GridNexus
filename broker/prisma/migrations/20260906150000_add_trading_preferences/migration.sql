-- CreateTable
CREATE TABLE "trading_preferences" (
    "id" TEXT NOT NULL,
    "microgridId" TEXT NOT NULL,
    "tradingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minimumBatteryReservePct" DECIMAL(10,4) NOT NULL DEFAULT 20.0000,
    "maximumDailyExportKwh" DECIMAL(10,4),
    "minimumPreferredSalePrice" DECIMAL(10,4),
    "maximumPreferredBuyPrice" DECIMAL(10,4),
    "riskProfile" TEXT NOT NULL DEFAULT 'BALANCED',
    "maxTransactionSizeKwh" DECIMAL(10,4),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trading_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trading_preferences_microgridId_key" ON "trading_preferences"("microgridId");

-- AddForeignKey
ALTER TABLE "trading_preferences" ADD CONSTRAINT "trading_preferences_microgridId_fkey" FOREIGN KEY ("microgridId") REFERENCES "microgrids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
