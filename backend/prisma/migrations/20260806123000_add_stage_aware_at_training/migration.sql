ALTER TABLE "AtTrainingBucket"
  ADD COLUMN IF NOT EXISTS "productionStage" "ProductionStage";

UPDATE "AtTrainingBucket"
SET "productionStage" = 'SEWING'::"ProductionStage"
WHERE "productionStage" IS NULL;

ALTER TABLE "AtTrainingBucket"
  ALTER COLUMN "productionStage" SET DEFAULT 'SEWING'::"ProductionStage",
  ALTER COLUMN "productionStage" SET NOT NULL;

DROP INDEX IF EXISTS "AtTrainingBucket_orgId_sourceWorkLogId_workerId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AtTrainingBucket_orgId_sourceWorkLogId_workerId_productionStage_key"
  ON "AtTrainingBucket"("orgId", "sourceWorkLogId", "workerId", "productionStage");

ALTER TABLE "StyleProcessAtObservation"
  ADD COLUMN IF NOT EXISTS "productionStage" "ProductionStage";

UPDATE "StyleProcessAtObservation" observation
SET "productionStage" = process."productionStage"
FROM "StyleProcess" process
WHERE observation."styleProcessId" = process.id
  AND observation."productionStage" IS NULL;

UPDATE "StyleProcessAtObservation"
SET "productionStage" = 'SEWING'::"ProductionStage"
WHERE "productionStage" IS NULL;

ALTER TABLE "StyleProcessAtObservation"
  ALTER COLUMN "productionStage" SET DEFAULT 'SEWING'::"ProductionStage",
  ALTER COLUMN "productionStage" SET NOT NULL;
