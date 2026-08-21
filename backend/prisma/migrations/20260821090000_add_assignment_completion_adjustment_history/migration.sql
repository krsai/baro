ALTER TABLE "AssignmentPlan"
ADD COLUMN IF NOT EXISTS "completionAdjustmentHistory" JSONB;
