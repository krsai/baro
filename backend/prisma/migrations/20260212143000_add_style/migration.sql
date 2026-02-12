CREATE TABLE IF NOT EXISTS "Style" (
    "uid" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "styleId" TEXT NOT NULL,
    "styleCode" TEXT,
    "name" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "registrationDate" TEXT,
    "designer" TEXT,
    "collection" TEXT,
    "season" TEXT,
    "imageUrls" JSONB,
    "processes" JSONB,
    "bom" JSONB,
    "bomNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Style_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Style_orgId_styleId_key"
ON "Style"("orgId", "styleId");

CREATE INDEX IF NOT EXISTS "Style_orgId_idx"
ON "Style"("orgId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Style_orgId_fkey'
  ) THEN
    ALTER TABLE "Style"
      ADD CONSTRAINT "Style_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
