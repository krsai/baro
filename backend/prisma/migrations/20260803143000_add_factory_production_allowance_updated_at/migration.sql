ALTER TABLE "Factory"
ADD COLUMN "productionAllowanceUpdatedAt" TIMESTAMP(3);

UPDATE "Factory"
SET "productionAllowanceUpdatedAt" = "updatedAt"
WHERE "productionAllowanceUpdatedAt" IS NULL
  AND ("targetMonthlyWage" IS NOT NULL OR "wagePerSecond" IS NOT NULL);
