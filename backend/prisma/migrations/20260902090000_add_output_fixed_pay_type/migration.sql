ALTER TABLE "EmployeeCompensationPolicy" DROP CONSTRAINT IF EXISTS "EmployeeCompensationPolicy_payType_check";
ALTER TABLE "EmployeeCompensationPolicy" ADD CONSTRAINT "EmployeeCompensationPolicy_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT_FIXED','OUTPUT'));
ALTER TABLE "SalaryItemRate" DROP CONSTRAINT IF EXISTS "SalaryItemRate_payType_check";
ALTER TABLE "SalaryItemRate" ADD CONSTRAINT "SalaryItemRate_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT_FIXED','OUTPUT'));
ALTER TABLE "EmployeePayTypePolicy" DROP CONSTRAINT IF EXISTS "EmployeePayTypePolicy_payType_check";
ALTER TABLE "EmployeePayTypePolicy" ADD CONSTRAINT "EmployeePayTypePolicy_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT_FIXED','OUTPUT'));

INSERT INTO "EmployeePayTypePolicy" ("orgId", "payType", "workWeekdays", "standardClockIn", "standardClockOut", "breakMinutes", "workdayMinimumMinutes", "createdAt", "updatedAt")
SELECT "orgId", 'OUTPUT_FIXED', "workWeekdays", "standardClockIn", "standardClockOut", "breakMinutes", "workdayMinimumMinutes", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "EmployeePayTypePolicy" source
WHERE source."payType" = 'OUTPUT'
ON CONFLICT ("orgId", "payType") DO NOTHING;

INSERT INTO "EmployeeCompensationPolicy" ("orgId", "payType", "gradeId", "baseSalary", "allowance", "incentive", "createdAt", "updatedAt")
SELECT "orgId", 'OUTPUT_FIXED', "gradeId", "baseSalary", "allowance", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "EmployeeCompensationPolicy" source
WHERE source."payType" = 'OUTPUT'
ON CONFLICT ("orgId", "payType", "gradeId") DO NOTHING;

INSERT INTO "SalaryItemRate" ("orgId", "factoryId", "payType", "gradeId", "salaryItemId", "amount", "createdAt", "updatedAt")
SELECT "orgId", "factoryId", 'OUTPUT_FIXED', "gradeId", "salaryItemId", "amount", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SalaryItemRate" source
WHERE source."payType" = 'OUTPUT'
  AND NOT EXISTS (
    SELECT 1 FROM "SalaryItem" item
    WHERE item."id" = source."salaryItemId" AND item."category" = 'INCENTIVE'
  )
ON CONFLICT ("factoryId", "payType", "gradeId", "salaryItemId") DO NOTHING;

UPDATE "SalaryItem"
SET "payTypes" = ("payTypes"::jsonb || '["OUTPUT_FIXED"]'::jsonb)
WHERE "category" <> 'INCENTIVE'
  AND NOT ("payTypes"::jsonb ? 'OUTPUT_FIXED');
