DROP INDEX IF EXISTS "SalarySystemVersion_factoryId_effectiveMonth_key";
DROP INDEX IF EXISTS "FactoryProductionAllowanceRate_factoryId_effectiveMonth_key";
CREATE INDEX IF NOT EXISTS "SalarySystemVersion_factoryId_effectiveMonth_idx" ON "SalarySystemVersion"("factoryId", "effectiveMonth");
