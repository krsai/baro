CREATE TABLE IF NOT EXISTS "StyleProcessAtObservation" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "styleProcessId" INTEGER NOT NULL,
  "assignmentPlanId" INTEGER,
  "quantity" INTEGER NOT NULL,
  "allocatedLaborInputSeconds" DOUBLE PRECISION NOT NULL,
  "perPieceObservedSeconds" DOUBLE PRECISION NOT NULL,
  "workerCount" INTEGER NOT NULL,
  "eventCountMax" DOUBLE PRECISION NOT NULL,
  "eventCountWeighted" DOUBLE PRECISION NOT NULL,
  "observationPeriodStartDate" TEXT NOT NULL,
  "observationPeriodEndDate" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL DEFAULT 'v2',
  "trainedPeriod" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StyleProcessAtObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StyleProcessAtObservation_scope_key"
  ON "StyleProcessAtObservation"("orgId", "styleProcessId", "assignmentPlanId", "modelVersion");
CREATE INDEX IF NOT EXISTS "StyleProcessAtObservation_org_model_idx"
  ON "StyleProcessAtObservation"("orgId", "modelVersion");
CREATE INDEX IF NOT EXISTS "StyleProcessAtObservation_styleProcessId_idx"
  ON "StyleProcessAtObservation"("styleProcessId");
CREATE INDEX IF NOT EXISTS "StyleProcessAtObservation_assignmentPlanId_idx"
  ON "StyleProcessAtObservation"("assignmentPlanId");

ALTER TABLE "StyleProcessAtObservation"
  ADD CONSTRAINT "StyleProcessAtObservation_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StyleProcessAtObservation"
  ADD CONSTRAINT "StyleProcessAtObservation_process_org_fkey"
  FOREIGN KEY ("styleProcessId", "orgId") REFERENCES "StyleProcess"("id", "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StyleProcessAtObservation"
  ADD CONSTRAINT "StyleProcessAtObservation_assignmentPlanId_fkey"
  FOREIGN KEY ("assignmentPlanId") REFERENCES "AssignmentPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
