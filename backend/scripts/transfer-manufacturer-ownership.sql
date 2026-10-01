-- Canonical manufacturer ownership; customer identity is preserved separately.
-- Business values and authentication identities remain unchanged.
-- Run in a single transaction, before deploying the corresponding API.
LOCK TABLE "Organization", "OrgRelationship", "Style", "WorkOrder" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "dataOwnerOrgId" INTEGER;
ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "customerOrgId" INTEGER;
UPDATE "Style" SET "customerOrgId"="orgId" WHERE "customerOrgId" IS NULL;
CREATE TEMP TABLE ownership_style_fks ON COMMIT DROP AS
SELECT conrelid::regclass::text child,conname,replace(pg_get_constraintdef(oid),'(id, "orgId")','(id, "customerOrgId")') definition
FROM pg_constraint WHERE contype='f' AND confrelid='"Style"'::regclass AND array_length(confkey,1)=2;
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT * FROM ownership_style_fks LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.child,r.conname); END LOOP;
END $$;
DROP INDEX IF EXISTS "Style_id_org_key";
DROP INDEX IF EXISTS "Style_id_customerOrgId_key";
DROP INDEX IF EXISTS "Style_orgId_code_key";
DROP INDEX IF EXISTS "Style_orgId_name_key";
CREATE UNIQUE INDEX "Style_id_org_key" ON "Style"(id,"customerOrgId");
CREATE UNIQUE INDEX "Style_orgId_code_key" ON "Style"("customerOrgId",code);
CREATE UNIQUE INDEX "Style_orgId_name_key" ON "Style"("customerOrgId",name);
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT * FROM ownership_style_fks LOOP EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.child,r.conname,r.definition); END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS "DataOwnershipTransfer" (
  "key" TEXT PRIMARY KEY, "entityType" TEXT NOT NULL, "entityId" INTEGER NOT NULL,
  "previousOwnerOrgId" INTEGER NOT NULL, "ownerOrgId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Existing explicit ownership is never reassigned on retries or new relationships.
UPDATE "Organization" SET "dataOwnerOrgId"=id
WHERE type::text='MANUFACTURER' AND "dataOwnerOrgId" IS NULL;
UPDATE "Organization" o SET "dataOwnerOrgId"=o."ownerOrgId"
FROM "Organization" m WHERE o."ownerOrgId"=m.id AND m.type::text='MANUFACTURER'
AND o."dataOwnerOrgId" IS NULL;
UPDATE "Organization" o SET "dataOwnerOrgId"=r.manufacturer
FROM (SELECT "brandOrgId", MIN("manufacturerOrgId") manufacturer
      FROM "OrgRelationship" GROUP BY "brandOrgId"
      HAVING COUNT(DISTINCT "manufacturerOrgId")=1) r
WHERE o.id=r."brandOrgId" AND o."dataOwnerOrgId" IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Organization" o LEFT JOIN "Organization" m ON m.id=o."dataOwnerOrgId"
             WHERE o."dataOwnerOrgId" IS NULL OR m.type::text<>'MANUFACTURER') THEN
    RAISE EXCEPTION 'OWNERSHIP_AMBIGUOUS: every existing organization needs one explicit manufacturer data owner';
  END IF;
  IF EXISTS (SELECT 1 FROM "WorkOrder" w LEFT JOIN "Organization" m ON m.id=w."sellerOrgId"
             WHERE m.id IS NULL OR m.type::text<>'MANUFACTURER') THEN
    RAISE EXCEPTION 'OWNERSHIP_ORDER_SELLER: order seller is not a manufacturer';
  END IF;
END $$;

INSERT INTO "DataOwnershipTransfer" ("key","entityType","entityId","previousOwnerOrgId","ownerOrgId")
SELECT 'manufacturer-v1:Organization:'||id,'Organization',id,id,"dataOwnerOrgId"
FROM "Organization" WHERE id<>"dataOwnerOrgId" ON CONFLICT ("key") DO NOTHING;
INSERT INTO "DataOwnershipTransfer" ("key","entityType","entityId","previousOwnerOrgId","ownerOrgId")
SELECT 'manufacturer-v1:Style:'||s.id,'Style',s.id,s."orgId",o."dataOwnerOrgId"
FROM "Style" s JOIN "Organization" o ON o.id=s."orgId"
WHERE s."orgId"<>o."dataOwnerOrgId" ON CONFLICT ("key") DO NOTHING;
UPDATE "Style" s SET "orgId"=o."dataOwnerOrgId"
FROM "Organization" o WHERE o.id=s."customerOrgId" AND s."orgId"<>o."dataOwnerOrgId";
INSERT INTO "DataOwnershipTransfer" ("key","entityType","entityId","previousOwnerOrgId","ownerOrgId")
SELECT 'manufacturer-v1:WorkOrder:'||id,'WorkOrder',id,"orgId","sellerOrgId"
FROM "WorkOrder" WHERE "orgId"<>"sellerOrgId" ON CONFLICT ("key") DO NOTHING;
UPDATE "WorkOrder" SET "orgId"="sellerOrgId" WHERE "orgId"<>"sellerOrgId";
ALTER TABLE "Style" ALTER COLUMN "customerOrgId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Style_customerOrgId_idx" ON "Style"("customerOrgId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Organization_dataOwnerOrgId_fkey') THEN
    ALTER TABLE "Organization" ADD CONSTRAINT "Organization_dataOwnerOrgId_fkey"
      FOREIGN KEY ("dataOwnerOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Style_customerOrgId_fkey') THEN
    ALTER TABLE "Style" ADD CONSTRAINT "Style_customerOrgId_fkey"
      FOREIGN KEY ("customerOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION baro_manufacturer_data_owner() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type::text='MANUFACTURER' THEN NEW."dataOwnerOrgId":=NEW.id;
  ELSIF NEW."dataOwnerOrgId" IS NULL AND NEW."ownerOrgId" IS NOT NULL THEN
    SELECT COALESCE(o."dataOwnerOrgId",o.id) INTO NEW."dataOwnerOrgId" FROM "Organization" o WHERE o.id=NEW."ownerOrgId";
  END IF;
  IF NEW."dataOwnerOrgId" IS NOT NULL AND NEW."dataOwnerOrgId"<>NEW.id
     AND NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."dataOwnerOrgId" AND type::text='MANUFACTURER') THEN
    RAISE EXCEPTION 'data owner must be a manufacturer';
  END IF;
  IF NEW."dataOwnerOrgId"=NEW.id AND NEW.type::text<>'MANUFACTURER' THEN
    RAISE EXCEPTION 'data owner must be a manufacturer';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "manufacturer_data_owner" ON "Organization";
CREATE TRIGGER "manufacturer_data_owner" BEFORE INSERT OR UPDATE ON "Organization"
FOR EACH ROW EXECUTE FUNCTION baro_manufacturer_data_owner();

CREATE OR REPLACE FUNCTION baro_relationship_data_owner() RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Organization" SET "dataOwnerOrgId"=NEW."manufacturerOrgId"
  WHERE id=NEW."brandOrgId" AND "dataOwnerOrgId" IS NULL;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "relationship_data_owner" ON "OrgRelationship";
CREATE TRIGGER "relationship_data_owner" AFTER INSERT ON "OrgRelationship"
FOR EACH ROW EXECUTE FUNCTION baro_relationship_data_owner();

CREATE OR REPLACE FUNCTION baro_style_manufacturer_owner() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."customerOrgId" IS NULL THEN NEW."customerOrgId":=NEW."orgId"; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND type::text='MANUFACTURER') THEN
    SELECT "dataOwnerOrgId" INTO NEW."orgId" FROM "Organization" WHERE id=NEW."customerOrgId";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND type::text='MANUFACTURER') THEN
    RAISE EXCEPTION 'style owner must be a manufacturer';
  END IF;
  IF NEW."customerOrgId"<>NEW."orgId" AND NOT EXISTS (
    SELECT 1 FROM "OrgRelationship" WHERE "manufacturerOrgId"=NEW."orgId" AND "brandOrgId"=NEW."customerOrgId"
  ) THEN RAISE EXCEPTION 'style customer must be linked to owner manufacturer'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "style_manufacturer_owner" ON "Style";
CREATE TRIGGER "style_manufacturer_owner" BEFORE INSERT OR UPDATE ON "Style"
FOR EACH ROW EXECUTE FUNCTION baro_style_manufacturer_owner();

-- Also supports the previous API during the schema-first rollout.
CREATE OR REPLACE FUNCTION baro_order_manufacturer_owner() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."sellerOrgId" AND type::text='MANUFACTURER') THEN
    RAISE EXCEPTION 'order owner must be a manufacturer seller';
  END IF;
  NEW."orgId":=NEW."sellerOrgId";
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "order_manufacturer_owner" ON "WorkOrder";
CREATE TRIGGER "order_manufacturer_owner" BEFORE INSERT OR UPDATE ON "WorkOrder"
FOR EACH ROW EXECUTE FUNCTION baro_order_manufacturer_owner();
