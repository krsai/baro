-- Additive only. Historical expenses and payments retain their original snapshots.
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "expenseComparison" jsonb;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "materialVariantId" text
 GENERATED ALWAYS AS ("materialItemSnapshot"->>'variantId') STORED;
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryVariant_expense_scope_key" ON "InventoryVariant"(id,"orgId","masterId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Cost_material_variant_scope_fkey') THEN
  ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "Cost_material_variant_scope_fkey"
   FOREIGN KEY ("materialVariantId","orgId","materialItemId") REFERENCES "InventoryVariant"(id,"orgId","masterId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_variant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='InventoryVariant' THEN
  IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE "orgId"=OLD."orgId" AND "materialVariantId"=OLD.id) THEN
   RAISE EXCEPTION 'VARIANT_IN_USE';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW."materialItemId" IS NOT DISTINCT FROM OLD."materialItemId" AND NEW."materialItemSnapshot" IS NOT DISTINCT FROM OLD."materialItemSnapshot" THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "InventoryMovement" m WHERE m."orgId"=NEW."orgId" AND m."expenseItemId"=NEW.id AND m."variantId" IS DISTINCT FROM NEW."materialItemSnapshot"->>'variantId') THEN RAISE EXCEPTION 'VARIANT_IN_USE'; END IF;
 IF NEW."materialItemSnapshot"->>'variantId' IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM "InventoryVariant" v WHERE v.id=NEW."materialItemSnapshot"->>'variantId' AND v."orgId"=NEW."orgId" AND v."masterId"=NEW."materialItemId"
   AND v.revision::text=NEW."materialItemSnapshot"->>'variantRevision'
 ) THEN RAISE EXCEPTION 'VARIANT_CHANGED'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_expense_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='InventoryMovement' THEN
  IF NEW."purchaseRequired" AND (TG_OP='INSERT' OR OLD.status='PENDING' AND NEW.status='APPROVED') AND EXISTS(
   SELECT 1 FROM "PartnerTransactionCost" c WHERE c.id=NEW."expenseItemId" AND c."orgId"=NEW."orgId" AND c."materialVariantId" IS NOT NULL AND c."materialVariantId"<>NEW."variantId"
  ) THEN RAISE EXCEPTION 'INVALID_INVENTORY_PURCHASE'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW."expenseComparison" IS DISTINCT FROM OLD."expenseComparison" THEN RAISE EXCEPTION 'expense payment comparison is immutable'; END IF;
 IF NEW."expenseComparison" IS NOT NULL AND (
  NEW."evidenceType"<>'EXPENSE' OR NEW."expenseComparison"->>'currency' IS DISTINCT FROM (SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "orgId"=NEW."orgId")
  OR (NEW."expenseComparison"->>'actual')::numeric+NEW."bankFee"<>NEW.amount
  OR (NEW."expenseComparison"->>'differs')::boolean AND (coalesce(btrim(NEW."expenseComparison"->>'reason'),'')='' OR NEW."expenseComparison"->>'reason' IS DISTINCT FROM btrim(NEW.purpose))
 ) THEN RAISE EXCEPTION 'invalid expense payment comparison'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankLedger_expense_comparison_guard" ON "BankLedgerEntry";
CREATE TRIGGER "BankLedger_expense_comparison_guard" BEFORE INSERT OR UPDATE ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_expense_payment_guard();
DROP TRIGGER IF EXISTS "InventoryMovement_expense_variant_guard" ON "InventoryMovement";
CREATE TRIGGER "InventoryMovement_expense_variant_guard" BEFORE INSERT OR UPDATE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION baro_expense_payment_guard();
DROP TRIGGER IF EXISTS "Cost_material_variant_guard" ON "PartnerTransactionCost";
CREATE TRIGGER "Cost_material_variant_guard" BEFORE INSERT OR UPDATE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_expense_variant_guard();
DROP TRIGGER IF EXISTS "InventoryVariant_expense_guard" ON "InventoryVariant";
CREATE TRIGGER "InventoryVariant_expense_guard" BEFORE UPDATE OR DELETE ON "InventoryVariant" FOR EACH ROW EXECUTE FUNCTION baro_expense_variant_guard();

-- Keep the existing selection/snapshot guards, validating variant attributes against their actual FK.
CREATE OR REPLACE FUNCTION baro_material_selection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE master record; variant record; base_id int; expected jsonb; enabled boolean;
BEGIN
 SELECT c."baseId",coalesce((b."materialSettings"->>'enabled')::boolean,false) INTO base_id,enabled FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" WHERE c.id=CASE WHEN TG_TABLE_NAME='PartnerTransactionCost' THEN (to_jsonb(NEW)->>'transactionCodeId')::int ELSE (to_jsonb(NEW)->>'accountingCodeId')::int END AND c."ownerOrgId"=NEW."orgId";
 IF TG_OP='UPDATE' AND NEW."materialItemId" IS NOT DISTINCT FROM OLD."materialItemId" AND NEW."orgId"=OLD."orgId" THEN
  IF NEW."materialItemSnapshot" IS DISTINCT FROM OLD."materialItemSnapshot" AND NOT (TG_TABLE_NAME='PartnerTransactionCost' AND NEW."materialItemSnapshot"->>'variantId' IS NOT NULL) THEN RAISE EXCEPTION 'material selection snapshot is immutable'; END IF;
 END IF;
 IF NEW."materialItemId" IS NULL THEN
  IF NEW."materialItemSnapshot" IS NOT NULL AND NEW."materialItemSnapshot"<>'null'::jsonb THEN RAISE EXCEPTION 'material snapshot without item'; END IF;
  IF TG_OP='UPDATE' AND enabled AND (OLD."materialItemId" IS NOT NULL OR to_jsonb(NEW)->>'transactionCodeId' IS DISTINCT FROM to_jsonb(OLD)->>'transactionCodeId' OR to_jsonb(NEW)->>'accountingCodeId' IS DISTINCT FROM to_jsonb(OLD)->>'accountingCodeId') AND (TG_TABLE_NAME='PartnerTransactionCost' AND to_jsonb(NEW)->>'outsourcedWorkRecordId' IS NULL OR TG_TABLE_NAME='BankLedgerEntry' AND to_jsonb(NEW)->>'evidenceType'='FILE' AND to_jsonb(NEW)->>'counterpartyAccountId' IS NULL) THEN RAISE EXCEPTION 'material item required'; END IF;
  IF TG_OP='INSERT' AND enabled AND (TG_TABLE_NAME='PartnerTransactionCost' AND to_jsonb(NEW)->>'outsourcedWorkRecordId' IS NULL OR TG_TABLE_NAME='BankLedgerEntry' AND to_jsonb(NEW)->>'evidenceType'='FILE' AND to_jsonb(NEW)->>'counterpartyAccountId' IS NULL AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" original WHERE original.id=to_jsonb(NEW)->>'revisesEntryId' AND original."orgId"=NEW."orgId" AND original."accountingCodeId"=(to_jsonb(NEW)->>'accountingCodeId')::int AND original."evidenceType"='FILE' AND original."materialItemId" IS NULL)) THEN RAISE EXCEPTION 'material item required'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO master FROM "MaterialItem" WHERE id=NEW."materialItemId" AND "orgId"=NEW."orgId" AND "baseId"=base_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid material selection scope'; END IF;
 expected:=jsonb_build_object('id',master.id,'baseId',master."baseId",'industryId',master."industryId",'unitId',master."unitId")||master.data;
 IF TG_OP='INSERT' AND TG_TABLE_NAME='PartnerTransactionCost' AND enabled AND to_jsonb(NEW)->>'outsourcedWorkRecordId' IS NULL AND NEW."materialItemSnapshot"->>'variantId' IS NULL THEN RAISE EXCEPTION 'material variant required'; END IF;
 IF TG_TABLE_NAME='PartnerTransactionCost' AND NEW."materialItemSnapshot"->>'variantId' IS NOT NULL THEN
  SELECT * INTO variant FROM "InventoryVariant" WHERE id=NEW."materialItemSnapshot"->>'variantId' AND "orgId"=NEW."orgId" AND "masterId"=master.id FOR SHARE;
  IF NOT FOUND OR variant.revision::text IS DISTINCT FROM NEW."materialItemSnapshot"->>'variantRevision' THEN RAISE EXCEPTION 'VARIANT_CHANGED'; END IF;
  expected:=expected||jsonb_build_object('variantId',variant.id,'variantRevision',variant.revision,'itemOwnerOrgId',variant."ownerId",'itemOwnerSnapshot',variant.attributes->'owner','itemTypeId',variant."typeId",'itemAttributeSnapshot',jsonb_build_object('type',variant.attributes->'type'),'color',variant.attributes->'color','details',coalesce(variant.attributes->'dimensions','{}'::jsonb));
  master."ownerOrgId":=variant."ownerId";master."typeId":=variant."typeId";master.data:=expected;
 END IF;
 IF NEW."materialItemSnapshot" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'invalid material selection snapshot'; END IF;
 IF TG_TABLE_NAME='PartnerTransactionCost' THEN
  IF NEW."itemOwnerOrgId" IS DISTINCT FROM master."ownerOrgId" OR NEW."itemCustomerId" IS DISTINCT FROM master."customerId" OR NEW."itemTypeId" IS DISTINCT FROM master."typeId" OR NEW."unitId" IS DISTINCT FROM master."unitId"
  OR coalesce(NEW."itemOwnerSnapshot",'null'::jsonb) IS DISTINCT FROM coalesce(master.data->'itemOwnerSnapshot','null'::jsonb) OR coalesce(NEW."itemAttributeSnapshot",'null'::jsonb) IS DISTINCT FROM coalesce(master.data->'itemAttributeSnapshot','null'::jsonb)
  OR coalesce(NEW.details->>'length','')<>coalesce(master.data->'details'->>'length','') OR coalesce(NEW.details->>'width','')<>coalesce(master.data->'details'->>'width','') OR coalesce(NEW.details->>'height','')<>coalesce(master.data->'details'->>'height','') THEN RAISE EXCEPTION 'material specification mismatch'; END IF;
 ELSE
  IF NEW."evidenceType"<>'FILE' OR NEW."counterpartyAccountId" IS NOT NULL THEN RAISE EXCEPTION 'material selection requires direct bank evidence'; END IF;
 END IF;
 RETURN NEW;
END $$;
