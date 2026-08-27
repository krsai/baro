ALTER TABLE "SalaryItem"
  ADD COLUMN "nameKo" TEXT,
  ADD COLUMN "nameEn" TEXT,
  ADD COLUMN "nameVi" TEXT;

UPDATE "SalaryItem"
SET "nameKo" = COALESCE("nameKo", "name"),
    "nameEn" = COALESCE("nameEn", "name"),
    "nameVi" = COALESCE("nameVi", "name");

ALTER TABLE "SalaryItem"
  ALTER COLUMN "nameKo" SET NOT NULL,
  ALTER COLUMN "nameEn" SET NOT NULL,
  ALTER COLUMN "nameVi" SET NOT NULL;
