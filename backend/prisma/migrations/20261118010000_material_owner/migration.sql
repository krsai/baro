-- Material ownership is independent of the historical customer attribute.
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "itemOwnerOrgId" INTEGER;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "itemOwnerSnapshot" JSONB;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Cost_material_owner_fkey') THEN
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "Cost_material_owner_fkey" FOREIGN KEY("itemOwnerOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_code_attribute_inputs_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT settings IS NULL OR coalesce(jsonb_typeof(settings)='object' AND NOT EXISTS(
 SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(settings)='object' THEN settings ELSE '{}'::jsonb END) pair
 WHERE pair.key NOT IN ('customer','type','owner') OR pair.value #>> '{}' NOT IN ('REQUIRED','OPTIONAL','HIDDEN') OR jsonb_typeof(pair.value)<>'string'),false)
$$;
CREATE OR REPLACE FUNCTION baro_material_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settings jsonb; owner_data jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW."orgId" IS NOT DISTINCT FROM OLD."orgId" AND NEW."transactionCodeId" IS NOT DISTINCT FROM OLD."transactionCodeId" AND NEW."itemOwnerOrgId" IS NOT DISTINCT FROM OLD."itemOwnerOrgId" THEN
  IF NEW."itemOwnerSnapshot" IS DISTINCT FROM OLD."itemOwnerSnapshot" THEN RAISE EXCEPTION 'material owner snapshot is immutable'; END IF;
  RETURN NEW;
 END IF;
 SELECT CASE WHEN a."inputSettings" IS NOT NULL THEN coalesce(a."inputSettings"->'attributeInputs','{}'::jsonb) ELSE coalesce(b."attributeInputs",'{}'::jsonb) END INTO settings
 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId"
 LEFT JOIN "ExpenseCodeLinkAudit" a ON a.id=NEW."linkPolicyAuditId" AND a."orgId"=NEW."orgId"
 WHERE c.id=NEW."transactionCodeId" AND c."ownerOrgId"=NEW."orgId";
 IF settings->>'owner'='REQUIRED' AND NEW."itemOwnerOrgId" IS NULL THEN RAISE EXCEPTION 'required material owner'; END IF;
 IF coalesce(settings->>'owner','HIDDEN')='HIDDEN' AND NEW."itemOwnerOrgId" IS NOT NULL THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'unexpected material owner'; END IF;
  IF NEW."itemOwnerOrgId" IS DISTINCT FROM OLD."itemOwnerOrgId" THEN RAISE EXCEPTION 'unexpected material owner'; END IF;
 END IF;
 IF NEW."itemOwnerOrgId" IS NOT NULL THEN
  SELECT jsonb_build_object('id',o.id,'code',o.code,'name',o.name,'nameKo',o."nameKo",'nameVi',o."nameVi") INTO owner_data FROM "Organization" o WHERE o.id=NEW."itemOwnerOrgId" AND (
   o.id=NEW."orgId" OR o."isActive" AND (o."ownerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE (r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=o.id) OR (r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=o.id))));
  IF owner_data IS NULL THEN RAISE EXCEPTION 'invalid material owner scope'; END IF;
 END IF;
 NEW."itemOwnerSnapshot":=owner_data;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Cost_material_owner_guard" ON "PartnerTransactionCost";
CREATE TRIGGER "Cost_material_owner_guard" BEFORE INSERT OR UPDATE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_material_owner_guard();
