ALTER TABLE "SalaryItem" ADD COLUMN "paymentMonths" JSONB;

UPDATE "SalaryItem"
SET "paymentMonths" = CASE "payCycle"
  WHEN 'QUARTERLY' THEN '[3,6,9,12]'::jsonb
  WHEN 'SEMIANNUAL' THEN '[6,12]'::jsonb
  WHEN 'ANNUAL' THEN '[12]'::jsonb
  ELSE '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb
END;

ALTER TABLE "SalaryItem" ALTER COLUMN "paymentMonths" SET NOT NULL;
