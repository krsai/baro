-- Preserve approval snapshots; physically delete only unreferenced invoice documents.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "transactionCodeId" INTEGER;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Invoice_accounting_code_scope_fkey') THEN ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_accounting_code_scope_fkey" FOREIGN KEY("transactionCodeId","sellerOrgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$;
CREATE OR REPLACE FUNCTION baro_invoice_delete_authorized(invoice_id TEXT,company_id INTEGER) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r JOIN "Employee" e ON e.id=r."decidedByEmployeeId" AND e."orgId"=r."orgId"
 WHERE r.id=current_setting('baro.change_request_id',true) AND r.menu='INVOICE' AND r.operation='DELETE' AND r."sourceId"=invoice_id AND r."orgId"=company_id AND r.status='APPROVED'
 AND r."beforeSnapshot"->'invoice'->>'id'=invoice_id AND e.status::text='ACTIVE' AND e.id::text=current_setting('baro.change_approver',true));
$$;
CREATE OR REPLACE FUNCTION baro_invoice_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='ChangeApprovalRequest' THEN
  IF NEW.menu='INVOICE' AND (NEW.operation<>'DELETE' OR NEW."sourceKind"<>'invoice' OR NEW."invoiceId" IS NULL OR NEW."sourceId" IS DISTINCT FROM NEW."invoiceId" OR NOT EXISTS(SELECT 1 FROM "Invoice" WHERE id=NEW."invoiceId" AND "sellerOrgId"=NEW."orgId" AND status::text IN ('ISSUED','CANCELLED'))) OR NEW.menu<>'INVOICE' AND NEW."invoiceId" IS NOT NULL THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  IF NOT baro_invoice_delete_authorized(OLD.id,OLD."sellerOrgId") THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=OLD.id) OR EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" WHERE "invoiceId"=OLD.id)
   OR EXISTS(SELECT 1 FROM "InvoiceCredit" WHERE "invoiceId"=OLD.id) OR EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "invoiceId"=OLD.id)
   OR EXISTS(SELECT 1 FROM "InvoiceFinalLockEvent" WHERE "invoiceId"=OLD.id) OR EXISTS(SELECT 1 FROM "WorkOrder" WHERE "invoiceFinalLockInvoiceId"=OLD.id)
   OR EXISTS(SELECT 1 FROM "InvoiceDraft" WHERE "revisionOfInvoiceId"=OLD.id) OR EXISTS(SELECT 1 FROM "Invoice" WHERE "revisionOfInvoiceId"=OLD.id OR "rootInvoiceId"=OLD.id OR id=OLD.id AND ("revisionOfInvoiceId" IS NOT NULL OR "rootInvoiceId" IS NOT NULL))
  THEN RAISE EXCEPTION 'INVOICE_DELETE_LINKED_DATA'; END IF;
  RETURN OLD;
 END IF;
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
CREATE OR REPLACE FUNCTION baro_general_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF TG_TABLE_NAME='Invoice' AND baro_invoice_delete_authorized(OLD.id,OLD."sellerOrgId") THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='InvoiceGeneralLine' AND baro_invoice_delete_authorized(OLD."invoiceId",OLD."sellerOrgId") THEN RETURN OLD; END IF;
 END IF;
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
CREATE OR REPLACE FUNCTION baro_change_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.menu='INVOICE' AND OLD."invoiceId" IS NOT NULL AND NEW."invoiceId" IS NULL
  AND (to_jsonb(NEW)-'invoiceId')=(to_jsonb(OLD)-'invoiceId') AND baro_invoice_delete_authorized(OLD."invoiceId",OLD."orgId") THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW.result IS NOT NULL OR jsonb_typeof(NEW.policy->'resolvedStages') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.policy->'resolvedStages')=0 OR NEW.policy->>'menu' IS DISTINCT FROM NEW.menu OR NEW.policy->>'operation' IS DISTINCT FROM NEW.operation OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."requestedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.policy->'resolvedStages') s WHERE (s->>'employeeId'=NEW."requestedByEmployeeId"::text AND NOT (baro_final_drafter_allowed(NEW.policy,NEW."orgId",NEW."requestedByEmployeeId") OR NEW.menu='EXPENSE' AND NEW.operation='DELETE' AND NEW."expenseRequestId" IS NOT NULL AND COALESCE(NEW.policy->>'highestSelfDeletion','false')='true' AND EXISTS(SELECT 1 FROM "Employee" self_actor JOIN "EmployeeGrade" self_grade ON self_grade.id=self_actor."gradeId" AND self_grade."orgId"=self_actor."orgId" WHERE self_actor.id=NEW."requestedByEmployeeId" AND self_actor."orgId"=NEW."orgId" AND baro_highest_company_approver(self_actor.id,self_actor."orgId",self_grade."setId")))) OR NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id::text=s->>'employeeId' AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text=s->>'role' AND (s->>'gradeId' IS NULL OR e."gradeId"::text=s->>'gradeId'))) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.policy->'resolvedStages'))<>(SELECT count(DISTINCT s->>'employeeId') FROM jsonb_array_elements(NEW.policy->'resolvedStages') s) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF NEW.operation='CREATE' AND (NEW.menu<>'BANK_LEDGER' OR NEW."sourceKind"<>'batch' OR NEW."sourceId" IS DISTINCT FROM NEW.payload->>'clientKey' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'rows') p JOIN "OrganizationBankAccount" a ON a.id=replace(p->>'accountId','entity:','') OR a.id=(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=p->>'accountId' AND "orgId"=NEW."orgId") WHERE p->>'entryKind'='BANK' AND a."orgId"=NEW."orgId" AND a."entityId"=NEW."orgId" AND a."isActive")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."expenseRequestId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW."sourceKind"<>'request' OR NEW."sourceId"<>NEW."expenseRequestId"::text OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" WHERE id=NEW."expenseRequestId" AND "orgId"=NEW."orgId" AND version=NEW."sourceVersion" AND "deletedAt" IS NULL)) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."ledgerEntryId" IS NOT NULL AND (NEW.menu<>'BANK_LEDGER' OR NEW."sourceKind"<>'ledger' OR NEW."sourceId"<>NEW."ledgerEntryId" OR NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" WHERE id=NEW."ledgerEntryId" AND "orgId"=NEW."orgId" AND "voidedAt" IS NULL)) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."legacyCostId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW.operation<>'UPDATE' OR NEW."sourceKind"<>'cost' OR NEW."sourceId"<>NEW."legacyCostId" OR NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE id=NEW."legacyCostId" AND "orgId"=NEW."orgId")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."legacyRecordId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW.operation<>'UPDATE' OR NEW."sourceKind"<>'legacy' OR NEW."sourceId"<>NEW."legacyRecordId"::text OR NOT EXISTS(SELECT 1 FROM "OutsourcedWorkRecord" WHERE id=NEW."legacyRecordId" AND "orgId"=NEW."orgId")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt','appliedAt','result']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt','appliedAt','result']) THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
  IF OLD.status='APPROVED' AND NEW.status='APPROVED' AND OLD.result IS NULL AND NEW.result IS NOT NULL AND (to_jsonb(NEW)-'result')=(to_jsonb(OLD)-'result') THEN RETURN NEW; END IF;
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR (NEW."decidedByEmployeeId"=NEW."requestedByEmployeeId" AND NOT (baro_final_drafter_allowed(NEW.policy,NEW."orgId",NEW."requestedByEmployeeId") OR NEW.menu='EXPENSE' AND NEW.operation='DELETE' AND NEW."expenseRequestId" IS NOT NULL AND COALESCE(NEW.policy->>'highestSelfDeletion','false')='true' AND EXISTS(SELECT 1 FROM "Employee" self_actor JOIN "EmployeeGrade" self_grade ON self_grade.id=self_actor."gradeId" AND self_grade."orgId"=self_actor."orgId" WHERE self_actor.id=NEW."decidedByEmployeeId" AND self_actor."orgId"=NEW."orgId" AND baro_highest_company_approver(self_actor.id,self_actor."orgId",self_grade."setId")))) OR NOT EXISTS(SELECT 1 FROM "ChangeApprovalDecision" d WHERE d."requestId"=NEW.id AND COALESCE(d."actingEmployeeId",d."employeeId")=NEW."decidedByEmployeeId" AND d.decision=NEW.status AND d.position=(SELECT max(position) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id)) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
  IF NEW.status='APPROVED' AND (jsonb_array_length(NEW.policy->'resolvedStages')<>(SELECT count(*) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id AND decision='APPROVED')) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE "ChangeApprovalRequest" DROP CONSTRAINT IF EXISTS "ChangeApprovalRequest_state_check";
ALTER TABLE "ChangeApprovalRequest" ADD CONSTRAINT "ChangeApprovalRequest_state_check" CHECK(menu IN ('EXPENSE','BANK_LEDGER','INVOICE') AND operation IN ('CREATE','UPDATE','DELETE') AND (operation='CREATE' AND menu='BANK_LEDGER' AND "sourceKind"='batch' AND num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId","invoiceId")=0 OR operation<>'CREATE' AND (num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId","invoiceId")=1 OR (menu='INVOICE' AND "sourceKind"='invoice' AND "invoiceId" IS NULL AND "beforeSnapshot"->'invoice'->>'id'="sourceId"))) AND length(reason)<=1000 AND (operation<>'DELETE' OR length(trim(reason))>0) AND status IN ('PENDING','APPROVED','REJECTED') AND (status='PENDING' AND "decidedAt" IS NULL AND "appliedAt" IS NULL AND "decidedByEmployeeId" IS NULL OR status='APPROVED' AND "decidedAt" IS NOT NULL AND "appliedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL OR status='REJECTED' AND "decidedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL AND "appliedAt" IS NULL));
CREATE OR REPLACE FUNCTION baro_invoice_change_applied_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.menu='INVOICE' AND NEW.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=NEW.id AND r."invoiceId" IS NULL AND r."beforeSnapshot"->'invoice'->>'id'=r."sourceId" AND NOT EXISTS(SELECT 1 FROM "Invoice" i WHERE i.id=r."sourceId")) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
 RETURN NEW;
END $$;
