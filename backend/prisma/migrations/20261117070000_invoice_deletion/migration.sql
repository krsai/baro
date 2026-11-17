-- Deletion removes operational visibility while retaining issued history and real audit FKs.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'DELETED';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "deletedBy" TEXT, ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
CREATE OR REPLACE FUNCTION baro_general_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='InvoiceGeneralLine' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'GENERAL_INVOICE_IMMUTABLE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Invoice" i WHERE i.id=NEW."invoiceId" AND i."sellerOrgId"=NEW."sellerOrgId" AND i."documentKind"='GENERAL')
  THEN RAISE EXCEPTION 'GENERAL_INVOICE_SCOPE_INVALID'; END IF;
 ELSE
  IF TG_OP='DELETE' AND OLD."documentKind"='GENERAL' THEN RAISE EXCEPTION 'GENERAL_INVOICE_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND (NEW."documentKind" IS DISTINCT FROM OLD."documentKind" OR OLD."documentKind"='GENERAL' AND
   (to_jsonb(NEW)-ARRAY['status','cancelledBy','cancelledAt','cancellationReason','deletedAt','deletedBy','deletionReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','cancelledBy','cancelledAt','cancellationReason','deletedAt','deletedBy','deletionReason']))
  THEN RAISE EXCEPTION 'GENERAL_INVOICE_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_invoice_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='ChangeApprovalRequest' THEN
  IF NEW.menu='INVOICE' AND (NEW.operation<>'DELETE' OR NEW."sourceKind"<>'invoice' OR NEW."invoiceId" IS NULL OR NEW."sourceId" IS DISTINCT FROM NEW."invoiceId" OR NOT EXISTS(SELECT 1 FROM "Invoice" WHERE id=NEW."invoiceId" AND "sellerOrgId"=NEW."orgId" AND status::text IN ('ISSUED','CANCELLED'))) OR NEW.menu<>'INVOICE' AND NEW."invoiceId" IS NOT NULL THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INVOICE_HISTORY_REQUIRED'; END IF;
 IF OLD.status::text='DELETED' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'INVOICE_HISTORY_REQUIRED'; END IF;
 IF NEW.status::text='DELETED' AND OLD.status::text<>'DELETED' THEN
  IF OLD.status::text NOT IN ('ISSUED','CANCELLED') THEN RAISE EXCEPTION 'CHANGE_SOURCE_CHANGED'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','deletedAt','deletedBy','deletionReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','deletedAt','deletedBy','deletionReason']) THEN RAISE EXCEPTION 'INVOICE_HISTORY_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=current_setting('baro.change_request_id',true) AND r.menu='INVOICE' AND r.operation='DELETE' AND r."invoiceId"=OLD.id AND r."orgId"=OLD."sellerOrgId" AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND r.reason=NEW."deletionReason" AND NEW."deletedAt" IS NOT NULL AND length(trim(NEW."deletedBy"))>0) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "invoiceId"=OLD.id AND "voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_SOURCE_LOCKED'; END IF;
  IF EXISTS(SELECT 1 FROM "WorkOrder" WHERE "invoiceFinalLockInvoiceId"=OLD.id) THEN RAISE EXCEPTION 'INVOICE_FINAL_LOCK_UNLOCK_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM "InvoiceOrder" o JOIN "InvoiceOrder" later ON later."sourceOrderId"=o."sourceOrderId" JOIN "Invoice" i ON i.id=later."invoiceId" WHERE o."invoiceId"=OLD.id AND i."sellerOrgId"=OLD."sellerOrgId" AND i.status='ISSUED' AND i."sequenceNumber">OLD."sequenceNumber") THEN RAISE EXCEPTION 'INVOICE_CANCEL_REVERSE_ORDER_REQUIRED'; END IF;
 ELSIF NEW.status='CANCELLED' AND OLD.status='ISSUED' THEN
  RAISE EXCEPTION 'INVOICE_USE_DELETION';
 END IF;
 IF NEW.status::text='DELETED' AND OLD.status::text<>'DELETED' THEN
  IF EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=OLD.id AND "voidedAt" IS NULL) OR EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."invoiceId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'INVOICE_ACTIVE_PAYMENT'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_cancellation_approval_guard" ON "Invoice";
CREATE TRIGGER "Invoice_cancellation_approval_guard" BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION baro_invoice_change_guard();
DROP TRIGGER IF EXISTS "ChangeApprovalRequest_invoice_guard" ON "ChangeApprovalRequest";
CREATE TRIGGER "ChangeApprovalRequest_invoice_guard" BEFORE INSERT ON "ChangeApprovalRequest" FOR EACH ROW EXECUTE FUNCTION baro_invoice_change_guard();
CREATE OR REPLACE FUNCTION baro_invoice_change_applied_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.menu='INVOICE' AND NEW.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM "Invoice" WHERE id=NEW."invoiceId" AND "sellerOrgId"=NEW."orgId" AND status::text='DELETED' AND "deletionReason"=NEW.reason) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_change_applied_guard" ON "ChangeApprovalRequest";
CREATE CONSTRAINT TRIGGER "Invoice_change_applied_guard" AFTER UPDATE ON "ChangeApprovalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_invoice_change_applied_guard();

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Invoice_deletion_state_check') THEN ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deletion_state_check" CHECK ((status::text='DELETED' AND "deletedAt" IS NOT NULL AND "deletedBy" IS NOT NULL AND "deletionReason" IS NOT NULL AND length(trim("deletedBy"))>0 AND length(trim("deletionReason")) BETWEEN 1 AND 1000) OR (status::text<>'DELETED' AND "deletedAt" IS NULL AND "deletedBy" IS NULL AND "deletionReason" IS NULL)); END IF; END $$;
