CREATE TABLE "FactoryProductionAllowanceRate" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "factoryId" INTEGER NOT NULL,
  "effectiveMonth" TEXT NOT NULL,
  "targetMonthlyWage" DOUBLE PRECISION,
  "wagePerSecond" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FactoryProductionAllowanceRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FactoryProductionAllowanceRate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FactoryProductionAllowanceRate_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FactoryProductionAllowanceRate_factoryId_effectiveMonth_key"
  ON "FactoryProductionAllowanceRate"("factoryId", "effectiveMonth");
CREATE INDEX "FactoryProductionAllowanceRate_orgId_effectiveMonth_idx"
  ON "FactoryProductionAllowanceRate"("orgId", "effectiveMonth");
CREATE INDEX "FactoryProductionAllowanceRate_factoryId_effectiveMonth_idx"
  ON "FactoryProductionAllowanceRate"("factoryId", "effectiveMonth");
