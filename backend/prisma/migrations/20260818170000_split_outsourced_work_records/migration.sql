CREATE TYPE "WorkLogRecordKind" AS ENUM ('EMPLOYEE', 'OUTSOURCING');

ALTER TABLE "WorkLog" ADD COLUMN "recordKind" "WorkLogRecordKind" NOT NULL DEFAULT 'EMPLOYEE';
CREATE INDEX "WorkLog_orgId_recordKind_idx" ON "WorkLog"("orgId", "recordKind");

CREATE TABLE "OutsourcedWorkRecord" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "workLogId" INTEGER NOT NULL,
  "outsourcingPartnerId" INTEGER NOT NULL,
  "outsourceVendorName" TEXT NOT NULL,
  "outsourceUnitPrice" DECIMAL(18, 4) NOT NULL,
  "lineId" INTEGER,
  "styleId" INTEGER NOT NULL,
  "styleProcessId" INTEGER NOT NULL,
  "assignmentPlanId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "createdByEmployeeId" INTEGER,
  "updatedByEmployeeId" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutsourcedWorkRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutsourcedWorkRecord_orgId_workLogId_idx" ON "OutsourcedWorkRecord"("orgId", "workLogId");
CREATE INDEX "OutsourcedWorkRecord_orgId_outsourcingPartnerId_idx" ON "OutsourcedWorkRecord"("orgId", "outsourcingPartnerId");
CREATE INDEX "OutsourcedWorkRecord_orgId_styleId_idx" ON "OutsourcedWorkRecord"("orgId", "styleId");
CREATE INDEX "OutsourcedWorkRecord_orgId_lineId_idx" ON "OutsourcedWorkRecord"("orgId", "lineId");
CREATE INDEX "OutsourcedWorkRecord_styleProcessId_idx" ON "OutsourcedWorkRecord"("styleProcessId");
CREATE INDEX "OutsourcedWorkRecord_assignmentPlanId_idx" ON "OutsourcedWorkRecord"("assignmentPlanId");
CREATE INDEX "OutsourcedWorkRecord_workLogId_idx" ON "OutsourcedWorkRecord"("workLogId");

ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_workLogId_fkey"
  FOREIGN KEY ("workLogId") REFERENCES "WorkLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_outsourcingPartnerId_fkey"
  FOREIGN KEY ("outsourcingPartnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_assignmentPlan_org_fkey"
  FOREIGN KEY ("assignmentPlanId", "orgId") REFERENCES "AssignmentPlan"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_styleId_fkey"
  FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_styleProcess_style_org_fkey"
  FOREIGN KEY ("styleProcessId", "styleId", "orgId") REFERENCES "StyleProcess"("id", "styleId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_lineId_fkey"
  FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutsourcedWorkRecord" ADD CONSTRAINT "OutsourcedWorkRecord_updatedByEmployeeId_fkey"
  FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy outsourcing columns on WorkRecord. Run
-- scripts/migrate-outsourced-work-records.js --apply BEFORE this migration
-- in any environment with existing isOutsourced=true rows, or this drop
-- discards that data. (Railway's actual deploy path applies
-- migration_fix.sql, not this file - see the idempotent, data-safe
-- "Step 0s" block there for the real production migration.)
ALTER TABLE "WorkRecord" DROP CONSTRAINT IF EXISTS "WorkRecord_outsource_actor_check";
ALTER TABLE "WorkRecord" DROP CONSTRAINT IF EXISTS "WorkRecord_outsourcingPartnerId_fkey";
DROP INDEX IF EXISTS "WorkRecord_orgId_isOutsourced_idx";
DROP INDEX IF EXISTS "WorkRecord_orgId_outsourcingPartnerId_idx";
ALTER TABLE "WorkRecord" DROP COLUMN IF EXISTS "isOutsourced";
ALTER TABLE "WorkRecord" DROP COLUMN IF EXISTS "outsourceVendorName";
ALTER TABLE "WorkRecord" DROP COLUMN IF EXISTS "outsourceUnitPrice";
ALTER TABLE "WorkRecord" DROP COLUMN IF EXISTS "outsourcingPartnerId";
