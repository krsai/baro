-- Keep existing item references and enforce the new definition only on insertion.
CREATE OR REPLACE FUNCTION baro_material_master_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settings jsonb; BEGIN
 IF NEW."ownerOrgId" IS NOT NULL OR NEW."typeId" IS NOT NULL
 OR coalesce(NEW.data->'inputSettings'->'attributeInputs'->>'owner','HIDDEN')<>'HIDDEN'
 OR coalesce(NEW.data->'inputSettings'->'attributeInputs'->>'type','HIDDEN')<>'HIDDEN'
 THEN RAISE EXCEPTION 'material master does not use movement attributes'; END IF;
 SELECT "materialSettings"->'masterInputs' INTO settings FROM "TransactionCodeBase" WHERE id=NEW."baseId";
 IF settings IS NULL THEN RETURN NEW; END IF;
 IF (coalesce(settings->>'dimensions','HIDDEN')='REQUIRED') IS DISTINCT FROM (NEW.data->'inputSettings'->'requiredFields' ? 'length') OR coalesce(NEW.data->'inputSettings'->'materialSettings'->>'colorInput','HIDDEN')<>coalesce(settings->>'color','HIDDEN') THEN RAISE EXCEPTION 'material master configuration changed'; END IF;
 IF settings->>'color'='REQUIRED' AND NEW."colorId" IS NULL THEN RAISE EXCEPTION 'material color required'; END IF;
 IF coalesce(settings->>'color','HIDDEN')='HIDDEN' AND NEW."colorId" IS NOT NULL THEN RAISE EXCEPTION 'unexpected material color'; END IF;
 IF coalesce(settings->>'dimensions','HIDDEN')='HIDDEN' AND EXISTS(SELECT 1 FROM unnest(ARRAY['length','width','height']) axis WHERE coalesce(NEW.data->'details'->>axis,'')<>'') THEN RAISE EXCEPTION 'unexpected material dimensions'; END IF;
 RETURN NEW; END $$;

DROP TRIGGER IF EXISTS "MaterialItem_configuration_guard" ON "MaterialItem";
CREATE TRIGGER "MaterialItem_configuration_guard" BEFORE INSERT ON "MaterialItem" FOR EACH ROW EXECUTE FUNCTION baro_material_master_definition_guard();
