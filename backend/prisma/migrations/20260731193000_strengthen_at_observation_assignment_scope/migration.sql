ALTER TABLE "StyleProcessAtObservation"
  DROP CONSTRAINT IF EXISTS "StyleProcessAtObservation_assignmentPlanId_fkey";

ALTER TABLE "StyleProcessAtObservation"
  ALTER COLUMN "assignmentPlanId" SET NOT NULL;

ALTER TABLE "StyleProcessAtObservation"
  ADD CONSTRAINT "StyleProcessAtObservation_assignmentPlan_org_fkey"
  FOREIGN KEY ("assignmentPlanId", "orgId")
  REFERENCES "AssignmentPlan"("id", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
