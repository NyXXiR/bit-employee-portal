-- Detailed background-check results are intentionally request-scoped.
-- Dropping these columns also removes any sensitive result values stored by the previous policy.
DROP INDEX IF EXISTS "BackgroundCheck_retentionUntil_idx";

ALTER TABLE "BackgroundCheck"
  DROP COLUMN "criminalRecord",
  DROP COLUMN "educationVerified",
  DROP COLUMN "employmentVerified",
  DROP COLUMN "creditScore",
  DROP COLUMN "retentionUntil",
  DROP COLUMN "resultPurgedAt";
