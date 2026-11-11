ALTER TABLE "ChangeApprovalRequest" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ChangeApprovalRequest_invoice_fkey') THEN ALTER TABLE "ChangeApprovalRequest" ADD CONSTRAINT "ChangeApprovalRequest_invoice_fkey" FOREIGN KEY("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT; END IF; END $$;
ALTER TABLE "ChangeApprovalRequest" DROP CONSTRAINT IF EXISTS "ChangeApprovalRequest_state_check";
ALTER TABLE "ChangeApprovalRequest" ADD CONSTRAINT "ChangeApprovalRequest_state_check" CHECK(menu IN ('EXPENSE','BANK_LEDGER','INVOICE') AND operation IN ('CREATE','UPDATE','DELETE') AND (operation='CREATE' AND menu='BANK_LEDGER' AND "sourceKind"='batch' AND num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId","invoiceId")=0 OR operation<>'CREATE' AND num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId","invoiceId")=1) AND length(reason)<=1000 AND (operation<>'DELETE' OR length(trim(reason))>0) AND status IN ('PENDING','APPROVED','REJECTED') AND (status='PENDING' AND "decidedAt" IS NULL AND "appliedAt" IS NULL AND "decidedByEmployeeId" IS NULL OR status='APPROVED' AND "decidedAt" IS NOT NULL AND "appliedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL OR status='REJECTED' AND "decidedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL AND "appliedAt" IS NULL));
CREATE OR REPLACE FUNCTION baro_invoice_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='ChangeApprovalRequest' THEN
  IF NEW.menu='INVOICE' AND (NEW.operation<>'DELETE' OR NEW."sourceKind"<>'invoice' OR NEW."invoiceId" IS NULL OR NEW."sourceId" IS DISTINCT FROM NEW."invoiceId" OR NOT EXISTS(SELECT 1 FROM "Invoice" WHERE id=NEW."invoiceId" AND "sellerOrgId"=NEW."orgId" AND status='ISSUED')) OR NEW.menu<>'INVOICE' AND NEW."invoiceId" IS NOT NULL THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status='ISSUED' AND NEW.status='CANCELLED' THEN
  IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=current_setting('baro.change_request_id',true) AND r.menu='INVOICE' AND r.operation='DELETE' AND r."invoiceId"=OLD.id AND r."orgId"=OLD."sellerOrgId" AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND r.reason=NEW."cancellationReason") THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=OLD.id AND "voidedAt" IS NULL) OR EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."invoiceId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'INVOICE_ACTIVE_PAYMENT'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_cancellation_approval_guard" ON "Invoice";
CREATE TRIGGER "Invoice_cancellation_approval_guard" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION baro_invoice_change_guard();
DROP TRIGGER IF EXISTS "ChangeApprovalRequest_invoice_guard" ON "ChangeApprovalRequest";
CREATE TRIGGER "ChangeApprovalRequest_invoice_guard" BEFORE INSERT ON "ChangeApprovalRequest" FOR EACH ROW EXECUTE FUNCTION baro_invoice_change_guard();
CREATE OR REPLACE FUNCTION baro_invoice_change_applied_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.menu='INVOICE' AND NEW.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM "Invoice" WHERE id=NEW."invoiceId" AND "sellerOrgId"=NEW."orgId" AND status='CANCELLED' AND "cancellationReason"=NEW.reason) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_change_applied_guard" ON "ChangeApprovalRequest";
CREATE CONSTRAINT TRIGGER "Invoice_change_applied_guard" AFTER UPDATE ON "ChangeApprovalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_invoice_change_applied_guard();
