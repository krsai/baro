ALTER TABLE "EmployeeCompensationPolicy"
ADD COLUMN "allowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "incentive" INTEGER NOT NULL DEFAULT 0;

UPDATE "EmployeeCompensationPolicy"
SET "allowance" = "fixedAllowance" + "variableAllowance";

ALTER TABLE "EmployeeCompensationPolicy"
DROP COLUMN "fixedAllowance",
DROP COLUMN "variableAllowance";

ALTER TABLE "EmployeeCompensationPolicy"
ADD CONSTRAINT "EmployeeCompensationPolicy_nonnegative_components_check"
CHECK ("baseSalary" >= 0 AND "allowance" >= 0 AND "incentive" >= 0);
