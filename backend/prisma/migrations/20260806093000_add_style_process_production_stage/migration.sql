DO $$
BEGIN
  CREATE TYPE "ProductionStage" AS ENUM ('SEWING', 'IRONING', 'INSPECTION', 'PACKING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "StyleProcess"
  ADD COLUMN IF NOT EXISTS "productionStage" "ProductionStage";

UPDATE "StyleProcess"
SET "productionStage" = 'SEWING'::"ProductionStage"
WHERE "productionStage" IS NULL;

ALTER TABLE "StyleProcess"
  ALTER COLUMN "productionStage" SET DEFAULT 'SEWING'::"ProductionStage",
  ALTER COLUMN "productionStage" SET NOT NULL;
