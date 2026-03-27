-- AlterTable
ALTER TABLE "ProcessMasterOption"
  ADD COLUMN "nameKo" TEXT,
  ADD COLUMN "nameEn" TEXT,
  ADD COLUMN "nameVi" TEXT;

-- Backfill
UPDATE "ProcessMasterOption"
SET "nameKo" = "label"
WHERE COALESCE("nameKo", '') = '';
