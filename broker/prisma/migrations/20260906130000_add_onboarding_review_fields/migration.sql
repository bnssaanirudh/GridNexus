-- AlterTable
ALTER TABLE "user_onboarding" ADD COLUMN "reviewedBy" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMPTZ(6),
ADD COLUMN "reason" TEXT;
