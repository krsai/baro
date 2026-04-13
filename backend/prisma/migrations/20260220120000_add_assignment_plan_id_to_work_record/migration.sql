-- AlterTable: add assignmentPlanId to WorkRecord
ALTER TABLE "WorkRecord" ADD COLUMN "assignmentPlanId" INTEGER;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_assignmentPlanId_fkey"
  FOREIGN KEY ("assignmentPlanId")
  REFERENCES "AssignmentPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "WorkRecord_assignmentPlanId_idx" ON "WorkRecord"("assignmentPlanId");
