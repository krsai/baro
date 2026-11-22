-- Add private reusable requester contacts under the verified collection customer.
ALTER TABLE "ShippingPreset" DROP CONSTRAINT IF EXISTS "ShippingPreset_kind_check";
ALTER TABLE "ShippingPreset" ADD CONSTRAINT "ShippingPreset_kind_check" CHECK(kind IN ('PARTY','LOCATION','REQUESTER'));
CREATE OR REPLACE FUNCTION baro_shipping_requester_preset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='REQUESTER' THEN
  IF NEW."partyId" IS NOT NULL OR NOT EXISTS(
   SELECT 1 FROM "ShippingGeneralCustomer" g JOIN "Organization" o ON o.id=g."orgId"
   WHERE g."orgId"=NEW."orgId" AND g."customerId"=NEW."customerId" AND o.type::text='SERVICE'
  ) THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
  IF NEW."deletedAt" IS NULL AND (jsonb_typeof(NEW.data->'name') IS DISTINCT FROM 'string' OR length(btrim(NEW.data->>'name')) NOT BETWEEN 1 AND 200 OR jsonb_typeof(NEW.data->'phone') IS DISTINCT FROM 'string' OR (NEW.data->>'phone') !~ '^[0-9]{1,80}$') THEN RAISE EXCEPTION 'SHIPPING_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingPreset_requester_guard" ON "ShippingPreset";
CREATE TRIGGER "ShippingPreset_requester_guard" BEFORE INSERT OR UPDATE ON "ShippingPreset" FOR EACH ROW EXECUTE FUNCTION baro_shipping_requester_preset_guard();
-- Compatible app rollback: keep REQUESTER rows, soft deletions and audits. No job/snapshot rewrite.
