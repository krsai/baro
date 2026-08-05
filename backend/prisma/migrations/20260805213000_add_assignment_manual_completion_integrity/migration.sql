ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "completionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "atTrainingExcluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "atTrainingExclusionReason" TEXT;
