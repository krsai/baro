-- Additive material catalogue. Never backfill financial documents or stock.
CREATE TABLE IF NOT EXISTS "MaterialItem" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "baseId" INTEGER NOT NULL,"industryId" INTEGER NOT NULL,
 "unitId" INTEGER NOT NULL REFERENCES "ExpenseUnit"(id) ON DELETE RESTRICT,
 "ownerOrgId" INTEGER REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "customerId" INTEGER REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "typeId" INTEGER,"colorId" INTEGER REFERENCES "AttrColor"(id) ON DELETE RESTRICT,
 data JSONB NOT NULL,"identityKey" TEXT NOT NULL,"clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 "createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MaterialItem_scope_key" UNIQUE(id,"orgId","baseId"),
 CONSTRAINT "MaterialItem_request_key" UNIQUE("orgId","clientKey"),
 CONSTRAINT "MaterialItem_identity_key" UNIQUE("orgId","baseId","identityKey"),
 CONSTRAINT "MaterialItem_industry_fkey" FOREIGN KEY("baseId","industryId") REFERENCES "AccountingCodeIndustry"("baseId","systemIndustryId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "MaterialItem_actor_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "MaterialItem_type_fkey" FOREIGN KEY("typeId","orgId") REFERENCES "CodeItemType"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "MaterialItem_data_check" CHECK(jsonb_typeof(data)='object' AND length(data->>'nameEn')>0)
);
CREATE INDEX IF NOT EXISTS "MaterialItem_company_code_idx" ON "MaterialItem"("orgId","baseId");
ALTER TABLE "MaterialItem" ADD COLUMN IF NOT EXISTS "policyAuditId" INTEGER;
DO $$ DECLARE entry record; BEGIN
 FOR entry IN SELECT * FROM (VALUES
 ('MaterialItem_orgId_fkey','FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT'),
 ('MaterialItem_unitId_fkey','FOREIGN KEY("unitId") REFERENCES "ExpenseUnit"(id) ON DELETE RESTRICT'),
 ('MaterialItem_ownerOrgId_fkey','FOREIGN KEY("ownerOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT'),
 ('MaterialItem_customerId_fkey','FOREIGN KEY("customerId") REFERENCES "Organization"(id) ON DELETE RESTRICT'),
 ('MaterialItem_colorId_fkey','FOREIGN KEY("colorId") REFERENCES "AttrColor"(id) ON DELETE RESTRICT'),
 ('MaterialItem_industry_fkey','FOREIGN KEY("baseId","industryId") REFERENCES "AccountingCodeIndustry"("baseId","systemIndustryId") ON DELETE RESTRICT ON UPDATE RESTRICT'),
 ('MaterialItem_actor_fkey','FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT'),
 ('MaterialItem_type_fkey','FOREIGN KEY("typeId","orgId") REFERENCES "CodeItemType"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT'),
 ('MaterialItem_policy_fkey','FOREIGN KEY("policyAuditId","orgId","baseId") REFERENCES "ExpenseCodeLinkAudit"(id,"orgId","baseId") ON DELETE RESTRICT ON UPDATE RESTRICT'),
 ('MaterialItem_data_check','CHECK(jsonb_typeof(data)=''object'' AND length(data->>''nameEn'')>0)')
 ) definitions(name,definition) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=entry.name AND conrelid='"MaterialItem"'::regclass) THEN EXECUTE format('ALTER TABLE "MaterialItem" ADD CONSTRAINT %I %s',entry.name,entry.definition); END IF;
 END LOOP;
END $$;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "materialItemId" TEXT;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "materialItemSnapshot" JSONB;
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "materialItemId" TEXT;
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "materialItemSnapshot" JSONB;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Cost_material_item_fkey') THEN
  ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "Cost_material_item_fkey" FOREIGN KEY("materialItemId") REFERENCES "MaterialItem"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_material_item_fkey" FOREIGN KEY("materialItemId") REFERENCES "MaterialItem"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_material_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_data record; source_data record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'material master is immutable'; END IF;
 SELECT * INTO base_data FROM "TransactionCodeBase" WHERE id=NEW."baseId" FOR UPDATE;
 SELECT * INTO source_data FROM "SettingServiceDefault" WHERE id=NEW."industryId" FOR UPDATE;
 IF NOT base_data."isActive" OR NOT source_data."isActive" OR NOT source_data."materialManagement" OR NOT coalesce((base_data."materialSettings"->>'enabled')::boolean,false)
 OR (NEW.data->>'materialRevision')::int IS DISTINCT FROM base_data."materialRevision"
 OR (NEW.data->>'industryRevision')::int IS DISTINCT FROM source_data."materialManagementRevision"
 OR NEW."policyAuditId" IS DISTINCT FROM (SELECT "auditId" FROM "ExpenseCodeLinkPolicy" WHERE "orgId"=NEW."orgId" AND "baseId"=NEW."baseId")
 OR (NEW.data->>'policyAuditId')::int IS DISTINCT FROM NEW."policyAuditId"
 OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT'))
 OR (NEW."typeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CodeItemType" WHERE id=NEW."typeId" AND "orgId"=NEW."orgId" AND "baseId"=NEW."baseId")) THEN RAISE EXCEPTION 'invalid material master scope or settings'; END IF;
 IF (NEW.data->>'itemOwnerOrgId')::int IS DISTINCT FROM NEW."ownerOrgId" OR (NEW.data->>'itemCustomerId')::int IS DISTINCT FROM NEW."customerId" OR (NEW.data->>'itemTypeId')::int IS DISTINCT FROM NEW."typeId" OR (NEW.data->'unit'->>'id')::int IS DISTINCT FROM NEW."unitId" OR (NEW.data->'color'->>'id')::int IS DISTINCT FROM NEW."colorId" THEN RAISE EXCEPTION 'invalid material master snapshot identity'; END IF;
 IF NEW."ownerOrgId" IS NOT NULL AND NEW.data->'itemOwnerSnapshot' IS DISTINCT FROM (SELECT jsonb_build_object('id',id,'code',code,'name',name,'nameKo',"nameKo",'nameVi',"nameVi") FROM "Organization" WHERE id=NEW."ownerOrgId") THEN RAISE EXCEPTION 'invalid material owner snapshot'; END IF;
 IF NEW.data->'unit' IS DISTINCT FROM (SELECT to_jsonb(u) FROM "ExpenseUnit" u WHERE id=NEW."unitId") OR NEW."colorId" IS NOT NULL AND NEW.data->'color' IS DISTINCT FROM (SELECT to_jsonb(c) FROM "AttrColor" c WHERE id=NEW."colorId") THEN RAISE EXCEPTION 'invalid material unit or color snapshot'; END IF;
 IF NEW.data->'inputSettings'->'requiredFields' ? 'length' AND EXISTS(SELECT 1 FROM unnest(ARRAY['length','width','height']) f WHERE coalesce(NEW.data->'details'->>f,'') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' OR (NEW.data->'details'->>f)::numeric<=0) THEN RAISE EXCEPTION 'material LWH required'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "MaterialItem_guard" ON "MaterialItem";
CREATE TRIGGER "MaterialItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MaterialItem" FOR EACH ROW EXECUTE FUNCTION baro_material_item_guard();
CREATE OR REPLACE FUNCTION baro_material_selection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE master record; base_id int; expected jsonb; enabled boolean;
BEGIN
 SELECT c."baseId",coalesce((b."materialSettings"->>'enabled')::boolean,false) INTO base_id,enabled FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" WHERE c.id=CASE WHEN TG_TABLE_NAME='PartnerTransactionCost' THEN (to_jsonb(NEW)->>'transactionCodeId')::int ELSE (to_jsonb(NEW)->>'accountingCodeId')::int END AND c."ownerOrgId"=NEW."orgId";
 IF TG_OP='UPDATE' AND NEW."materialItemId" IS NOT DISTINCT FROM OLD."materialItemId" AND NEW."orgId"=OLD."orgId" THEN
  IF NEW."materialItemSnapshot" IS DISTINCT FROM OLD."materialItemSnapshot" THEN RAISE EXCEPTION 'material selection snapshot is immutable'; END IF;
 END IF;
 IF NEW."materialItemId" IS NULL THEN
  IF NEW."materialItemSnapshot" IS NOT NULL AND NEW."materialItemSnapshot"<>'null'::jsonb THEN RAISE EXCEPTION 'material snapshot without item'; END IF;
  IF TG_OP='UPDATE' AND enabled AND (OLD."materialItemId" IS NOT NULL OR to_jsonb(NEW)->>'transactionCodeId' IS DISTINCT FROM to_jsonb(OLD)->>'transactionCodeId' OR to_jsonb(NEW)->>'accountingCodeId' IS DISTINCT FROM to_jsonb(OLD)->>'accountingCodeId') AND (TG_TABLE_NAME='PartnerTransactionCost' AND to_jsonb(NEW)->>'outsourcedWorkRecordId' IS NULL OR TG_TABLE_NAME='BankLedgerEntry' AND to_jsonb(NEW)->>'evidenceType'='FILE' AND to_jsonb(NEW)->>'counterpartyAccountId' IS NULL) THEN RAISE EXCEPTION 'material item required'; END IF;
  IF TG_OP='INSERT' AND enabled AND (TG_TABLE_NAME='PartnerTransactionCost' AND to_jsonb(NEW)->>'outsourcedWorkRecordId' IS NULL OR TG_TABLE_NAME='BankLedgerEntry' AND to_jsonb(NEW)->>'evidenceType'='FILE' AND to_jsonb(NEW)->>'counterpartyAccountId' IS NULL AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" original WHERE original.id=to_jsonb(NEW)->>'revisesEntryId' AND original."orgId"=NEW."orgId" AND original."accountingCodeId"=(to_jsonb(NEW)->>'accountingCodeId')::int AND original."evidenceType"='FILE' AND original."materialItemId" IS NULL)) THEN RAISE EXCEPTION 'material item required'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO master FROM "MaterialItem" WHERE id=NEW."materialItemId" AND "orgId"=NEW."orgId" AND "baseId"=base_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid material selection scope'; END IF;
 expected:=jsonb_build_object('id',master.id,'baseId',master."baseId",'industryId',master."industryId",'unitId',master."unitId")||master.data;
 IF NEW."materialItemSnapshot" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'invalid material selection snapshot'; END IF;
 IF TG_TABLE_NAME='PartnerTransactionCost' THEN
  IF NEW."itemOwnerOrgId" IS DISTINCT FROM master."ownerOrgId" OR NEW."itemCustomerId" IS DISTINCT FROM master."customerId" OR NEW."itemTypeId" IS DISTINCT FROM master."typeId" OR NEW."unitId" IS DISTINCT FROM master."unitId"
  OR coalesce(NEW."itemOwnerSnapshot",'null'::jsonb) IS DISTINCT FROM coalesce(master.data->'itemOwnerSnapshot','null'::jsonb) OR coalesce(NEW."itemAttributeSnapshot",'null'::jsonb) IS DISTINCT FROM coalesce(master.data->'itemAttributeSnapshot','null'::jsonb)
  OR coalesce(NEW.details->>'length','')<>coalesce(master.data->'details'->>'length','') OR coalesce(NEW.details->>'width','')<>coalesce(master.data->'details'->>'width','') OR coalesce(NEW.details->>'height','')<>coalesce(master.data->'details'->>'height','') THEN RAISE EXCEPTION 'material specification mismatch'; END IF;
 ELSE
  IF NEW."evidenceType"<>'FILE' OR NEW."counterpartyAccountId" IS NOT NULL THEN RAISE EXCEPTION 'material selection requires direct bank evidence'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "000_Cost_material_selection" ON "PartnerTransactionCost";
CREATE TRIGGER "000_Cost_material_selection" BEFORE INSERT OR UPDATE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_material_selection_guard();
DROP TRIGGER IF EXISTS "000_Ledger_material_selection" ON "BankLedgerEntry";
CREATE TRIGGER "000_Ledger_material_selection" BEFORE INSERT OR UPDATE ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_material_selection_guard();
-- Master snapshots supersede the individual attribute checks; non-material writes retain them.
DO $$ DECLARE name text; definition text; marker text:='IF NEW."materialItemId" IS NOT NULL THEN RETURN NEW; END IF;'; BEGIN
 FOREACH name IN ARRAY ARRAY['baro_material_owner_guard','baro_cost_item_attributes_guard'] LOOP
  definition:=pg_get_functiondef((name||'()')::regprocedure);
  IF position(marker in definition)=0 THEN EXECUTE overlay(definition placing ('BEGIN '||marker) from position('BEGIN' in definition) for 5); END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION baro_material_settings_in_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='TransactionCodeBase' AND coalesce((to_jsonb(NEW)->'materialSettings'->>'enabled')::boolean,false)=false AND EXISTS(SELECT 1 FROM "MaterialItem" WHERE "baseId"=NEW.id) THEN RAISE EXCEPTION 'registered material prevents disabling'; END IF;
 IF TG_TABLE_NAME='SettingServiceDefault' AND NOT (to_jsonb(NEW)->>'materialManagement')::boolean AND EXISTS(SELECT 1 FROM "MaterialItem" WHERE "industryId"=NEW.id) THEN RAISE EXCEPTION 'registered material prevents disabling'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Material_base_settings_guard" ON "TransactionCodeBase";
CREATE TRIGGER "Material_base_settings_guard" BEFORE UPDATE ON "TransactionCodeBase" FOR EACH ROW EXECUTE FUNCTION baro_material_settings_in_use();
DROP TRIGGER IF EXISTS "Material_industry_settings_guard" ON "SettingServiceDefault";
CREATE TRIGGER "Material_industry_settings_guard" BEFORE UPDATE ON "SettingServiceDefault" FOR EACH ROW EXECUTE FUNCTION baro_material_settings_in_use();
-- New and explicitly changed dimensions require all three axes; keep old snapshots unchanged.
CREATE OR REPLACE FUNCTION baro_cost_dimensions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text; value text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.details->>'length' IS NOT DISTINCT FROM OLD.details->>'length' AND NEW.details->>'width' IS NOT DISTINCT FROM OLD.details->>'width' AND NEW.details->>'height' IS NOT DISTINCT FROM OLD.details->>'height' THEN RETURN NEW; END IF;
 IF coalesce(NEW.details->>'length','')<>'' OR coalesce(NEW.details->>'width','')<>'' OR coalesce(NEW.details->>'height','')<>'' THEN
  FOREACH field IN ARRAY ARRAY['length','width','height'] LOOP
   value:=NEW.details->>field;
   IF coalesce(value,'') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' OR value::numeric<=0 THEN RAISE EXCEPTION 'positive length width height required'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
DO $migration$
DECLARE definition text; anchor text:=' FOREACH field IN ARRAY fields LOOP'; addition text:=$addition$
 -- MATERIAL_ITEM_DIMENSIONS_V1
 fields:=array_remove(fields,'reference');
 IF NEW."materialItemId" IS NOT NULL OR (TG_OP='UPDATE' AND coalesce((SELECT (b."materialSettings"->>'enabled')::boolean FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" WHERE c.id=NEW."transactionCodeId"),false) AND NEW.details->>'length' IS NOT DISTINCT FROM OLD.details->>'length' AND NEW.details->>'width' IS NOT DISTINCT FROM OLD.details->>'width' AND NEW.details->>'height' IS NOT DISTINCT FROM OLD.details->>'height') THEN
  fields:=ARRAY(SELECT f FROM unnest(fields) f WHERE f NOT IN ('length','width','height'));
 END IF;
$addition$;
BEGIN
 definition:=pg_get_functiondef('baro_transaction_cost_guard()'::regprocedure);
 IF position('MATERIAL_ITEM_DIMENSIONS_V1' in definition)=0 THEN
  IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'material cost guard anchor missing'; END IF;
  EXECUTE replace(definition,anchor,addition||anchor);
 END IF;
END $migration$;
-- Rollback: disable the new entry points; retain catalogue, FKs, snapshots and receipts.
