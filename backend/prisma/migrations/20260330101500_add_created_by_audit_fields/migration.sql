ALTER TABLE "SystemUser" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "SystemUser"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "SystemUser" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "SystemUser" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "ProcessMasterOption" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "ProcessMasterOption"
SET "createdBy" = 'system@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "ProcessMasterOption" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "ProcessMasterOption" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "Organization"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "Organization" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "Organization" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "OnboardingRequest" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "OnboardingRequest"
SET "createdBy" = COALESCE(NULLIF(BTRIM("requesterEmail"), ''), 'legacy@baro.local')
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "OnboardingRequest" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "OnboardingRequest" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "OrganizationSubscription" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "OrganizationSubscription"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "OrganizationSubscription" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "OrganizationSubscription" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "OrgMembership" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "OrgMembership"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "OrgMembership" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "OrgMembership" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "Factory"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "Factory" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "Factory" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "Line" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "Line"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "Line" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "Line" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "Employee"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "Employee" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "Employee" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "AttendanceEntry" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "AttendanceEntry"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "AttendanceEntry" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "AttendanceEntry" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "OrgRelationship"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "OrgRelationship" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "OrgRelationship" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "Style"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "Style" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "Style" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "StyleProcess" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "StyleProcess"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "StyleProcess" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "StyleProcess" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "AtTrainingBucket" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "AtTrainingBucket"
SET "createdBy" = 'system@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "AtTrainingBucket" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "AtTrainingBucket" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "AtTrainingBucketProcess" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "AtTrainingBucketProcess"
SET "createdBy" = 'system@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "AtTrainingBucketProcess" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "AtTrainingBucketProcess" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "WorkOrder"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "WorkOrder" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "WorkOrder" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "WorkOrderItem" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "WorkOrderItem"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "WorkOrderItem" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "WorkOrderItem" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "AssignmentPlan"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "AssignmentPlan" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "AssignmentPlan" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "WorkLog" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "WorkLog"
SET "createdBy" = COALESCE(NULLIF(BTRIM("updatedBy"), ''), 'legacy@baro.local')
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "WorkLog" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "WorkLog" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "WorkRecord" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "WorkRecord" AS wr
SET "createdBy" = COALESCE(
  (
    SELECT NULLIF(BTRIM(wl."updatedBy"), '')
    FROM "WorkLog" AS wl
    WHERE wl."id" = wr."workLogId"
  ),
  'legacy@baro.local'
)
WHERE wr."createdBy" IS NULL OR BTRIM(wr."createdBy") = '';
ALTER TABLE "WorkRecord" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "WorkRecord" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "PayrollSnapshot" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "PayrollSnapshot"
SET "createdBy" = COALESCE(NULLIF(BTRIM("lockedBy"), ''), 'legacy@baro.local')
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "PayrollSnapshot" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "PayrollSnapshot" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "AssignmentBoardState" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "AssignmentBoardState"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "AssignmentBoardState" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "AssignmentBoardState" ALTER COLUMN "createdBy" SET NOT NULL;

ALTER TABLE "AssignmentCard" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "AssignmentCard"
SET "createdBy" = 'legacy@baro.local'
WHERE "createdBy" IS NULL OR BTRIM("createdBy") = '';
ALTER TABLE "AssignmentCard" ALTER COLUMN "createdBy" SET DEFAULT 'system@baro.local';
ALTER TABLE "AssignmentCard" ALTER COLUMN "createdBy" SET NOT NULL;
