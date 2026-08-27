ALTER TABLE "FactoryProductionAllowanceRate"
ADD COLUMN "versionNumber" INTEGER,
ADD COLUMN "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "factoryId"
    ORDER BY "effectiveMonth" ASC, "createdAt" ASC, "id" ASC
  ) AS version_number
  FROM "FactoryProductionAllowanceRate"
)
UPDATE "FactoryProductionAllowanceRate" rate
SET "versionNumber" = ranked.version_number
FROM ranked
WHERE rate."id" = ranked."id";

ALTER TABLE "FactoryProductionAllowanceRate"
ALTER COLUMN "versionNumber" SET NOT NULL,
ALTER COLUMN "effectiveMonth" DROP NOT NULL;

CREATE UNIQUE INDEX "FactoryProductionAllowanceRate_factoryId_versionNumber_key"
ON "FactoryProductionAllowanceRate"("factoryId", "versionNumber");
