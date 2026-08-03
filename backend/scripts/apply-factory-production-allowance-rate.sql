CREATE TABLE IF NOT EXISTS "FactoryProductionAllowanceRate" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "factoryId" INTEGER NOT NULL,
  "effectiveMonth" TEXT NOT NULL,
  "targetMonthlyWage" DOUBLE PRECISION,
  "wagePerSecond" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FactoryProductionAllowanceRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryProductionAllowanceRate_factoryId_effectiveMonth_key"
  ON "FactoryProductionAllowanceRate"("factoryId", "effectiveMonth");
CREATE INDEX IF NOT EXISTS "FactoryProductionAllowanceRate_orgId_effectiveMonth_idx"
  ON "FactoryProductionAllowanceRate"("orgId", "effectiveMonth");
CREATE INDEX IF NOT EXISTS "FactoryProductionAllowanceRate_factoryId_effectiveMonth_idx"
  ON "FactoryProductionAllowanceRate"("factoryId", "effectiveMonth");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FactoryProductionAllowanceRate_orgId_fkey') THEN
    ALTER TABLE "FactoryProductionAllowanceRate" ADD CONSTRAINT "FactoryProductionAllowanceRate_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FactoryProductionAllowanceRate_factoryId_fkey') THEN
    ALTER TABLE "FactoryProductionAllowanceRate" ADD CONSTRAINT "FactoryProductionAllowanceRate_factoryId_fkey"
      FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
