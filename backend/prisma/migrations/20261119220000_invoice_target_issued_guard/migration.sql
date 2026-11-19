-- A partial issued invoice is sufficient to prevent excluding its real source order.
CREATE OR REPLACE FUNCTION baro_invoice_target_exclusion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM "WorkOrder" WHERE id=NEW."workOrderId" AND "sellerOrgId"=NEW."orgId" FOR UPDATE;
 IF NEW.excluded AND EXISTS(SELECT 1 FROM "InvoiceOrder" io JOIN "Invoice" i ON i.id=io."invoiceId"
  WHERE io."workOrderId"=NEW."workOrderId" AND i."sellerOrgId"=NEW."orgId" AND i.status='ISSUED')
 THEN RAISE EXCEPTION 'INVOICE_TARGET_ALREADY_ISSUED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "OrderInvoicePolicy_issued_guard" ON "OrderInvoicePolicy";
CREATE TRIGGER "OrderInvoicePolicy_issued_guard" BEFORE INSERT OR UPDATE ON "OrderInvoicePolicy"
 FOR EACH ROW EXECUTE FUNCTION baro_invoice_target_exclusion_guard();
