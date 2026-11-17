-- Reusable attributes, not one column or code per customer/label subtype.
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "attributeInputs" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "itemCustomerId" INTEGER REFERENCES "Organization"(id) ON DELETE RESTRICT;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "itemTypeId" INTEGER;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "itemAttributeSnapshot" JSONB;
CREATE TABLE IF NOT EXISTS "CodeItemType" (
 id SERIAL PRIMARY KEY,
 "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "baseId" INTEGER NOT NULL REFERENCES "TransactionCodeBase"(id) ON DELETE RESTRICT,
 "nameKey" TEXT NOT NULL,
 "nameKo" TEXT NOT NULL,"nameEn" TEXT NOT NULL,"nameVi" TEXT NOT NULL,
 "createdByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId"),UNIQUE("orgId","baseId","nameKey"),
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Cost_item_type_scope_fkey') THEN
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "Cost_item_type_scope_fkey" FOREIGN KEY("itemTypeId","orgId") REFERENCES "CodeItemType"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_code_attribute_inputs_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT settings IS NULL OR coalesce(jsonb_typeof(settings)='object' AND NOT EXISTS(
 SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(settings)='object' THEN settings ELSE '{}'::jsonb END) pair
 WHERE pair.key NOT IN ('customer','type') OR pair.value #>> '{}' NOT IN ('REQUIRED','OPTIONAL','HIDDEN') OR jsonb_typeof(pair.value)<>'string'),false)
$$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='CodeBase_attribute_inputs_check') THEN
 ALTER TABLE "TransactionCodeBase" ADD CONSTRAINT "CodeBase_attribute_inputs_check" CHECK(baro_code_attribute_inputs_valid("attributeInputs"));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_code_item_type_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'item type identity is immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'active item type actor required'; END IF;
 IF length(trim(NEW."nameEn")) NOT BETWEEN 1 AND 100 OR length(NEW."nameKo")>100 OR length(NEW."nameVi")>100 OR length(NEW."nameKey") NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid item type name'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "CodeItemType_guard" ON "CodeItemType";
CREATE TRIGGER "CodeItemType_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CodeItemType" FOR EACH ROW EXECUTE FUNCTION baro_code_item_type_guard();
CREATE OR REPLACE FUNCTION baro_cost_item_attributes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_id integer; settings jsonb; field text; val integer; customer jsonb; subtype jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW."transactionCodeId" IS NOT DISTINCT FROM OLD."transactionCodeId" AND NEW."itemCustomerId" IS NOT DISTINCT FROM OLD."itemCustomerId" AND NEW."itemTypeId" IS NOT DISTINCT FROM OLD."itemTypeId" THEN
  IF NEW."itemAttributeSnapshot" IS DISTINCT FROM OLD."itemAttributeSnapshot" THEN RAISE EXCEPTION 'item attribute snapshot is immutable without selection change'; END IF;
  RETURN NEW;
 END IF;
 SELECT c."baseId",CASE WHEN a."inputSettings" IS NOT NULL THEN coalesce(a."inputSettings"->'attributeInputs','{}'::jsonb) ELSE coalesce(b."attributeInputs",'{}'::jsonb) END INTO base_id,settings
 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId"
 LEFT JOIN "ExpenseCodeLinkAudit" a ON a.id=NEW."linkPolicyAuditId" AND a."orgId"=NEW."orgId"
 WHERE c.id=NEW."transactionCodeId" AND c."ownerOrgId"=NEW."orgId";
 FOREACH field IN ARRAY ARRAY['customer','type'] LOOP
  val:=CASE WHEN field='customer' THEN NEW."itemCustomerId" ELSE NEW."itemTypeId" END;
  IF settings->>field='REQUIRED' AND val IS NULL THEN RAISE EXCEPTION 'required item attribute: %',field; END IF;
  IF coalesce(settings->>field,'HIDDEN')='HIDDEN' AND val IS NOT NULL THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'unexpected item attribute: %',field; END IF;
   IF field='customer' AND NEW."itemCustomerId" IS DISTINCT FROM OLD."itemCustomerId" OR field='type' AND NEW."itemTypeId" IS DISTINCT FROM OLD."itemTypeId" THEN RAISE EXCEPTION 'unexpected item attribute: %',field; END IF;
  END IF;
 END LOOP;
 IF NEW."itemCustomerId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "OrgRelationship" WHERE ("manufacturerOrgId"=NEW."orgId" AND "brandOrgId"=NEW."itemCustomerId") OR ("brandOrgId"=NEW."orgId" AND "manufacturerOrgId"=NEW."itemCustomerId")) THEN RAISE EXCEPTION 'invalid item customer scope'; END IF;
  SELECT jsonb_build_object('id',id,'code',code,'name',name,'nameKo',"nameKo",'nameVi',"nameVi") INTO customer FROM "Organization" WHERE id=NEW."itemCustomerId";
 END IF;
 IF NEW."itemTypeId" IS NOT NULL THEN
  SELECT jsonb_build_object('id',id,'nameKo',"nameKo",'nameEn',"nameEn",'nameVi',"nameVi") INTO subtype FROM "CodeItemType" WHERE id=NEW."itemTypeId" AND "orgId"=NEW."orgId" AND "baseId"=base_id;
  IF subtype IS NULL THEN RAISE EXCEPTION 'invalid item type scope'; END IF;
 END IF;
 NEW."itemAttributeSnapshot":=CASE WHEN customer IS NULL AND subtype IS NULL THEN NULL ELSE jsonb_build_object('customer',customer,'type',subtype) END;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Cost_item_attributes_guard" ON "PartnerTransactionCost";
CREATE TRIGGER "Cost_item_attributes_guard" BEFORE INSERT OR UPDATE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_cost_item_attributes_guard();

-- Extend input settings only; do not rewrite historical policies, costs or audits.
CREATE OR REPLACE FUNCTION baro_accounting_inputs_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT settings IS NULL OR coalesce(jsonb_typeof(settings)='object' AND settings->>'orderInput' IN ('REQUIRED','OPTIONAL','HIDDEN')
 AND settings->>'styleInput' IN ('REQUIRED','OPTIONAL','HIDDEN') AND settings->>'processInput' IN ('REQUIRED','OPTIONAL','HIDDEN')
 AND jsonb_typeof(settings->'requiredFields')='array'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(settings->'requiredFields')='array' THEN settings->'requiredFields' ELSE '[]'::jsonb END) f WHERE f NOT IN ('transportDate','origin','destination','reference','length','width'))
 AND ((settings->'requiredFields' ? 'length')=(settings->'requiredFields' ? 'width'))
 AND (settings->>'styleInput'='HIDDEN' OR settings->>'orderInput'<>'HIDDEN')
 AND (settings->>'processInput'='HIDDEN' OR settings->>'styleInput'<>'HIDDEN' AND settings->>'orderInput'<>'HIDDEN')
 AND (settings->>'styleInput'<>'REQUIRED' OR settings->>'orderInput'='REQUIRED')
 AND (settings->>'processInput'<>'REQUIRED' OR settings->>'styleInput'='REQUIRED'),false) AND baro_code_attribute_inputs_valid(settings->'attributeInputs')
$$;

