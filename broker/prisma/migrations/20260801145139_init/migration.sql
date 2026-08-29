-- CreateTable
CREATE TABLE "microgrids" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hiddenbatterycapacity" TEXT NOT NULL,
    "hiddengenerationcost" TEXT NOT NULL,

    CONSTRAINT "microgrids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "microgridId" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiations" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oraclesignals" (
    "id" TEXT NOT NULL,
    "signalData" TEXT NOT NULL,

    CONSTRAINT "oraclesignals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beliefupdates" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "triggeringsignalid" TEXT NOT NULL,
    "beforeBelief" DECIMAL(10,4) NOT NULL,
    "afterBelief" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "beliefupdates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rlrewards" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "rewardValue" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "rlrewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stabilitychecks" (
    "id" TEXT NOT NULL,
    "isStable" BOOLEAN NOT NULL,
    "margin" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "stabilitychecks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energytransfers" (
    "id" TEXT NOT NULL,
    "fromMicrogridId" TEXT NOT NULL,
    "toMicrogridId" TEXT NOT NULL,
    "amount" DECIMAL(10,4) NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "stabilitycheckid" TEXT NOT NULL,

    CONSTRAINT "energytransfers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_microgridId_fkey" FOREIGN KEY ("microgridId") REFERENCES "microgrids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beliefupdates" ADD CONSTRAINT "beliefupdates_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beliefupdates" ADD CONSTRAINT "beliefupdates_triggeringsignalid_fkey" FOREIGN KEY ("triggeringsignalid") REFERENCES "oraclesignals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rlrewards" ADD CONSTRAINT "rlrewards_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rlrewards" ADD CONSTRAINT "rlrewards_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energytransfers" ADD CONSTRAINT "energytransfers_fromMicrogridId_fkey" FOREIGN KEY ("fromMicrogridId") REFERENCES "microgrids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energytransfers" ADD CONSTRAINT "energytransfers_toMicrogridId_fkey" FOREIGN KEY ("toMicrogridId") REFERENCES "microgrids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energytransfers" ADD CONSTRAINT "energytransfers_stabilitycheckid_fkey" FOREIGN KEY ("stabilitycheckid") REFERENCES "stabilitychecks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
