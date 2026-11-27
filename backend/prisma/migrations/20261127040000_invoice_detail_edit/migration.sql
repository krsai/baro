-- Explicit detail edits preserve the document ID and immutable before/after history.
CREATE TABLE IF NOT EXISTS "InvoiceEditEvent" (
 id TEXT PRIMARY KEY, "orgId" INTEGER NOT NULL, "invoiceId" TEXT, "sourceId" TEXT NOT NULL,
 "actorId" INTEGER NOT NULL, "clientKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "beforeSnapshot" JSONB NOT NULL, "afterSnapshot" JSONB, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT "InvoiceEditEvent_invoice_scope_fkey" FOREIGN KEY ("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT,
 CONSTRAINT "InvoiceEditEvent_actor_scope_fkey" FOREIGN KEY ("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "InvoiceEditEvent_retry_key" UNIQUE ("orgId","clientKey")
);
CREATE OR REPLACE FUNCTION baro_invoice_edit_allowed(invoice_id TEXT,company_id INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
 RETURN EXISTS(SELECT 1 FROM "InvoiceEditEvent" a JOIN "Employee" e ON e.id=a."actorId" AND e."orgId"=a."orgId"
 JOIN "Invoice" i ON i.id=a."invoiceId" AND i."sellerOrgId"=a."orgId"
 WHERE a.id=current_setting('baro.invoice_edit_event',true) AND a."invoiceId"=invoice_id AND a."orgId"=company_id
 AND a."afterSnapshot" IS NULL AND e.status::text='ACTIVE' AND e."orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR') AND i.status='ISSUED'
 AND NOT EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=invoice_id)
 AND NOT EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" WHERE "invoiceId"=invoice_id)
 AND NOT EXISTS(SELECT 1 FROM "InvoiceCredit" WHERE "invoiceId"=invoice_id)
 AND NOT EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "invoiceId"=invoice_id)
 AND NOT EXISTS(SELECT 1 FROM "InvoiceFinalLockEvent" WHERE "invoiceId"=invoice_id)
 AND NOT EXISTS(SELECT 1 FROM "WorkOrder" WHERE "invoiceFinalLockInvoiceId"=invoice_id));
END $$;
CREATE OR REPLACE FUNCTION baro_invoice_edit_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INVOICE_EDIT_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."afterSnapshot" IS NOT NULL OR NEW."sourceId" IS DISTINCT FROM NEW."invoiceId" OR NOT EXISTS(
   SELECT 1 FROM "Invoice" i JOIN "Employee" e ON e."orgId"=i."sellerOrgId" WHERE i.id=NEW."invoiceId" AND i."sellerOrgId"=NEW."orgId"
   AND e.id=NEW."actorId" AND e.status::text='ACTIVE' AND e."orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')
   AND i.snapshot=NEW."beforeSnapshot"->'snapshot' AND i.status='ISSUED') THEN RAISE EXCEPTION 'INVOICE_EDIT_INVALID'; END IF;
 ELSE
  IF NEW."invoiceId" IS NULL AND OLD."invoiceId" IS NOT NULL AND (to_jsonb(NEW)-'invoiceId')=(to_jsonb(OLD)-'invoiceId') AND baro_invoice_delete_authorized(OLD."invoiceId",OLD."orgId") THEN RETURN NEW; END IF;
  IF OLD."afterSnapshot" IS NOT NULL OR NEW."afterSnapshot" IS NULL OR (to_jsonb(NEW)-'afterSnapshot') IS DISTINCT FROM (to_jsonb(OLD)-'afterSnapshot')
   OR NOT baro_invoice_edit_allowed(OLD."invoiceId",OLD."orgId") OR NOT EXISTS(SELECT 1 FROM "Invoice" i WHERE i.id=OLD."invoiceId" AND i.snapshot=NEW."afterSnapshot"->'snapshot') THEN RAISE EXCEPTION 'INVOICE_EDIT_HISTORY_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_invoice_detail_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_id TEXT; company_id INTEGER;
BEGIN
 IF TG_TABLE_NAME='Invoice' THEN
  IF NEW.snapshot IS NOT DISTINCT FROM OLD.snapshot THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-ARRAY['snapshot','pricingBasis','currencyCode','subtotal','total','receivableAdded','transactionCodeId','bankAccountId','bankAccountId2','bankAccountId3','bankAccountRevision','bankAccountSnapshot']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['snapshot','pricingBasis','currencyCode','subtotal','total','receivableAdded','transactionCodeId','bankAccountId','bankAccountId2','bankAccountId3','bankAccountRevision','bankAccountSnapshot']) THEN RAISE EXCEPTION 'INVOICE_EDIT_SCOPE_CHANGED'; END IF;
  invoice_id:=OLD.id;company_id:=OLD."sellerOrgId";
 ELSE
  invoice_id:=OLD."invoiceId";
  SELECT "sellerOrgId" INTO company_id FROM "Invoice" WHERE id=invoice_id;
  IF TG_OP='DELETE' AND baro_invoice_delete_authorized(invoice_id,company_id) THEN RETURN OLD; END IF;
 END IF;
 IF NOT baro_invoice_edit_allowed(invoice_id,company_id) THEN RAISE EXCEPTION 'INVOICE_EDIT_LOCKED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS "Invoice_detail_write_guard" ON "Invoice";
CREATE TRIGGER "Invoice_detail_write_guard" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION baro_invoice_detail_write_guard();
DROP TRIGGER IF EXISTS "InvoiceLine_detail_write_guard" ON "InvoiceLine";
CREATE TRIGGER "InvoiceLine_detail_write_guard" BEFORE UPDATE OR DELETE ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION baro_invoice_detail_write_guard();
DROP TRIGGER IF EXISTS "InvoiceOrder_detail_write_guard" ON "InvoiceOrder";
CREATE TRIGGER "InvoiceOrder_detail_write_guard" BEFORE UPDATE OR DELETE ON "InvoiceOrder" FOR EACH ROW EXECUTE FUNCTION baro_invoice_detail_write_guard();
DROP TRIGGER IF EXISTS "InvoiceEditEvent_immutable" ON "InvoiceEditEvent";
CREATE TRIGGER "InvoiceEditEvent_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceEditEvent" FOR EACH ROW EXECUTE FUNCTION baro_invoice_edit_event_guard();
CREATE OR REPLACE FUNCTION baro_invoice_edit_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "InvoiceEditEvent" WHERE id=NEW.id AND "afterSnapshot" IS NULL) THEN RAISE EXCEPTION 'INVOICE_EDIT_INCOMPLETE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InvoiceEditEvent_complete" ON "InvoiceEditEvent";
CREATE CONSTRAINT TRIGGER "InvoiceEditEvent_complete" AFTER INSERT ON "InvoiceEditEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_invoice_edit_complete_guard();
-- Extend the previous immutable general-invoice policy only for an audited, unlinked detail edit.
DO $$ DECLARE definition TEXT; BEGIN
 SELECT pg_get_functiondef('baro_general_invoice_guard()'::regprocedure) INTO definition;
 IF position('baro_invoice_edit_allowed' in definition)=0 THEN
  definition:=replace(definition,'BEGIN', $inject$BEGIN
 IF TG_TABLE_NAME='Invoice' AND TG_OP='UPDATE' AND baro_invoice_edit_allowed(OLD.id,OLD."sellerOrgId") THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='InvoiceGeneralLine' AND TG_OP<>'INSERT' AND baro_invoice_edit_allowed(to_jsonb(OLD)->>'invoiceId',(to_jsonb(OLD)->>'sellerOrgId')::integer) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
$inject$);
  EXECUTE definition;
 END IF;
END $$;
