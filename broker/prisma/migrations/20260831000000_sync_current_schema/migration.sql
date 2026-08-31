-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "qre_lambda" DECIMAL(10,4);

-- AlterTable
ALTER TABLE "beliefupdates" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "confidence" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "decisionSource" TEXT NOT NULL DEFAULT 'LLM',
ADD COLUMN     "hypothesis" TEXT,
ADD COLUMN     "likelihood" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "posterior" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "prior" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "stalenessTimestamp" TIMESTAMPTZ(6),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'COMPLETE';

-- AlterTable
ALTER TABLE "energytransfers" ADD COLUMN     "averagePowerKw" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "energyKwh" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "energyUnit" TEXT NOT NULL DEFAULT 'kWh',
ADD COLUMN     "gridcertificateid" TEXT NOT NULL,
ADD COLUMN     "intervalMinutes" INTEGER NOT NULL,
ADD COLUMN     "negotiationId" TEXT,
ADD COLUMN     "settlementId" TEXT,
ADD COLUMN     "startTime" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'COMMITTED';

-- AlterTable
ALTER TABLE "microgrids" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "externalCode" TEXT,
ADD COLUMN     "latitude" DECIMAL(10,6),
ADD COLUMN     "longitude" DECIMAL(10,6),
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "negotiations" ADD COLUMN     "buyerMicrogridId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "sellerMicrogridId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "oraclesignals" ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "stabilitychecks" ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "negotiationId" TEXT,
ADD COLUMN     "topologyVersion" INTEGER,
ADD COLUMN     "violatingDeviation" TEXT;

-- CreateTable
CREATE TABLE "negotiation_rounds" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "activeAgentId" TEXT NOT NULL,
    "opponentAgentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "surplus" DECIMAL(10,4) NOT NULL,
    "decisionSource" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiation_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grid_feasibility_certificates" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT,
    "networkVersion" INTEGER NOT NULL,
    "solver" TEXT NOT NULL,
    "solverVersion" TEXT NOT NULL,
    "feasible" BOOLEAN NOT NULL,
    "violations" JSONB,
    "maxLineLoadingPct" DECIMAL(10,4),
    "minVoltagePu" DECIMAL(10,4),
    "maxVoltagePu" DECIMAL(10,4),
    "powerBalanceError" DECIMAL(10,6),
    "inputHash" TEXT NOT NULL,
    "resultHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grid_feasibility_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_deficits" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "rawLlmOutput" TEXT NOT NULL,
    "validationError" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasoning_deficits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embedded_documents" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceUri" TEXT,
    "publisher" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT,
    "observedAt" TIMESTAMPTZ(6),
    "validFrom" TIMESTAMPTZ(6),
    "validUntil" TIMESTAMPTZ(6),
    "trustScore" DECIMAL(5,4),
    "connectorVersion" TEXT,
    "embeddingModel" TEXT,
    "embeddingModelVersion" TEXT,
    "embeddingDimension" INTEGER,
    "metadata" JSONB,
    "embedding" vector(384) NOT NULL,
    "ingestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embedded_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retrieved_context_audits" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "documentIds" TEXT[],
    "similarityScore" DECIMAL(5,4),
    "ranking" INTEGER,
    "modelVersion" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retrieved_context_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ders" (
    "id" TEXT NOT NULL,
    "microgridId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ratedPowerKw" DECIMAL(10,4) NOT NULL,
    "energyCapacityKwh" DECIMAL(10,4),
    "minPowerKw" DECIMAL(10,4) NOT NULL,
    "maxPowerKw" DECIMAL(10,4) NOT NULL,
    "efficiency" DECIMAL(5,4) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buses" (
    "id" TEXT NOT NULL,
    "externalCode" TEXT,
    "voltageLevelKv" DECIMAL(10,4) NOT NULL,
    "latitude" DECIMAL(10,6),
    "longitude" DECIMAL(10,6),

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lines" (
    "id" TEXT NOT NULL,
    "fromBusId" TEXT NOT NULL,
    "toBusId" TEXT NOT NULL,
    "resistance" DECIMAL(10,6) NOT NULL,
    "reactance" DECIMAL(10,6) NOT NULL,
    "thermalLimitKw" DECIMAL(10,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "microgrid_bus_mappings" (
    "id" TEXT NOT NULL,
    "microgridId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "phase" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "microgrid_bus_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topology_revisions" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "topology_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "microgridId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "sellerMicrogridId" TEXT NOT NULL,
    "buyerMicrogridId" TEXT NOT NULL,
    "energyKwh" DECIMAL(10,4) NOT NULL,
    "pricePerKwh" DECIMAL(10,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deliveryStart" TIMESTAMPTZ(6) NOT NULL,
    "deliveryEnd" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROVISIONAL',
    "auditHash" TEXT,
    "stabilityCheckId" TEXT,
    "gridCertificateId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "negotiationId" TEXT,
    "actorId" TEXT,
    "previousHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "negotiation_rounds_negotiationId_idx" ON "negotiation_rounds"("negotiationId");

-- CreateIndex
CREATE INDEX "reasoning_deficits_agentId_idx" ON "reasoning_deficits"("agentId");

-- CreateIndex
CREATE INDEX "reasoning_deficits_negotiationId_idx" ON "reasoning_deficits"("negotiationId");

-- CreateIndex
CREATE INDEX "embedded_documents_contentHash_idx" ON "embedded_documents"("contentHash");

-- CreateIndex
CREATE INDEX "ders_microgridId_idx" ON "ders"("microgridId");

-- CreateIndex
CREATE UNIQUE INDEX "buses_externalCode_key" ON "buses"("externalCode");

-- CreateIndex
CREATE INDEX "lines_fromBusId_idx" ON "lines"("fromBusId");

-- CreateIndex
CREATE INDEX "lines_toBusId_idx" ON "lines"("toBusId");

-- CreateIndex
CREATE INDEX "microgrid_bus_mappings_busId_idx" ON "microgrid_bus_mappings"("busId");

-- CreateIndex
CREATE UNIQUE INDEX "microgrid_bus_mappings_microgridId_busId_key" ON "microgrid_bus_mappings"("microgridId", "busId");

-- CreateIndex
CREATE UNIQUE INDEX "topology_revisions_version_key" ON "topology_revisions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_idempotencyKey_key" ON "settlements"("idempotencyKey");

-- CreateIndex
CREATE INDEX "settlements_negotiationId_idx" ON "settlements"("negotiationId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_sequence_key" ON "audit_events"("sequence");

-- CreateIndex
CREATE INDEX "audit_events_negotiationId_idx" ON "audit_events"("negotiationId");

-- CreateIndex
CREATE INDEX "audit_events_sequence_idx" ON "audit_events"("sequence");

-- CreateIndex
CREATE INDEX "beliefupdates_agentId_status_idx" ON "beliefupdates"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "microgrids_externalCode_key" ON "microgrids"("externalCode");

-- AddForeignKey
ALTER TABLE "negotiation_rounds" ADD CONSTRAINT "negotiation_rounds_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energytransfers" ADD CONSTRAINT "energytransfers_gridcertificateid_fkey" FOREIGN KEY ("gridcertificateid") REFERENCES "grid_feasibility_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energytransfers" ADD CONSTRAINT "energytransfers_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energytransfers" ADD CONSTRAINT "energytransfers_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ders" ADD CONSTRAINT "ders_microgridId_fkey" FOREIGN KEY ("microgridId") REFERENCES "microgrids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lines" ADD CONSTRAINT "lines_fromBusId_fkey" FOREIGN KEY ("fromBusId") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lines" ADD CONSTRAINT "lines_toBusId_fkey" FOREIGN KEY ("toBusId") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "microgrid_bus_mappings" ADD CONSTRAINT "microgrid_bus_mappings_microgridId_fkey" FOREIGN KEY ("microgridId") REFERENCES "microgrids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "microgrid_bus_mappings" ADD CONSTRAINT "microgrid_bus_mappings_busId_fkey" FOREIGN KEY ("busId") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_stabilityCheckId_fkey" FOREIGN KEY ("stabilityCheckId") REFERENCES "stabilitychecks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_gridCertificateId_fkey" FOREIGN KEY ("gridCertificateId") REFERENCES "grid_feasibility_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Add Append-Only Triggers for new audit tables
DROP TRIGGER IF EXISTS reject_update_settlements ON "settlements";
CREATE TRIGGER reject_update_settlements
BEFORE UPDATE OR DELETE ON "settlements"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS reject_update_audit_events ON "audit_events";
CREATE TRIGGER reject_update_audit_events
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
