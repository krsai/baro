-- Add bill-specific working data without rewriting historical jobs or snapshots.
ALTER TABLE "FreightBill" ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "FreightBill" ADD CONSTRAINT "FreightBill_data_check" CHECK(jsonb_typeof(data)='object');
ALTER TABLE "FreightBill" ADD CONSTRAINT "FreightBill_charge_scope_key" UNIQUE(id,"jobId","orgId");
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "billId" TEXT;
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "partyId" INTEGER;
ALTER TABLE "ShippingChargeDraft" ADD CONSTRAINT "ShippingChargeDraft_party_fkey" FOREIGN KEY("partyId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS quantity NUMERIC(20,4);
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "unitPrice" NUMERIC(24,4);
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "sourceKind" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "ShippingChargeDraft" ADD CONSTRAINT "ShippingChargeDraft_bill_scope_fkey"
 FOREIGN KEY("billId","jobId","orgId") REFERENCES "FreightBill"(id,"jobId","orgId") ON DELETE RESTRICT;
ALTER TABLE "ShippingChargeDraft" ADD CONSTRAINT "ShippingChargeDraft_line_check"
 CHECK("sourceKind" IN ('MANUAL','ADDITIONAL') AND
 ((quantity IS NULL AND "unitPrice" IS NULL) OR
 (quantity IS NOT NULL AND "unitPrice" IS NOT NULL AND quantity>0 AND "unitPrice">=0 AND amount=round(quantity*"unitPrice",4))));
CREATE INDEX "ShippingChargeDraft_bill_idx" ON "ShippingChargeDraft"("orgId","jobId","billId");
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
  IF NEW."deletedAt" IS NULL AND EXISTS(SELECT 1 FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" AND data->'documentSetup'->>'composition'='MASTER_ONLY') AND
    (NEW.kind='HOUSE' OR EXISTS(SELECT 1 FROM "FreightBill" WHERE "jobId"=NEW."jobId" AND "orgId"=NEW."orgId" AND kind='MASTER' AND "deletedAt" IS NULL AND id<>NEW.id))
    THEN RAISE EXCEPTION 'FREIGHT_COMPOSITION_HAS_BILLS'; END IF;
  IF NEW.kind='HOUSE' AND NEW."masterId" IS NULL AND (TG_OP='INSERT' OR OLD."masterId" IS NOT NULL)
   THEN RAISE EXCEPTION 'FREIGHT_MASTER_REQUIRED'; END IF;
  IF NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "ShippingChargeDraft"
   WHERE "billId"=NEW.id AND "jobId"=NEW."jobId" AND "orgId"=NEW."orgId")
   THEN RAISE EXCEPTION 'FREIGHT_BILL_HAS_CHARGES'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ShippingChargeDraft_bill_guard" BEFORE INSERT OR UPDATE ON "ShippingChargeDraft"
 FOR EACH ROW EXECUTE FUNCTION baro_bill_charge_scope_guard();
CREATE TRIGGER "FreightBill_charge_guard" BEFORE INSERT OR UPDATE ON "FreightBill"
 FOR EACH ROW EXECUTE FUNCTION baro_bill_charge_scope_guard();
-- Rollback: stop bill-data/charge writes; retain columns, FKs, amounts and audits.
-- Existing unassigned charges remain unassigned; no inferred Master/House allocation.
