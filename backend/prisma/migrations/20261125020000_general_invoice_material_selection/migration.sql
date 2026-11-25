-- Additive only: preserve issued lines and their original snapshots.
ALTER TABLE "InvoiceGeneralLine" ADD COLUMN IF NOT EXISTS "unitId" integer;
ALTER TABLE "InvoiceGeneralLine" ADD COLUMN IF NOT EXISTS "materialItemId" text;
ALTER TABLE "InvoiceGeneralLine" ADD COLUMN IF NOT EXISTS "materialItemSnapshot" jsonb;
ALTER TABLE "InvoiceGeneralLine" ADD COLUMN IF NOT EXISTS "materialBaseId" integer GENERATED ALWAYS AS (("materialItemSnapshot"->>'baseId')::integer) STORED;
ALTER TABLE "InvoiceGeneralLine" ADD COLUMN IF NOT EXISTS "materialVariantId" text GENERATED ALWAYS AS ("materialItemSnapshot"->>'variantId') STORED;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InvoiceGeneralLine_material_scope_fkey') THEN
  ALTER TABLE "InvoiceGeneralLine" ADD CONSTRAINT "InvoiceGeneralLine_material_scope_fkey" FOREIGN KEY ("materialItemId","sellerOrgId","materialBaseId") REFERENCES "MaterialItem"(id,"orgId","baseId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InvoiceGeneralLine_variant_scope_fkey') THEN
  ALTER TABLE "InvoiceGeneralLine" ADD CONSTRAINT "InvoiceGeneralLine_variant_scope_fkey" FOREIGN KEY ("materialVariantId","sellerOrgId","materialItemId") REFERENCES "InventoryVariant"(id,"orgId","masterId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InvoiceGeneralLine_unit_fkey') THEN
  ALTER TABLE "InvoiceGeneralLine" ADD CONSTRAINT "InvoiceGeneralLine_unit_fkey" FOREIGN KEY ("unitId") REFERENCES "ExpenseUnit"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InvoiceGeneralLine_material_link_check') THEN
  ALTER TABLE "InvoiceGeneralLine" ADD CONSTRAINT "InvoiceGeneralLine_material_link_check" CHECK (
   ("materialItemId" IS NULL AND "materialItemSnapshot" IS NULL) OR
   COALESCE(("materialItemId" IS NOT NULL AND "materialItemSnapshot" IS NOT NULL AND "materialBaseId" IS NOT NULL AND "materialVariantId" IS NOT NULL AND "unitId" IS NOT NULL AND "materialItemSnapshot"->>'id'="materialItemId" AND ("materialItemSnapshot"->>'unitId')::integer="unitId"),false)
  );
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_invoice_material_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."materialItemId" IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM "TransactionCode" code JOIN "MaterialItem" item ON item."baseId"=code."baseId" AND item."orgId"=code."ownerOrgId"
  WHERE code.id=NEW."transactionCodeId" AND code."ownerOrgId"=NEW."sellerOrgId" AND item.id=NEW."materialItemId" AND item."unitId"=NEW."unitId"
 ) THEN RAISE EXCEPTION 'INVALID_MATERIAL_ITEM'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InvoiceGeneralLine_material_guard" ON "InvoiceGeneralLine";
CREATE TRIGGER "InvoiceGeneralLine_material_guard" BEFORE INSERT ON "InvoiceGeneralLine" FOR EACH ROW EXECUTE FUNCTION baro_invoice_material_guard();
-- Rollback: roll the app back and stop new material links; keep additive columns,
-- restrictive FKs and immutable issued snapshots. No historical backfill or drop.
