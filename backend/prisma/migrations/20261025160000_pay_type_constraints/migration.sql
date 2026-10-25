-- Schema-only repair: preserve all historical amounts and employee policies.
ALTER TABLE "EmployeeCompensationPolicy" DROP CONSTRAINT IF EXISTS "EmployeeCompensationPolicy_payType_check";
ALTER TABLE "EmployeeCompensationPolicy" ADD CONSTRAINT "EmployeeCompensationPolicy_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT_FIXED','OUTPUT'));
ALTER TABLE "SalaryItemRate" DROP CONSTRAINT IF EXISTS "SalaryItemRate_payType_check";
ALTER TABLE "SalaryItemRate" ADD CONSTRAINT "SalaryItemRate_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT_FIXED','OUTPUT'));
ALTER TABLE "EmployeePayTypePolicy" DROP CONSTRAINT IF EXISTS "EmployeePayTypePolicy_payType_check";
ALTER TABLE "EmployeePayTypePolicy" ADD CONSTRAINT "EmployeePayTypePolicy_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT_FIXED','OUTPUT'));
