-- Explicit, approved material-link corrections only. No historical backfill.
CREATE OR REPLACE FUNCTION baro_paid_material_selection_matches(cost_id text,company_id integer,p jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
  SELECT 1 FROM "PartnerTransactionCost" c
  JOIN "InventoryVariant" v ON v.id=c."materialVariantId" AND v."orgId"=c."orgId" AND v."masterId"=c."materialItemId"
  JOIN "MaterialItem" m ON m.id=v."masterId" AND m."orgId"=v."orgId" AND m."baseId"=v."baseId"
  JOIN "TransactionCode" code ON code.id=c."transactionCodeId" AND code."ownerOrgId"=c."orgId" AND code."baseId"=m."baseId"
  JOIN "TransactionCodeBase" b ON b.id=code."baseId"
  WHERE c.id=cost_id AND c."orgId"=company_id AND b."isActive" AND code."isActive" AND coalesce((b."materialSettings"->>'enabled')::boolean,false)
  AND p->>'materialItemId'=m.id AND p->>'materialVariantId'=v.id AND p->>'materialVariantRevision'=v.revision::text
  AND (p->>'unitId')::integer=m."unitId" AND c."unitId"=m."unitId"
  AND (p->>'itemOwnerOrgId')::integer IS NOT DISTINCT FROM c."itemOwnerOrgId"
  AND (p->>'itemTypeId')::integer IS NOT DISTINCT FROM c."itemTypeId"
  AND (p->>'itemCustomerId')::integer IS NOT DISTINCT FROM c."itemCustomerId"
  AND NOT EXISTS(SELECT 1 FROM "InventoryMovement" movement WHERE movement."orgId"=c."orgId" AND movement."expenseItemId"=c.id AND movement."variantId"<>v.id)
 );
$$;

CREATE OR REPLACE FUNCTION baro_paid_expense_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_entry "BankLedgerEntry"%ROWTYPE; new_entry "BankLedgerEntry"%ROWTYPE; r "ChangeApprovalRequest"%ROWTYPE; doc "ExpenseRequest"%ROWTYPE; old_rows JSONB; new_rows JSONB;
BEGIN
 SELECT * INTO old_entry FROM "BankLedgerEntry" WHERE id=NEW."originalEntryId" AND "orgId"=NEW."orgId";
 SELECT * INTO new_entry FROM "BankLedgerEntry" WHERE id=NEW."replacementEntryId" AND "orgId"=NEW."orgId";
 SELECT * INTO r FROM "ChangeApprovalRequest" WHERE id=NEW."changeRequestId" AND "orgId"=NEW."orgId";
 SELECT * INTO doc FROM "ExpenseRequest" WHERE id=r."expenseRequestId" AND "orgId"=r."orgId";
 IF (doc."partnerOrgId",doc."payeeEmployeeId",doc."requestDate",doc."scheduledPaymentDate",doc.remark) IS DISTINCT FROM
 ((r."beforeSnapshot"->'document'->>'partnerOrgId')::integer,(r."beforeSnapshot"->'document'->>'payeeEmployeeId')::integer,r."beforeSnapshot"->'document'->>'requestDate',r."beforeSnapshot"->'document'->>'scheduledPaymentDate',r."beforeSnapshot"->'document'->>'remark')
 OR (SELECT count(*) FROM "PartnerTransactionCost" WHERE "expenseRequestId"=doc.id AND "orgId"=doc."orgId")<>jsonb_array_length(r."beforeSnapshot"->'costs')
 THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 IF new_entry.id IS NULL OR old_entry."voidedAt" IS NULL OR new_entry."voidedAt" IS NOT NULL OR new_entry."revisesEntryId" IS DISTINCT FROM old_entry.id OR doc.version<>r."sourceVersion"+1
 OR (to_jsonb(old_entry)-ARRAY['id','clientKey','createdAt','createdBy','revisesEntryId','voidedAt','voidedBy','voidReason','accountingCodeId']) IS DISTINCT FROM
    (to_jsonb(new_entry)-ARRAY['id','clientKey','createdAt','createdBy','revisesEntryId','voidedAt','voidedBy','voidReason','accountingCodeId']) THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 SELECT jsonb_agg(to_jsonb(a)-ARRAY['id','entryId','requestVersion'] ORDER BY a."expenseItemId") INTO old_rows FROM "BankLedgerEvidenceAllocation" a WHERE a."entryId"=old_entry.id AND a."orgId"=NEW."orgId";
 SELECT jsonb_agg(to_jsonb(a)-ARRAY['id','entryId','requestVersion'] ORDER BY a."expenseItemId") INTO new_rows FROM "BankLedgerEvidenceAllocation" a WHERE a."entryId"=new_entry.id AND a."orgId"=NEW."orgId";
 IF old_rows IS DISTINCT FROM new_rows THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 IF new_entry."accountingCodeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "PartnerTransactionCost" c ON c.id=a."expenseItemId" AND c."orgId"=a."orgId" WHERE a."entryId"=new_entry.id AND a."orgId"=NEW."orgId" AND c."transactionCodeId"=new_entry."accountingCodeId") THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r."beforeSnapshot"->'costs') b
  LEFT JOIN "PartnerTransactionCost" c ON c.id=b->>'id' AND c."orgId"=r."orgId"
  WHERE c.id IS NULL OR (c.amount,c.quantity,c."unitPrice",c."vatRate",c.currency,c."partnerOrgId",c."payeeEmployeeId") IS DISTINCT FROM
  ((b->>'amount')::numeric,(b->>'quantity')::numeric,(b->>'unitPrice')::numeric,(b->>'vatRate')::numeric,b->>'currency',(b->>'partnerOrgId')::integer,(b->>'payeeEmployeeId')::integer)
  OR (b->>'unitId')::integer IS NOT NULL AND c."unitId" IS DISTINCT FROM (b->>'unitId')::integer
  OR (jsonb_build_array(c."materialItemId",c."materialItemSnapshot",c."itemOwnerOrgId",c."itemOwnerSnapshot",c."itemCustomerId",c."itemTypeId",c."itemAttributeSnapshot",c."unitId") IS DISTINCT FROM jsonb_build_array(b->'materialItemId',b->'materialItemSnapshot',b->'itemOwnerOrgId',b->'itemOwnerSnapshot',b->'itemCustomerId',b->'itemTypeId',b->'itemAttributeSnapshot',b->'unitId')) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'items') p WHERE p->>'itemId'=c.id AND baro_paid_material_selection_matches(c.id,r."orgId",p))
  OR (c."workOrderId",c."styleId",c."styleProcessId",c."outsourcedWorkRecordId",c."transactionDate") IS DISTINCT FROM
  ((b->>'workOrderId')::integer,(b->>'styleId')::integer,(b->>'styleProcessId')::integer,(b->>'outsourcedWorkRecordId')::integer,b->>'transactionDate')
  OR COALESCE(c.details,'{}'::jsonb)-(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'items') p WHERE p->>'itemId'=c.id AND baro_paid_material_selection_matches(c.id,r."orgId",p)) THEN ARRAY['reference','evidenceFile','length','width','height'] ELSE ARRAY['reference','evidenceFile'] END) IS DISTINCT FROM COALESCE(b->'details','{}'::jsonb)-(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'items') p WHERE p->>'itemId'=c.id AND baro_paid_material_selection_matches(c.id,r."orgId",p)) THEN ARRAY['reference','evidenceFile','length','width','height'] ELSE ARRAY['reference','evidenceFile'] END)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'items') p WHERE p->>'itemId'=c.id AND (p->>'transactionCodeId')::integer=c."transactionCodeId"
    AND btrim(COALESCE(p->'details'->>'reference',''))=COALESCE(c.details->>'reference','') AND btrim(COALESCE(p->'details'->>'evidenceFile',''))=COALESCE(c.details->>'evidenceFile','')))
 THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 RETURN NEW;
END $$;

ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "materialVariantId" text GENERATED ALWAYS AS ("materialItemSnapshot"->>'variantId') STORED;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Ledger_material_variant_scope_fkey') THEN
  ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_material_variant_scope_fkey" FOREIGN KEY("materialVariantId","orgId","materialItemId") REFERENCES "InventoryVariant"(id,"orgId","masterId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_variant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='InventoryVariant' THEN
  IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE "orgId"=OLD."orgId" AND "materialVariantId"=OLD.id) OR EXISTS(SELECT 1 FROM "BankLedgerEntry" WHERE "orgId"=OLD."orgId" AND "materialVariantId"=OLD.id) THEN
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
 IF NEW."materialItemSnapshot"->>'variantId' IS NOT NULL THEN
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
