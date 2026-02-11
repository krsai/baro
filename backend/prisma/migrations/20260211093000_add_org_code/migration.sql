ALTER TABLE "Organization" ADD COLUMN "code" TEXT;

DO $$
BEGIN
  IF to_regclass('public."OrgRelationship"') IS NOT NULL THEN
    UPDATE "Organization" o
    SET "code" = r."customerCode"
    FROM "OrgRelationship" r
    WHERE o."id" = r."brandOrgId"
      AND o."code" IS NULL
      AND r."customerCode" IS NOT NULL;
  ELSIF to_regclass('public."OrganizationRelationship"') IS NOT NULL THEN
    UPDATE "Organization" o
    SET "code" = r."customerCode"
    FROM "OrganizationRelationship" r
    WHERE o."id" = r."brandOrgId"
      AND o."code" IS NULL
      AND r."customerCode" IS NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");
