ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "assignmentProcessRevisionHistory" JSONB;
