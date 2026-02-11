DO $$
BEGIN
  IF to_regclass('public."OrganizationRelationship"') IS NOT NULL
    AND to_regclass('public."OrgRelationship"') IS NULL THEN
    ALTER TABLE "OrganizationRelationship" RENAME TO "OrgRelationship";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrgRelationship" (
    "id" SERIAL NOT NULL,
    "manufacturerOrgId" INTEGER NOT NULL,
    "brandOrgId" INTEGER NOT NULL,
    "customerCode" TEXT,
    "managerName" TEXT,
    "managerPhone" TEXT,
    "managerEmail" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgRelationship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgRelationship_manufacturerOrgId_brandOrgId_key"
ON "OrgRelationship"("manufacturerOrgId", "brandOrgId");

CREATE INDEX IF NOT EXISTS "OrgRelationship_manufacturerOrgId_idx"
ON "OrgRelationship"("manufacturerOrgId");

CREATE INDEX IF NOT EXISTS "OrgRelationship_brandOrgId_idx"
ON "OrgRelationship"("brandOrgId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationship_manufacturerOrgId_fkey'
  ) THEN
    ALTER TABLE "OrgRelationship"
      ADD CONSTRAINT "OrgRelationship_manufacturerOrgId_fkey"
      FOREIGN KEY ("manufacturerOrgId") REFERENCES "Organization"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationship_brandOrgId_fkey'
  ) THEN
    ALTER TABLE "OrgRelationship"
      ADD CONSTRAINT "OrgRelationship_brandOrgId_fkey"
      FOREIGN KEY ("brandOrgId") REFERENCES "Organization"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
