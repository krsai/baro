-- Additive: keep historical bank text and financial snapshots unchanged.
ALTER TABLE "OrganizationBankAccount" ADD COLUMN IF NOT EXISTS "swiftCode" text NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankAccountId" text;
ALTER TABLE "InvoiceDraft" ADD COLUMN IF NOT EXISTS "bankAccountId" text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='OrganizationBankAccount_swift_check') THEN
  ALTER TABLE "OrganizationBankAccount" ADD CONSTRAINT "OrganizationBankAccount_swift_check" CHECK ("swiftCode"='' OR ("accountKind"='BANK' AND "swiftCode" ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Invoice_bank_scope_fkey') THEN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bank_scope_fkey" FOREIGN KEY("bankAccountId","sellerOrgId") REFERENCES "OrganizationBankAccount"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InvoiceDraft_bank_scope_fkey') THEN
  ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_bank_scope_fkey" FOREIGN KEY("bankAccountId","sellerOrgId") REFERENCES "OrganizationBankAccount"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_invoice_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document jsonb;
BEGIN
 document=CASE WHEN TG_TABLE_NAME='Invoice' THEN to_jsonb(NEW)->'snapshot' ELSE to_jsonb(NEW)->'content' END;
 IF NEW."bankAccountId" IS DISTINCT FROM document->'fields'->>'bankAccountId' THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
 IF NEW."bankAccountId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE id=NEW."bankAccountId" AND "orgId"=NEW."sellerOrgId" AND "entityId"=NEW."sellerOrgId" AND "accountKind"='BANK') THEN RAISE EXCEPTION 'INVOICE_BANK_ACCOUNT_INVALID'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_bank_guard" ON "Invoice";
CREATE TRIGGER "Invoice_bank_guard" BEFORE INSERT OR UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION baro_invoice_bank_guard();
DROP TRIGGER IF EXISTS "InvoiceDraft_bank_guard" ON "InvoiceDraft";
CREATE TRIGGER "InvoiceDraft_bank_guard" BEFORE INSERT OR UPDATE ON "InvoiceDraft" FOR EACH ROW EXECUTE FUNCTION baro_invoice_bank_guard();
-- Rollback: stop new selections and restore the compatible application. Keep
-- additive columns, company FKs, existing selected accounts and frozen snapshots.
