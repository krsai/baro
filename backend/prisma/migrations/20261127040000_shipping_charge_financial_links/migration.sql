-- Additive rollout. Rollback disables new handoffs; preserve links and source snapshots.
CREATE TABLE IF NOT EXISTS "ShippingChargeFinancialLink" (
 "chargeId" TEXT PRIMARY KEY,
 "orgId" INTEGER NOT NULL,
 "jobId" TEXT NOT NULL,
 "chargeVersion" INTEGER NOT NULL CHECK ("chargeVersion">0),
 "invoiceDraftId" TEXT UNIQUE REFERENCES "InvoiceDraft"(id) ON DELETE RESTRICT,
 "invoiceId" TEXT UNIQUE,
 "expenseRequestId" INTEGER UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ShippingChargeFinancialLink_charge_fkey" FOREIGN KEY ("chargeId","orgId","jobId") REFERENCES "ShippingChargeDraft"(id,"orgId","jobId") ON DELETE RESTRICT,
 CONSTRAINT "ShippingChargeFinancialLink_invoice_fkey" FOREIGN KEY ("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT,
 CONSTRAINT "ShippingChargeFinancialLink_expense_fkey" FOREIGN KEY ("expenseRequestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "ShippingChargeFinancialLink_kind_check" CHECK ("expenseRequestId" IS NULL OR ("invoiceDraftId" IS NULL AND "invoiceId" IS NULL))
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingChargeFinancialLink_charge_fkey') THEN ALTER TABLE "ShippingChargeFinancialLink" ADD CONSTRAINT "ShippingChargeFinancialLink_charge_fkey" FOREIGN KEY ("chargeId","orgId","jobId") REFERENCES "ShippingChargeDraft"(id,"orgId","jobId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingChargeFinancialLink_invoice_fkey') THEN ALTER TABLE "ShippingChargeFinancialLink" ADD CONSTRAINT "ShippingChargeFinancialLink_invoice_fkey" FOREIGN KEY ("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingChargeFinancialLink_expense_fkey') THEN ALTER TABLE "ShippingChargeFinancialLink" ADD CONSTRAINT "ShippingChargeFinancialLink_expense_fkey" FOREIGN KEY ("expenseRequestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingChargeFinancialLink_invoiceDraftId_fkey') THEN ALTER TABLE "ShippingChargeFinancialLink" ADD CONSTRAINT "ShippingChargeFinancialLink_invoiceDraftId_fkey" FOREIGN KEY ("invoiceDraftId") REFERENCES "InvoiceDraft"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingChargeFinancialLink_kind_check') THEN ALTER TABLE "ShippingChargeFinancialLink" ADD CONSTRAINT "ShippingChargeFinancialLink_kind_check" CHECK ("expenseRequestId" IS NULL OR ("invoiceDraftId" IS NULL AND "invoiceId" IS NULL)); END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_shipping_charge_financial_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE charge "ShippingChargeDraft";
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."invoiceDraftId" IS NOT NULL OR OLD."invoiceId" IS NOT NULL OR OLD."expenseRequestId" IS NOT NULL THEN RAISE EXCEPTION 'SHIPPING_CHARGE_LINK_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF TG_TABLE_NAME='ShippingChargeDraft' THEN
  IF EXISTS(SELECT 1 FROM "ShippingChargeFinancialLink" WHERE "chargeId"=OLD.id AND ("invoiceDraftId" IS NOT NULL OR "invoiceId" IS NOT NULL OR "expenseRequestId" IS NOT NULL)) THEN
   RAISE EXCEPTION 'SHIPPING_CHARGE_DOCUMENT_LINKED';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO charge FROM "ShippingChargeDraft" WHERE id=NEW."chargeId" AND "orgId"=NEW."orgId" AND "jobId"=NEW."jobId" FOR UPDATE;
 IF charge.id IS NULL OR charge."billId" IS NOT NULL OR charge.version<>NEW."chargeVersion" THEN RAISE EXCEPTION 'SHIPPING_CHARGE_CHANGED'; END IF;
 IF TG_OP='UPDATE' AND (NEW."chargeId",NEW."orgId",NEW."jobId") IS DISTINCT FROM (OLD."chargeId",OLD."orgId",OLD."jobId") THEN RAISE EXCEPTION 'SHIPPING_CHARGE_LINK_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND NEW."chargeVersion"<>OLD."chargeVersion" AND (OLD."invoiceDraftId" IS NOT NULL OR OLD."invoiceId" IS NOT NULL OR OLD."expenseRequestId" IS NOT NULL) THEN RAISE EXCEPTION 'SHIPPING_CHARGE_LINK_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND (OLD."invoiceId" IS NOT NULL AND NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR OLD."expenseRequestId" IS NOT NULL AND NEW."expenseRequestId" IS DISTINCT FROM OLD."expenseRequestId") THEN RAISE EXCEPTION 'SHIPPING_CHARGE_LINK_IMMUTABLE'; END IF;
 IF NEW."invoiceDraftId" IS NOT NULL AND (charge.direction<>'SALES' OR NOT EXISTS(SELECT 1 FROM "InvoiceDraft" WHERE id=NEW."invoiceDraftId" AND "sellerOrgId"=NEW."orgId")) THEN RAISE EXCEPTION 'SHIPPING_CHARGE_DOCUMENT_SCOPE'; END IF;
 IF NEW."invoiceId" IS NOT NULL AND charge.direction<>'SALES' OR NEW."expenseRequestId" IS NOT NULL AND charge.direction<>'PURCHASE' THEN RAISE EXCEPTION 'SHIPPING_CHARGE_DOCUMENT_SCOPE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingChargeFinancialLink_guard" ON "ShippingChargeFinancialLink";
CREATE TRIGGER "ShippingChargeFinancialLink_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingChargeFinancialLink" FOR EACH ROW EXECUTE FUNCTION baro_shipping_charge_financial_guard();
DROP TRIGGER IF EXISTS "ShippingChargeDraft_financial_guard" ON "ShippingChargeDraft";
CREATE TRIGGER "ShippingChargeDraft_financial_guard" BEFORE UPDATE ON "ShippingChargeDraft" FOR EACH ROW EXECUTE FUNCTION baro_shipping_charge_financial_guard();
