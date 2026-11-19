-- New material registrations do not use customer. Existing records and settings stay unchanged.
CREATE OR REPLACE FUNCTION baro_material_master_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settings jsonb; f text; BEGIN
 SELECT "materialSettings"->'masterInputs' INTO settings FROM "TransactionCodeBase" WHERE id=NEW."baseId";
 IF settings IS NULL THEN RETURN NEW; END IF;
 FOR f IN SELECT unnest(ARRAY['owner','type']) LOOP
 IF coalesce(NEW.data->'inputSettings'->'attributeInputs'->>f,'HIDDEN')<>coalesce(settings->>f,'HIDDEN') THEN RAISE EXCEPTION 'material master configuration changed'; END IF;
 IF settings->>f='REQUIRED' AND (CASE f WHEN 'owner' THEN NEW."ownerOrgId" WHEN 'customer' THEN NEW."customerId" ELSE NEW."typeId" END) IS NULL THEN RAISE EXCEPTION 'required material attribute'; END IF;
 IF coalesce(settings->>f,'HIDDEN')='HIDDEN' AND (CASE f WHEN 'owner' THEN NEW."ownerOrgId" WHEN 'customer' THEN NEW."customerId" ELSE NEW."typeId" END) IS NOT NULL THEN RAISE EXCEPTION 'unexpected material attribute'; END IF;
 END LOOP;
 IF (coalesce(settings->>'dimensions','HIDDEN')='REQUIRED') IS DISTINCT FROM (NEW.data->'inputSettings'->'requiredFields' ? 'length') OR coalesce(NEW.data->'inputSettings'->'materialSettings'->>'colorInput','HIDDEN')<>coalesce(settings->>'color','HIDDEN') THEN RAISE EXCEPTION 'material master configuration changed'; END IF;
 IF settings->>'color'='REQUIRED' AND NEW."colorId" IS NULL THEN RAISE EXCEPTION 'material color required'; END IF;
 IF coalesce(settings->>'color','HIDDEN')='HIDDEN' AND NEW."colorId" IS NOT NULL THEN RAISE EXCEPTION 'unexpected material color'; END IF;
 IF coalesce(settings->>'dimensions','HIDDEN')='HIDDEN' AND EXISTS(SELECT 1 FROM unnest(ARRAY['length','width','height']) axis WHERE coalesce(NEW.data->'details'->>axis,'')<>'') THEN RAISE EXCEPTION 'unexpected material dimensions'; END IF;
 RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION baro_material_master_no_customer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."customerId" IS NOT NULL OR coalesce(NEW.data->'inputSettings'->'attributeInputs'->>'customer','HIDDEN')<>'HIDDEN' THEN RAISE EXCEPTION 'material master does not use customer'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS "MaterialItem_no_customer_guard" ON "MaterialItem";
CREATE TRIGGER "MaterialItem_no_customer_guard" BEFORE INSERT ON "MaterialItem" FOR EACH ROW EXECUTE FUNCTION baro_material_master_no_customer();
-- Rollback: stop new writes; preserve existing master/document FKs and snapshots.
