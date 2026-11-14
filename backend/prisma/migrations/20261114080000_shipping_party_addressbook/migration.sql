-- Unlinked third parties belong to the customer's private address book, not Organization.
-- Linked parties retain their verified company name. Do not rewrite existing rows/snapshots.
CREATE OR REPLACE FUNCTION baro_shipping_preset_party_addressbook() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='PARTY' AND NEW."deletedAt" IS NULL AND
    (TG_OP='INSERT' OR NEW.data IS DISTINCT FROM OLD.data OR NEW."partyId" IS DISTINCT FROM OLD."partyId") THEN
  IF NEW."partyId" IS NOT NULL THEN
   NEW.data=NEW.data-'name';
  ELSIF NEW.data ? 'name' AND (jsonb_typeof(NEW.data->'name')<>'string' OR length(NEW.data->>'name')>200) THEN
   RAISE EXCEPTION 'SHIPPING_INVALID';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingPreset_contact_only" ON "ShippingPreset";
CREATE TRIGGER "ShippingPreset_contact_only" BEFORE INSERT OR UPDATE ON "ShippingPreset"
 FOR EACH ROW EXECUTE FUNCTION baro_shipping_preset_party_addressbook();
-- Retry is idempotent; no data updates. Rollback by stopping address-book writes and
-- deploying the compatible app. Preserve preset names, FK, revisions, audit and snapshots.
