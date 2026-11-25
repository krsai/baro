-- Additive: retain original IDs and frozen bank instructions.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankAccountId2" text;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankAccountId3" text;
ALTER TABLE "InvoiceDraft" ADD COLUMN IF NOT EXISTS "bankAccountId2" text;
ALTER TABLE "InvoiceDraft" ADD COLUMN IF NOT EXISTS "bankAccountId3" text;
DO $$
DECLARE tab text; slot int; key text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['Invoice','InvoiceDraft'] LOOP
  FOR slot IN 2..3 LOOP
   key=tab || '_bank' || slot || '_scope_fkey';
   IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=key) THEN
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(%I,"sellerOrgId") REFERENCES "OrganizationBankAccount"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT',tab,key,'bankAccountId'||slot);
   END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION baro_invoice_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document jsonb; fields jsonb; accounts jsonb; account jsonb; ids text[];
BEGIN
 document=CASE WHEN TG_TABLE_NAME='Invoice' THEN to_jsonb(NEW)->'snapshot' ELSE to_jsonb(NEW)->'content' END;
 fields=document->'fields'; accounts=fields->'bankAccounts';
 IF NEW."bankAccountId" IS DISTINCT FROM fields->>'bankAccountId' THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
 IF accounts IS NOT NULL THEN
  IF jsonb_typeof(accounts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
  IF jsonb_array_length(accounts)>3 THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
  IF NEW."bankAccountId" IS DISTINCT FROM accounts->0->>'id' OR NEW."bankAccountId2" IS DISTINCT FROM accounts->1->>'id' OR NEW."bankAccountId3" IS DISTINCT FROM accounts->2->>'id' THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
  ids=ARRAY[]::text[];
  FOR account IN SELECT value FROM jsonb_array_elements(accounts) LOOP
   IF jsonb_typeof(account->'id') IS DISTINCT FROM 'string' OR length(account->>'id') NOT BETWEEN 1 AND 100 OR account->>'id'=ANY(ids) THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
   ids=array_append(ids,account->>'id');
  END LOOP;
 ELSE
  IF NEW."bankAccountId2" IS NOT NULL OR NEW."bankAccountId3" IS NOT NULL THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
  ids=ARRAY[NEW."bankAccountId"];
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) AS chosen(id) WHERE chosen.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" b WHERE b.id=chosen.id AND b."orgId"=NEW."sellerOrgId" AND b."entityId"=NEW."sellerOrgId" AND b."accountKind"='BANK')) THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
 RETURN NEW;
END $$;
-- Rollback: restore compatible application while retaining additive columns,
-- FKs, selected accounts and frozen snapshots. No historical document rewrite.
