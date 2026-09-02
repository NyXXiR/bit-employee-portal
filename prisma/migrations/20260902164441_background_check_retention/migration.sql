-- AlterTable
ALTER TABLE "BackgroundCheck" ADD COLUMN     "resultPurgedAt" TIMESTAMP(3),
ADD COLUMN     "retentionUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BackgroundCheck_retentionUntil_idx" ON "BackgroundCheck"("retentionUntil");
