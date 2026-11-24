-- Documents are optional attachments to an accepted shipment. No historical data updates.
CREATE OR REPLACE FUNCTION baro_bill_charge_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='ShippingChargeDraft' THEN
  PERFORM 1 FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" FOR UPDATE;
  IF NEW."billId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "FreightBill"
   WHERE id=NEW."billId" AND "jobId"=NEW."jobId" AND "orgId"=NEW."orgId" AND "deletedAt" IS NULL)
   THEN RAISE EXCEPTION 'SHIPPING_BILL_SCOPE'; END IF;
  IF NEW."partyId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=NEW."partyId" AND p.id<>NEW."orgId" AND p."isActive"
   AND (p."ownerOrgId"=NEW."orgId" OR p."dataOwnerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id)))
   THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
 ELSE
  PERFORM 1 FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" FOR UPDATE;
  IF NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "ShippingChargeDraft"
   WHERE "billId"=NEW.id AND "jobId"=NEW."jobId" AND "orgId"=NEW."orgId")
   THEN RAISE EXCEPTION 'FREIGHT_BILL_HAS_CHARGES'; END IF;
  IF NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightDocument" WHERE "orgId"=NEW."orgId" AND "jobId"=NEW."jobId" AND (snapshot->'source'->'bill'->>'id'=NEW.id OR snapshot->'source'->'master'->>'id'=NEW.id)) THEN RAISE EXCEPTION 'FREIGHT_BILL_HAS_DOCUMENTS'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_shipping_optional_documents_ready() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
-- Idempotent: function replacement only, no rows, amounts, FKs or snapshots rewritten.
-- Rollback: stop attachment writes before returning to an older app. Preserve all
-- newly attached documents and audits; never restore old composition restrictions
-- against saved attachments or remove data to make an old app compatible.
