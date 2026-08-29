import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface TradeCommitData {
  energyTransfer: {
    fromMicrogridId: string;
    toMicrogridId: string;
    amount: number;
    price: number;
    energyKwh: number;
    averagePowerKw: number;
    intervalMinutes: number;
    startTime: Date;
    stabilitycheckid: string;
    gridcertificateid: string;
    negotiationId?: string;
  };
  negotiationRound: {
    negotiationId: string;
    roundNumber: number;
    activeAgentId: string;
    opponentAgentId: string;
    action: string;
    surplus: number;
    decisionSource?: string;
  };
  rlReward: {
    agentId: string;
    negotiationId: string;
    rewardValue: number;
  };
}

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type CommitTradeResult = {
  negotiationRound: Awaited<ReturnType<PrismaClient["negotiationRound"]["create"]>>;
  rlReward: Awaited<ReturnType<PrismaClient["rlReward"]["create"]>>;
  energyTransfer: Awaited<ReturnType<PrismaClient["energyTransfer"]["create"]>>;
};

export const commitTrade = async (
  data: TradeCommitData,
  txClient?: TxClient
): Promise<CommitTradeResult> => {
  const client = txClient ?? prisma;

  if (!txClient) {
    return prisma.$transaction(async (tx: TxClient) => {
      const negotiationRound = await tx.negotiationRound.create({ data: data.negotiationRound as any });
      const rlReward = await tx.rlReward.create({ data: data.rlReward });
      const energyTransfer = await tx.energyTransfer.create({ data: data.energyTransfer as any });

      return { negotiationRound, rlReward, energyTransfer };
    });
  }

  const negotiationRound = await client.negotiationRound.create({ data: data.negotiationRound as any });
  const rlReward = await client.rlReward.create({ data: data.rlReward });
  const energyTransfer = await client.energyTransfer.create({ data: data.energyTransfer as any });

  return { negotiationRound, rlReward, energyTransfer };
};

export { prisma };
