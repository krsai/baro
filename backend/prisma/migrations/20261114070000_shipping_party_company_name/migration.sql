-- Company selection owns the name. Presets contain contact details only.
-- Existing presets, transport/document snapshots and audit rows are not rewritten.
CREATE OR REPLACE FUNCTION baro_shipping_preset_contact_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='PARTY' AND NEW."deletedAt" IS NULL AND
    (TG_OP='INSERT' OR NEW.data IS DISTINCT FROM OLD.data) THEN
  NEW.data=NEW.data-'name';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingPreset_contact_only" ON "ShippingPreset";
CREATE TRIGGER "ShippingPreset_contact_only" BEFORE INSERT OR UPDATE ON "ShippingPreset"
 FOR EACH ROW EXECUTE FUNCTION baro_shipping_preset_contact_only();
-- Rollback: stop preset writes and deploy a compatible app; retain all history and the guard.
