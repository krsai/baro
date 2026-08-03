-- Existing factories predate the dedicated production-allowance timestamp.
-- `updatedAt` is the closest available historical value and is used only once.
UPDATE "Factory"
SET "productionAllowanceUpdatedAt" = "updatedAt"
WHERE "productionAllowanceUpdatedAt" IS NULL
  AND ("targetMonthlyWage" IS NOT NULL OR "wagePerSecond" IS NOT NULL);
