-- General billing has real company/code FKs and no fabricated production source.
ALTER TABLE "Invoice" ADD COLUMN "documentKind" TEXT NOT NULL DEFAULT 'ORDER';
ALTER TABLE "Invoice" ALTER COLUMN "pricingBasis" DROP NOT NULL;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_document_kind_check" CHECK (
 ("documentKind"='ORDER' AND "pricingBasis" IS NOT NULL) OR ("documentKind"='GENERAL' AND "pricingBasis" IS NULL));
-- Reuse Invoice_id_sellerOrgId_key installed by the ledger evidence migration.
CREATE TABLE "InvoiceGeneralLine" (
 id TEXT PRIMARY KEY,"invoiceId" TEXT NOT NULL,"sellerOrgId" INTEGER NOT NULL,"lineKey" TEXT NOT NULL,"transactionCodeId" INTEGER NOT NULL,
 code TEXT NOT NULL,"codeDescription" TEXT NOT NULL,description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 1000),unit TEXT NOT NULL DEFAULT '',
 quantity DECIMAL(24,4) NOT NULL CHECK(quantity>0),"unitPrice" DECIMAL(24,4) NOT NULL CHECK("unitPrice">0),"vatRate" DECIMAL(5,2) NOT NULL CHECK("vatRate" BETWEEN 0 AND 100),
 subtotal DECIMAL(24,4) NOT NULL CHECK(subtotal>0),"vatAmount" DECIMAL(24,4) NOT NULL CHECK("vatAmount">=0),amount DECIMAL(24,4) NOT NULL CHECK(amount=subtotal+"vatAmount"),remark TEXT NOT NULL DEFAULT '',
 CONSTRAINT "InvoiceGeneralLine_invoiceId_lineKey_key" UNIQUE("invoiceId","lineKey"),
 CONSTRAINT "InvoiceGeneralLine_invoice_scope_fkey" FOREIGN KEY("invoiceId","sellerOrgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "InvoiceGeneralLine_code_scope_fkey" FOREIGN KEY("transactionCodeId","sellerOrgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "InvoiceGeneralLine_sellerOrgId_invoiceId_idx" ON "InvoiceGeneralLine"("sellerOrgId","invoiceId");
CREATE FUNCTION baro_general_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='InvoiceGeneralLine' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'GENERAL_INVOICE_IMMUTABLE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Invoice" i WHERE i.id=NEW."invoiceId" AND i."sellerOrgId"=NEW."sellerOrgId" AND i."documentKind"='GENERAL')
  THEN RAISE EXCEPTION 'GENERAL_INVOICE_SCOPE_INVALID'; END IF;
 ELSE
  IF TG_OP='DELETE' AND OLD."documentKind"='GENERAL' THEN RAISE EXCEPTION 'GENERAL_INVOICE_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND (NEW."documentKind" IS DISTINCT FROM OLD."documentKind" OR OLD."documentKind"='GENERAL' AND
   (to_jsonb(NEW)-ARRAY['status','cancelledBy','cancelledAt','cancellationReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','cancelledBy','cancelledAt','cancellationReason']))
  THEN RAISE EXCEPTION 'GENERAL_INVOICE_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "InvoiceGeneralLine_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceGeneralLine" FOR EACH ROW EXECUTE FUNCTION baro_general_invoice_guard();
CREATE TRIGGER "Invoice_general_immutable" BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION baro_general_invoice_guard();

CREATE FUNCTION baro_invoice_order_kind_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "Invoice" WHERE id=NEW."invoiceId" AND "documentKind"='GENERAL') THEN RAISE EXCEPTION 'GENERAL_INVOICE_SCOPE_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "InvoiceOrder_document_kind" BEFORE INSERT OR UPDATE ON "InvoiceOrder" FOR EACH ROW EXECUTE FUNCTION baro_invoice_order_kind_guard();
CREATE TRIGGER "InvoiceLine_document_kind" BEFORE INSERT OR UPDATE ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION baro_invoice_order_kind_guard();

CREATE FUNCTION baro_general_invoice_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bill "Invoice"%ROWTYPE; target_id TEXT; digits INTEGER;
BEGIN
 IF TG_TABLE_NAME='Invoice' THEN target_id=NEW.id; ELSE target_id=NEW."invoiceId"; END IF;
 SELECT * INTO bill FROM "Invoice" WHERE id=target_id;
 IF bill."documentKind"<>'GENERAL' THEN RETURN NEW; END IF;
 digits=CASE WHEN bill."currencyCode"='USD' THEN 2 ELSE 0 END;
 IF bill."currencyCode" NOT IN ('USD','VND','KRW') OR bill.snapshot->>'documentKind' IS DISTINCT FROM 'GENERAL' OR bill.snapshot->>'templateVersion' IS DISTINCT FROM 'BARO_INVOICE_V1'
  OR jsonb_array_length(COALESCE(bill.snapshot->'orders','[]'::jsonb))<>0 OR EXISTS(SELECT 1 FROM "InvoiceOrder" WHERE "invoiceId"=bill.id)
  OR EXISTS(SELECT 1 FROM "InvoiceLine" WHERE "invoiceId"=bill.id)
  OR NOT EXISTS(SELECT 1 FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id)
  OR bill.total<>(SELECT sum(amount) FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id)
  OR bill.subtotal<>(SELECT sum(subtotal) FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id)
  OR bill."receivableAdded"<>bill.total OR (bill.snapshot->>'total')::numeric IS DISTINCT FROM bill.total
  OR (bill.snapshot->>'subtotal')::numeric IS DISTINCT FROM bill.subtotal
  OR (bill.snapshot->>'vatAmount')::numeric IS DISTINCT FROM (SELECT sum("vatAmount") FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id)
  OR jsonb_array_length(COALESCE(bill.snapshot->'lines','[]'::jsonb))<>(SELECT count(*) FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id)
  OR EXISTS(SELECT 1 FROM "InvoiceGeneralLine" l WHERE l."invoiceId"=bill.id AND (
    l.subtotal<>round(l.quantity*l."unitPrice",digits) OR l."vatAmount"<>round(l.subtotal*l."vatRate"/100,digits)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bill.snapshot->'lines') s WHERE s->>'lineKey'=l."lineKey" AND (s->>'transactionCodeId')::int=l."transactionCodeId" AND s->>'description'=l.description AND s->>'unit'=l.unit AND s->>'code'=l.code AND s->>'codeDescription'=l."codeDescription" AND s->>'remark'=l.remark AND (s->>'quantity')::numeric=l.quantity AND (s->>'unitPrice')::numeric=l."unitPrice" AND (s->>'vatRate')::numeric=l."vatRate" AND (s->>'subtotal')::numeric=l.subtotal AND (s->>'vatAmount')::numeric=l."vatAmount" AND (s->>'amount')::numeric=l.amount)))
 THEN RAISE EXCEPTION 'GENERAL_INVOICE_TOTALS_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "Invoice_general_totals" AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_general_invoice_totals();
CREATE CONSTRAINT TRIGGER "InvoiceGeneralLine_totals" AFTER INSERT ON "InvoiceGeneralLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_general_invoice_totals();
