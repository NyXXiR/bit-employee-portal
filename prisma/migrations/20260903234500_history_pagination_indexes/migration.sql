DROP INDEX IF EXISTS "ProfileChange_employeeRecordId_createdAt_idx";
DROP INDEX IF EXISTS "BackgroundCheck_employeeRecordId_createdAt_idx";

CREATE INDEX "ProfileChange_employeeRecordId_createdAt_id_idx"
ON "ProfileChange"("employeeRecordId", "createdAt" DESC, "id" DESC);

CREATE INDEX "BackgroundCheck_employeeRecordId_createdAt_id_idx"
ON "BackgroundCheck"("employeeRecordId", "createdAt" DESC, "id" DESC);
