ALTER TABLE "AttrColor"
ADD COLUMN IF NOT EXISTS "nameVi" TEXT;

ALTER TABLE "AttrCategory"
ADD COLUMN IF NOT EXISTS "nameVi" TEXT;

ALTER TABLE "AttrProcess"
ADD COLUMN IF NOT EXISTS "nameVi" TEXT;

UPDATE "AttrColor"
SET
  "nameEn" = COALESCE(NULLIF("nameEn", ''), NULLIF("name", '')),
  "name" = COALESCE(NULLIF("nameEn", ''), NULLIF("name", ''), NULLIF("nameKo", ''), NULLIF("nameVi", ''), "code");

UPDATE "AttrCategory"
SET
  "nameEn" = COALESCE(NULLIF("nameEn", ''), NULLIF("name", '')),
  "name" = COALESCE(NULLIF("nameEn", ''), NULLIF("name", ''), NULLIF("nameKo", ''), NULLIF("nameVi", ''), "code");

UPDATE "AttrProcess"
SET
  "nameEn" = COALESCE(NULLIF("nameEn", ''), NULLIF("name", '')),
  "name" = COALESCE(NULLIF("nameEn", ''), NULLIF("name", ''), NULLIF("nameKo", ''), NULLIF("nameVi", ''), "code");
