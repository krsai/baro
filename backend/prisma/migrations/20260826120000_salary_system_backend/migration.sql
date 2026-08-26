-- Refuse to collapse legacy role rates when the resulting pay-type rate is ambiguous.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EmployeeCompensationPolicy' AND column_name='orgRole') AND EXISTS (
    SELECT 1
    FROM "EmployeeCompensationPolicy"
    GROUP BY "orgId", CASE WHEN "orgRole" = 'WORKER' THEN 'OUTPUT' ELSE 'GENERAL' END, "gradeId"
    HAVING COUNT(DISTINCT ("baseSalary", "allowance", "incentive")) > 1
  ) THEN
    RAISE EXCEPTION 'Conflicting legacy compensation policies must be resolved before payType migration';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EmployeeCompensationPolicy' AND column_name='orgRole') THEN
    ALTER TABLE "EmployeeCompensationPolicy" ADD COLUMN IF NOT EXISTS "payType" TEXT;
    UPDATE "EmployeeCompensationPolicy" SET "payType"=CASE WHEN "orgRole"='WORKER' THEN 'OUTPUT' ELSE 'GENERAL' END WHERE "payType" IS NULL;
    DELETE FROM "EmployeeCompensationPolicy" a USING "EmployeeCompensationPolicy" b WHERE a."id">b."id" AND a."orgId"=b."orgId" AND a."payType"=b."payType" AND a."gradeId"=b."gradeId";
    DROP INDEX IF EXISTS "EmployeeCompensationPolicy_orgId_orgRole_gradeId_key";
    ALTER TABLE "EmployeeCompensationPolicy" DROP COLUMN "orgRole";
    ALTER TABLE "EmployeeCompensationPolicy" ALTER COLUMN "payType" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeCompensationPolicy_orgId_payType_gradeId_key"
ON "EmployeeCompensationPolicy"("orgId", "payType", "gradeId");
DO $$ BEGIN ALTER TABLE "EmployeeCompensationPolicy" ADD CONSTRAINT "EmployeeCompensationPolicy_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SalaryItem" (
  "id" SERIAL PRIMARY KEY, "orgId" INTEGER NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "category" TEXT NOT NULL, "payTypes" JSONB NOT NULL, "formula" JSONB NOT NULL, "payCycle" TEXT NOT NULL,
  "capValue" INTEGER, "required" BOOLEAN NOT NULL DEFAULT false, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "SalaryItem_category_check" CHECK ("category" IN ('BASE','ALLOWANCE','INCENTIVE')),
  CONSTRAINT "SalaryItem_payCycle_check" CHECK ("payCycle" IN ('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryItem_orgId_code_key" ON "SalaryItem"("orgId","code");
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryItem_orgId_id_key" ON "SalaryItem"("orgId","id");
CREATE INDEX IF NOT EXISTS "SalaryItem_orgId_isActive_sortOrder_idx" ON "SalaryItem"("orgId","isActive","sortOrder");

CREATE TABLE IF NOT EXISTS "SalaryItemRate" (
  "id" SERIAL PRIMARY KEY, "orgId" INTEGER NOT NULL, "payType" TEXT NOT NULL, "gradeId" INTEGER NOT NULL,
  "salaryItemId" INTEGER NOT NULL, "amount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryItemRate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "SalaryItemRate_grade_fkey" FOREIGN KEY ("orgId","gradeId") REFERENCES "EmployeeGrade"("orgId","id") ON DELETE CASCADE,
  CONSTRAINT "SalaryItemRate_item_fkey" FOREIGN KEY ("orgId","salaryItemId") REFERENCES "SalaryItem"("orgId","id") ON DELETE CASCADE,
  CONSTRAINT "SalaryItemRate_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT')),
  CONSTRAINT "SalaryItemRate_amount_check" CHECK ("amount" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryItemRate_orgId_payType_gradeId_salaryItemId_key" ON "SalaryItemRate"("orgId","payType","gradeId","salaryItemId");
CREATE INDEX IF NOT EXISTS "SalaryItemRate_orgId_salaryItemId_idx" ON "SalaryItemRate"("orgId","salaryItemId");

CREATE TABLE IF NOT EXISTS "SalarySystemVersion" (
  "id" SERIAL PRIMARY KEY, "orgId" INTEGER NOT NULL, "versionNumber" INTEGER NOT NULL,
  "effectiveMonth" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "confirmedBy" TEXT NOT NULL,
  "confirmedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalarySystemVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "SalarySystemVersion_effectiveMonth_check" CHECK ("effectiveMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalarySystemVersion_orgId_versionNumber_key" ON "SalarySystemVersion"("orgId","versionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "SalarySystemVersion_orgId_effectiveMonth_key" ON "SalarySystemVersion"("orgId","effectiveMonth");
CREATE INDEX IF NOT EXISTS "SalarySystemVersion_orgId_effectiveMonth_idx" ON "SalarySystemVersion"("orgId","effectiveMonth");
