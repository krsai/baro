DO $$
BEGIN
  CREATE TYPE "AssignmentCloseMode" AS ENUM ('FULL', 'SHORT', 'OVER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AssignmentCloseBasis" AS ENUM ('QC_BASED', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AssignmentPlan"
ADD COLUMN IF NOT EXISTS "closedQty" INTEGER,
ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "closedBy" TEXT,
ADD COLUMN IF NOT EXISTS "closeMode" "AssignmentCloseMode",
ADD COLUMN IF NOT EXISTS "closeBasis" "AssignmentCloseBasis";
