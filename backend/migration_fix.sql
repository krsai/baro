-- Step 1: close fields (20260517)
DO $$ BEGIN
  CREATE TYPE "AssignmentCloseMode" AS ENUM ('FULL', 'SHORT', 'OVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AssignmentCloseBasis" AS ENUM ('QC_BASED', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "closedQty" INTEGER,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "closeMode" "AssignmentCloseMode",
  ADD COLUMN IF NOT EXISTS "closeBasis" "AssignmentCloseBasis";

-- Step 2: QC pass events (20260518)
DO $$ BEGIN
  CREATE TYPE "QcPassEventSourceType" AS ENUM ('MANUAL', 'MIGRATED_LEGACY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "qcPassedTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "latestQcDate" TEXT;

CREATE TABLE IF NOT EXISTS "QcPassEvent" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "assignmentPlanId" INTEGER NOT NULL,
  "inspectedOn" TEXT NOT NULL,
  "passedQuantity" INTEGER NOT NULL DEFAULT 0,
  "colorId" INTEGER,
  "sizeKey" TEXT,
  "note" TEXT,
  "sourceType" "QcPassEventSourceType" NOT NULL DEFAULT 'MANUAL',
  "cancelledAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QcPassEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QcPassEvent_orgId_assignmentPlanId_inspectedOn_idx"
  ON "QcPassEvent"("orgId", "assignmentPlanId", "inspectedOn");
CREATE INDEX IF NOT EXISTS "QcPassEvent_orgId_inspectedOn_idx"
  ON "QcPassEvent"("orgId", "inspectedOn");
CREATE INDEX IF NOT EXISTS "QcPassEvent_assignmentPlanId_idx"
  ON "QcPassEvent"("assignmentPlanId");
CREATE INDEX IF NOT EXISTS "QcPassEvent_colorId_idx"
  ON "QcPassEvent"("colorId");

DO $$ BEGIN
  ALTER TABLE "QcPassEvent"
    ADD CONSTRAINT "QcPassEvent_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "QcPassEvent"
    ADD CONSTRAINT "QcPassEvent_assignmentPlanId_fkey"
    FOREIGN KEY ("assignmentPlanId") REFERENCES "AssignmentPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "QcPassEvent"
    ADD CONSTRAINT "QcPassEvent_colorId_fkey"
    FOREIGN KEY ("colorId") REFERENCES "AttrColor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Step 3: WorkLog coverage fields (20260518)
ALTER TABLE "WorkLog"
  ADD COLUMN IF NOT EXISTS "coverageStartDate" TEXT,
  ADD COLUMN IF NOT EXISTS "coverageEndDate" TEXT,
  ADD COLUMN IF NOT EXISTS "entryMode" TEXT;

-- Step 4: Schedule realization fields (20260521)
ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "productionCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actualProducedCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "candidateEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "renderEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "forecastCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "forecastBasis" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduleStatus" TEXT;

CREATE INDEX IF NOT EXISTS "AssignmentPlan_orgId_scheduleStatus_idx"
  ON "AssignmentPlan"("orgId", "scheduleStatus");

-- Step 5: WorkRecord canonical snapshot fields
ALTER TABLE "WorkRecord"
  ADD COLUMN IF NOT EXISTS "orderNo" TEXT,
  ADD COLUMN IF NOT EXISTS "lineId" INTEGER;

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_orderNo_idx"
  ON "WorkRecord"("orgId", "orderNo");

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_lineId_idx"
  ON "WorkRecord"("orgId", "lineId");
