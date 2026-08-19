ALTER TABLE "StyleProcess"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "StyleProcess_styleId_isActive_idx"
  ON "StyleProcess"("styleId", "isActive");
