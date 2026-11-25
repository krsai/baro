ALTER TABLE "InvoiceGeneralLine" ADD COLUMN IF NOT EXISTS "currencyCode" text;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InvoiceGeneralLine_currency_check') THEN ALTER TABLE "InvoiceGeneralLine" ADD CONSTRAINT "InvoiceGeneralLine_currency_check" CHECK("currencyCode" IS NULL OR "currencyCode" IN ('USD','VND','KRW')); END IF; END $$;
CREATE OR REPLACE FUNCTION baro_invoice_currency_amount(invoice_id text, currency_code text) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN i."documentKind"='GENERAL' THEN (SELECT sum(l.amount) FROM "InvoiceGeneralLine" l WHERE l."invoiceId"=i.id AND coalesce(l."currencyCode",i."currencyCode")=currency_code) WHEN i."currencyCode"=currency_code THEN i."receivableAdded" END FROM "Invoice" i WHERE i.id=invoice_id
$$;
CREATE OR REPLACE FUNCTION baro_general_invoice_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bill "Invoice"%ROWTYPE; target_id TEXT; digits INTEGER; currencies TEXT[]; expected RECORD;
BEGIN
 IF TG_TABLE_NAME='Invoice' THEN target_id=NEW.id; ELSE target_id=NEW."invoiceId"; END IF;
 SELECT * INTO bill FROM "Invoice" WHERE id=target_id;
 IF bill."documentKind"<>'GENERAL' THEN RETURN NEW; END IF;
 SELECT array_agg(DISTINCT coalesce("currencyCode",bill."currencyCode")) INTO currencies FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id;
 digits=CASE WHEN bill."currencyCode"='USD' THEN 2 ELSE 0 END;
 IF coalesce(array_length(currencies,1),0)>1 THEN
  IF bill."currencyCode"<>'MIX' OR bill.total<>0 OR bill.subtotal<>0 OR bill."receivableAdded"<>0 OR (bill.snapshot->>'total')::numeric<>0 OR (bill.snapshot->>'subtotal')::numeric<>0 OR (bill.snapshot->>'vatAmount')::numeric<>0 THEN RAISE EXCEPTION 'GENERAL_INVOICE_TOTALS_INVALID'; END IF;
 END IF;
 IF bill.snapshot ? 'currencyTotals' THEN
  IF jsonb_array_length(bill.snapshot->'currencyTotals')<>array_length(currencies,1) THEN RAISE EXCEPTION 'GENERAL_INVOICE_TOTALS_INVALID'; END IF;
  FOR expected IN SELECT coalesce(l."currencyCode",bill."currencyCode") AS code,sum(l.subtotal) AS subtotal,sum(l."vatAmount") AS tax,sum(l.amount) AS total FROM "InvoiceGeneralLine" l WHERE l."invoiceId"=bill.id GROUP BY 1 LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bill.snapshot->'currencyTotals') t WHERE t->>'currencyCode'=expected.code AND (t->>'subtotal')::numeric=expected.subtotal AND (t->>'vatAmount')::numeric=expected.tax AND (t->>'total')::numeric=expected.total AND (t->>'receivableAdded')::numeric=expected.total) THEN RAISE EXCEPTION 'GENERAL_INVOICE_TOTALS_INVALID'; END IF;
  END LOOP;
 ELSIF bill."currencyCode"='MIX' THEN RAISE EXCEPTION 'GENERAL_INVOICE_TOTALS_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(currencies) c WHERE c NOT IN ('USD','VND','KRW')) OR (array_length(currencies,1)=1 AND bill."currencyCode"<>currencies[1]) OR bill.snapshot->>'documentKind' IS DISTINCT FROM 'GENERAL' OR bill.snapshot->>'templateVersion' IS DISTINCT FROM 'BARO_INVOICE_V1'
  OR jsonb_array_length(COALESCE(bill.snapshot->'orders','[]'::jsonb))<>0 OR EXISTS(SELECT 1 FROM "InvoiceOrder" WHERE "invoiceId"=bill.id)
  OR EXISTS(SELECT 1 FROM "InvoiceLine" WHERE "invoiceId"=bill.id)
  OR NOT EXISTS(SELECT 1 FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id)
  OR bill.total<>(CASE WHEN bill."currencyCode"='MIX' THEN 0 ELSE (SELECT sum(amount) FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id) END)
  OR bill.subtotal<>(CASE WHEN bill."currencyCode"='MIX' THEN 0 ELSE (SELECT sum(subtotal) FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id) END)
  OR bill."receivableAdded"<>bill.total OR (bill.snapshot->>'total')::numeric IS DISTINCT FROM bill.total
  OR (bill.snapshot->>'subtotal')::numeric IS DISTINCT FROM bill.subtotal
  OR (bill.snapshot->>'vatAmount')::numeric IS DISTINCT FROM (CASE WHEN bill."currencyCode"='MIX' THEN 0 ELSE (SELECT sum("vatAmount") FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id) END)
  OR jsonb_array_length(COALESCE(bill.snapshot->'lines','[]'::jsonb))<>(SELECT count(*) FROM "InvoiceGeneralLine" WHERE "invoiceId"=bill.id)
  OR EXISTS(SELECT 1 FROM "InvoiceGeneralLine" l WHERE l."invoiceId"=bill.id AND (
    l.subtotal<>round(l.quantity*l."unitPrice",CASE WHEN coalesce(l."currencyCode",bill."currencyCode")='USD' THEN 2 ELSE 0 END) OR l."vatAmount"<>round(l.subtotal*l."vatRate"/100,CASE WHEN coalesce(l."currencyCode",bill."currencyCode")='USD' THEN 2 ELSE 0 END)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bill.snapshot->'lines') s WHERE s->>'lineKey'=l."lineKey" AND coalesce(s->>'currencyCode',bill."currencyCode")=coalesce(l."currencyCode",bill."currencyCode") AND (s->>'transactionCodeId')::int=l."transactionCodeId" AND s->>'description'=l.description AND s->>'unit'=l.unit AND s->>'code'=l.code AND s->>'codeDescription'=l."codeDescription" AND s->>'remark'=l.remark AND (s->>'quantity')::numeric=l.quantity AND (s->>'unitPrice')::numeric=l."unitPrice" AND (s->>'vatRate')::numeric=l."vatRate" AND (s->>'subtotal')::numeric=l.subtotal AND (s->>'vatAmount')::numeric=l."vatAmount" AND (s->>'amount')::numeric=l.amount)))
 THEN RAISE EXCEPTION 'GENERAL_INVOICE_TOTALS_INVALID'; END IF;
 RETURN NEW;
END $$;
-- Preserve the current expense approval branch and all existing trigger bindings.
DO $patch$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('baro_ledger_allocation_guard()'::regprocedure) INTO definition;
 IF position('baro_invoice_currency_amount' in definition)=0 THEN
  definition=replace(definition,'bill."currencyCode"<>(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId")','baro_invoice_currency_amount(bill.id,(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId")) IS NULL');
  definition=replace(definition,'>bill.total','>baro_invoice_currency_amount(bill.id,(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId"))');
  definition=replace(definition,'a."invoiceId"=NEW."invoiceId" AND e."voidedAt" IS NULL','a."invoiceId"=NEW."invoiceId" AND e."voidedAt" IS NULL AND (SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=e."accountId")=(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId")');
  IF position('baro_invoice_currency_amount' in definition)=0 OR position('>bill.total' in definition)>0 THEN RAISE EXCEPTION 'INVOICE_CURRENCY_MIGRATION_SOURCE_CHANGED'; END IF;
  definition=replace(definition,'a."invoiceId"=NEW."invoiceId" AND e."voidedAt" IS NULL','a."invoiceId" IN (SELECT id FROM "Invoice" WHERE id=coalesce(bill."rootInvoiceId",bill.id) OR "rootInvoiceId"=coalesce(bill."rootInvoiceId",bill.id)) AND e."voidedAt" IS NULL');
  definition=replace(definition,'>baro_invoice_currency_amount(bill.id,(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId"))','>baro_invoice_currency_amount(bill.id,(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId"))-(CASE WHEN bill."currencyCode"=''MIX'' THEN coalesce((SELECT sum(CASE WHEN p.kind=''REFUND'' THEN -p.amount ELSE p.amount END) FROM "InvoicePayment" p WHERE p."invoiceId" IN (SELECT id FROM "Invoice" WHERE id=coalesce(bill."rootInvoiceId",bill.id) OR "rootInvoiceId"=coalesce(bill."rootInvoiceId",bill.id)) AND p."voidedAt" IS NULL AND p."currencyCode"=(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId")),0) ELSE 0 END)');
  EXECUTE definition;
 END IF;
END $patch$;
CREATE OR REPLACE FUNCTION baro_invoice_payment_currency_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."voidedAt" IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.amount<=0 OR ((SELECT "currencyCode" FROM "Invoice" WHERE id=NEW."invoiceId")='MIX' AND NEW.amount<>round(NEW.amount,CASE WHEN NEW."currencyCode"='USD' THEN 2 ELSE 0 END)) OR baro_invoice_currency_amount(NEW."invoiceId",NEW."currencyCode") IS NULL THEN RAISE EXCEPTION 'INVOICE_CURRENCY_INVALID'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InvoicePayment_currency_guard" ON "InvoicePayment";
CREATE TRIGGER "InvoicePayment_currency_guard" BEFORE INSERT OR UPDATE ON "InvoicePayment" FOR EACH ROW EXECUTE FUNCTION baro_invoice_payment_currency_guard();
