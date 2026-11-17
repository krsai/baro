-- Additive configuration only. No material, opening stock or historical rows are created.
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "materialSettings" JSONB NOT NULL DEFAULT '{"enabled":false,"stockFields":[],"colorInput":"HIDDEN","unitInput":"REQUIRED"}';
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "materialRevision" INTEGER NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION baro_material_settings_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(settings)='object'
 AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(settings)='object' THEN settings ELSE '{}'::jsonb END) k WHERE k NOT IN ('enabled','stockFields','colorInput','unitInput'))
 AND jsonb_typeof(settings->'enabled')='boolean'
 AND settings->>'colorInput' IN ('HIDDEN','OPTIONAL','REQUIRED') AND settings->>'unitInput'='REQUIRED'
 AND jsonb_typeof(settings->'stockFields')='array'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(settings->'stockFields')='array' THEN settings->'stockFields' ELSE '[]'::jsonb END) f WHERE jsonb_typeof(f)<>'string' OR f #>> '{}' NOT IN ('customer','type','color','unit','dimensions'))
 AND (SELECT count(*)=count(DISTINCT f) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(settings->'stockFields')='array' THEN settings->'stockFields' ELSE '[]'::jsonb END) f)
 AND (settings->>'enabled'='false' OR settings->'stockFields' ? 'unit'),false)
$$;
CREATE OR REPLACE FUNCTION baro_material_inputs_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT NOT (settings ? 'materialSettings') OR coalesce(baro_material_settings_valid(settings->'materialSettings') AND (
 settings->'materialSettings'->>'enabled'='false' OR NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(settings->'materialSettings'->'stockFields')='array' THEN settings->'materialSettings'->'stockFields' ELSE '[]'::jsonb END) k
 WHERE CASE k WHEN 'customer' THEN coalesce(settings->'attributeInputs'->>'customer','HIDDEN')='HIDDEN'
 WHEN 'type' THEN coalesce(settings->'attributeInputs'->>'type','HIDDEN')='HIDDEN'
 WHEN 'color' THEN settings->'materialSettings'->>'colorInput'='HIDDEN'
 WHEN 'dimensions' THEN NOT coalesce(settings->'requiredFields' ? 'length',false) ELSE false END)),false)
$$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='CodeBase_material_settings_check') THEN
 ALTER TABLE "TransactionCodeBase" ADD CONSTRAINT "CodeBase_material_settings_check" CHECK("materialRevision">0 AND baro_material_inputs_valid(jsonb_build_object('materialSettings',"materialSettings",'attributeInputs',"attributeInputs",'requiredFields',to_jsonb("requiredFields"))));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseCodeLinkPolicy_material_check') THEN
 ALTER TABLE "ExpenseCodeLinkPolicy" ADD CONSTRAINT "ExpenseCodeLinkPolicy_material_check" CHECK("inputSettings" IS NULL OR baro_material_inputs_valid("inputSettings"));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseCodeLinkAudit_material_check') THEN
 ALTER TABLE "ExpenseCodeLinkAudit" ADD CONSTRAINT "ExpenseCodeLinkAudit_material_check" CHECK("inputSettings" IS NULL OR baro_material_inputs_valid("inputSettings"));
 END IF;
END $$;
-- New options require all three names. Existing immutable options are retained.
CREATE OR REPLACE FUNCTION baro_code_item_type_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'item type identity is immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'active item type actor required'; END IF;
 IF length(trim(NEW."nameEn")) NOT BETWEEN 1 AND 100 OR length(trim(NEW."nameKo")) NOT BETWEEN 1 AND 100 OR length(trim(NEW."nameVi")) NOT BETWEEN 1 AND 100 OR length(NEW."nameKey") NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid item type name'; END IF;
 RETURN NEW;
END $$;
