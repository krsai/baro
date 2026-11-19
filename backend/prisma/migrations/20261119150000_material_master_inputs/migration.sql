-- Separate master requirements from accounting-entry requirements.
CREATE OR REPLACE FUNCTION baro_material_settings_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(settings)='object'
 AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(settings)='object' THEN settings ELSE '{}'::jsonb END) k WHERE k NOT IN ('enabled','stockFields','colorInput','unitInput','masterInputs'))
 AND (NOT settings ? 'masterInputs' OR (jsonb_typeof(settings->'masterInputs')='object' AND NOT EXISTS(SELECT 1 FROM jsonb_each(settings->'masterInputs') e WHERE e.key NOT IN ('owner','customer','type','color','dimensions') OR e.value NOT IN ('"REQUIRED"'::jsonb,'"HIDDEN"'::jsonb))))
 AND jsonb_typeof(settings->'enabled')='boolean'
 AND settings->>'colorInput' IN ('HIDDEN','OPTIONAL','REQUIRED') AND settings->>'unitInput'='REQUIRED'
 AND jsonb_typeof(settings->'stockFields')='array'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(settings->'stockFields')='array' THEN settings->'stockFields' ELSE '[]'::jsonb END) f WHERE jsonb_typeof(f)<>'string' OR f #>> '{}' NOT IN ('customer','type','color','unit','dimensions'))
 AND (SELECT count(*)=count(DISTINCT f) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(settings->'stockFields')='array' THEN settings->'stockFields' ELSE '[]'::jsonb END) f)
 AND (settings->>'enabled'='false' OR settings->'stockFields' ? 'unit'),false)
$$;
CREATE OR REPLACE FUNCTION baro_material_inputs_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT NOT (settings ? 'materialSettings') OR coalesce(baro_material_settings_valid(settings->'materialSettings') AND (
 settings->'materialSettings'->>'enabled'='false' OR settings->'materialSettings' ? 'masterInputs' OR NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(settings->'materialSettings'->'stockFields')='array' THEN settings->'materialSettings'->'stockFields' ELSE '[]'::jsonb END) k
 WHERE CASE k WHEN 'customer' THEN coalesce(settings->'attributeInputs'->>'customer','HIDDEN')='HIDDEN'
 WHEN 'type' THEN coalesce(settings->'attributeInputs'->>'type','HIDDEN')='HIDDEN'
 WHEN 'color' THEN settings->'materialSettings'->>'colorInput'='HIDDEN'
 WHEN 'dimensions' THEN NOT coalesce(settings->'requiredFields' ? 'length',false) ELSE false END)),false)
$$;

CREATE OR REPLACE FUNCTION baro_material_master_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settings jsonb; f text; BEGIN
 SELECT "materialSettings"->'masterInputs' INTO settings FROM "TransactionCodeBase" WHERE id=NEW."baseId";
 IF settings IS NULL THEN RETURN NEW; END IF;
 FOR f IN SELECT unnest(ARRAY['owner','customer','type']) LOOP
 IF coalesce(NEW.data->'inputSettings'->'attributeInputs'->>f,'HIDDEN')<>coalesce(settings->>f,'HIDDEN') THEN RAISE EXCEPTION 'material master configuration changed'; END IF;
 IF settings->>f='REQUIRED' AND (CASE f WHEN 'owner' THEN NEW."ownerOrgId" WHEN 'customer' THEN NEW."customerId" ELSE NEW."typeId" END) IS NULL THEN RAISE EXCEPTION 'required material attribute'; END IF;
 IF coalesce(settings->>f,'HIDDEN')='HIDDEN' AND (CASE f WHEN 'owner' THEN NEW."ownerOrgId" WHEN 'customer' THEN NEW."customerId" ELSE NEW."typeId" END) IS NOT NULL THEN RAISE EXCEPTION 'unexpected material attribute'; END IF;
 END LOOP;
 IF (coalesce(settings->>'dimensions','HIDDEN')='REQUIRED') IS DISTINCT FROM (NEW.data->'inputSettings'->'requiredFields' ? 'length') OR coalesce(NEW.data->'inputSettings'->'materialSettings'->>'colorInput','HIDDEN')<>coalesce(settings->>'color','HIDDEN') THEN RAISE EXCEPTION 'material master configuration changed'; END IF;
 IF settings->>'color'='REQUIRED' AND NEW."colorId" IS NULL THEN RAISE EXCEPTION 'material color required'; END IF;
 IF coalesce(settings->>'color','HIDDEN')='HIDDEN' AND NEW."colorId" IS NOT NULL THEN RAISE EXCEPTION 'unexpected material color'; END IF;
 IF coalesce(settings->>'dimensions','HIDDEN')='HIDDEN' AND EXISTS(SELECT 1 FROM unnest(ARRAY['length','width','height']) axis WHERE coalesce(NEW.data->'details'->>axis,'')<>'') THEN RAISE EXCEPTION 'unexpected material dimensions'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS "MaterialItem_configuration_guard" ON "MaterialItem";
CREATE TRIGGER "MaterialItem_configuration_guard" BEFORE INSERT ON "MaterialItem" FOR EACH ROW EXECUTE FUNCTION baro_material_master_configuration();
-- No existing settings, materials, financial snapshots or audit receipts are rewritten.
-- Rollback: stop new master-setting writes and retain the additive validator and history.
