-- Scheduling metadata only; detailed external results remain transient.
ALTER TABLE "BackgroundCheck"
  ADD COLUMN "nextPollAt" TIMESTAMP(3),
  ADD COLUMN "refreshLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "refreshToken" UUID,
  ADD COLUMN "pollingStoppedStatus" INTEGER;
