ALTER TABLE "StyleProcess"
  ADD COLUMN IF NOT EXISTS "atStFallbackApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "atStFallbackSourceAssignmentPlanId" INTEGER,
  ADD COLUMN IF NOT EXISTS "atStFallbackApprovedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "StyleProcess_atStFallbackSourceAssignmentPlanId_idx"
  ON "StyleProcess"("atStFallbackSourceAssignmentPlanId");
