-- AlterTable: add completion fields to AssignmentPlan
ALTER TABLE "AssignmentPlan" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AssignmentPlan" ADD COLUMN "finalQuantity" INTEGER;
ALTER TABLE "AssignmentPlan" ADD COLUMN "completedAt" TIMESTAMP(3);
