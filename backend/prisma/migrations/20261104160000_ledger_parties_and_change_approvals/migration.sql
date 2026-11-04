-- Add references for new transactions; do not backfill or rewrite financial history.
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "counterpartyOrgId" INTEGER,
 ADD COLUMN IF NOT EXISTS "counterpartyEmployeeId" INTEGER,ADD COLUMN IF NOT EXISTS "counterpartyAccountId" TEXT,
 ADD COLUMN IF NOT EXISTS "counterpartyName" TEXT;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Ledger_counterparty_partner_fkey') THEN ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_counterparty_partner_fkey" FOREIGN KEY("counterpartyOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Ledger_counterparty_employee_fkey') THEN ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_counterparty_employee_fkey" FOREIGN KEY("counterpartyEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Ledger_counterparty_account_fkey') THEN ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_counterparty_account_fkey" FOREIGN KEY("counterpartyAccountId","orgId") REFERENCES "OrganizationBankAccount"(id,"orgId") ON DELETE RESTRICT; END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_ledger_counterparty_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE targets INTEGER;
BEGIN
 targets:=num_nonnulls(NEW."counterpartyOrgId",NEW."counterpartyEmployeeId",NEW."counterpartyAccountId");
 IF NEW."evidenceType"='ADJUSTMENT' THEN
  IF targets<>0 OR NEW."counterpartyName" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
 ELSE
  IF targets<>1 OR length(trim(COALESCE(NEW."counterpartyName",'')))=0 THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_REQUIRED'; END IF;
  IF NEW."counterpartyOrgId" IS NOT NULL AND (NEW."counterpartyOrgId"=NEW."orgId" OR NOT EXISTS(
   SELECT 1 FROM "Organization" p WHERE p.id=NEW."counterpartyOrgId" AND (p."isActive" OR NEW."evidenceType" IN ('INVOICE','EXPENSE')) AND (p."ownerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id OR r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=p.id)))) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
  IF NEW."counterpartyEmployeeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."counterpartyEmployeeId" AND "orgId"=NEW."orgId" AND (status::text='ACTIVE' OR NEW."evidenceType"='EXPENSE')) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
  IF NEW."counterpartyAccountId" IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE id=NEW."counterpartyAccountId" AND "orgId"=NEW."orgId" AND "entityId"=NEW."orgId" AND "isActive") OR EXISTS(SELECT 1 FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "entityAccountId"=NEW."counterpartyAccountId")) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Ledger_counterparty_guard" ON "BankLedgerEntry";
CREATE TRIGGER "Ledger_counterparty_guard" BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_counterparty_guard();
CREATE OR REPLACE FUNCTION baro_ledger_counterparty_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "BankLedgerEntry"%ROWTYPE;
BEGIN
 SELECT * INTO e FROM "BankLedgerEntry" WHERE id=NEW."entryId" AND "orgId"=NEW."orgId";
 IF NEW."invoiceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Invoice" i WHERE i.id=NEW."invoiceId" AND i."sellerOrgId"=e."orgId" AND i."buyerOrgId"=e."counterpartyOrgId" AND e."counterpartyEmployeeId" IS NULL AND e."counterpartyAccountId" IS NULL) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_MISMATCH'; END IF;
 IF NEW."expenseItemId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" c WHERE c.id=NEW."expenseItemId" AND c."orgId"=e."orgId" AND c."partnerOrgId" IS NOT DISTINCT FROM e."counterpartyOrgId" AND c."payeeEmployeeId" IS NOT DISTINCT FROM e."counterpartyEmployeeId" AND e."counterpartyAccountId" IS NULL) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_MISMATCH'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Ledger_counterparty_evidence_guard" ON "BankLedgerEvidenceAllocation";
CREATE TRIGGER "Ledger_counterparty_evidence_guard" BEFORE INSERT ON "BankLedgerEvidenceAllocation" FOR EACH ROW EXECUTE FUNCTION baro_ledger_counterparty_evidence_guard();

CREATE TABLE IF NOT EXISTS "ChangeApprovalRequest"(
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 menu TEXT NOT NULL,operation TEXT NOT NULL,"sourceKind" TEXT NOT NULL,"sourceId" TEXT NOT NULL,
 "expenseRequestId" INTEGER,"ledgerEntryId" TEXT,"legacyCostId" TEXT,"legacyRecordId" INTEGER,"sourceVersion" INTEGER,
 revision TEXT NOT NULL,"requestedByEmployeeId" INTEGER NOT NULL,reason TEXT NOT NULL,
 "beforeSnapshot" JSONB NOT NULL,payload JSONB NOT NULL,policy JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
 "decidedByEmployeeId" INTEGER,"decisionReason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"decidedAt" TIMESTAMP(3),"appliedAt" TIMESTAMP(3),result JSONB,
 CONSTRAINT "ChangeApprovalRequest_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalRequest_requester_fkey" FOREIGN KEY("requestedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalRequest_decider_fkey" FOREIGN KEY("decidedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalRequest_expense_fkey" FOREIGN KEY("expenseRequestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalRequest_ledger_fkey" FOREIGN KEY("ledgerEntryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalRequest_cost_fkey" FOREIGN KEY("legacyCostId") REFERENCES "PartnerTransactionCost"(id) ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalRequest_record_fkey" FOREIGN KEY("legacyRecordId") REFERENCES "OutsourcedWorkRecord"(id) ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalRequest_state_check" CHECK(menu IN ('EXPENSE','BANK_LEDGER') AND operation IN ('UPDATE','DELETE') AND num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId")=1 AND length(reason)<=1000 AND (operation<>'DELETE' OR length(trim(reason))>0) AND status IN ('PENDING','APPROVED','REJECTED') AND (status='PENDING' AND "decidedAt" IS NULL AND "appliedAt" IS NULL AND "decidedByEmployeeId" IS NULL OR status='APPROVED' AND "decidedAt" IS NOT NULL AND "appliedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL OR status='REJECTED' AND "decidedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL AND "appliedAt" IS NULL)),
 UNIQUE(id,"orgId"),UNIQUE("orgId","clientKey")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChangeApprovalRequest_pending_key" ON "ChangeApprovalRequest"("orgId",menu,"sourceKind","sourceId") WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS "ChangeApprovalRequest_orgId_status_createdAt_idx" ON "ChangeApprovalRequest"("orgId",status,"createdAt");
CREATE TABLE IF NOT EXISTS "ChangeApprovalDecision"(
 id TEXT PRIMARY KEY,"requestId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"employeeId" INTEGER NOT NULL,position INTEGER NOT NULL,decision TEXT NOT NULL,reason TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
 CONSTRAINT "ChangeApprovalDecision_request_fkey" FOREIGN KEY("requestId","orgId") REFERENCES "ChangeApprovalRequest"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "ChangeApprovalDecision_employee_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CHECK(position>0 AND decision IN ('APPROVED','REJECTED') AND (decision<>'REJECTED' OR length(trim(reason)) BETWEEN 1 AND 1000)),UNIQUE("requestId",position)
);
CREATE INDEX IF NOT EXISTS "ChangeApprovalDecision_orgId_employeeId_createdAt_idx" ON "ChangeApprovalDecision"("orgId","employeeId","createdAt");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ChangeApprovalRequest_state_check') THEN ALTER TABLE "ChangeApprovalRequest" ADD CONSTRAINT "ChangeApprovalRequest_state_check" CHECK(menu IN ('EXPENSE','BANK_LEDGER') AND operation IN ('UPDATE','DELETE') AND num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId")=1 AND length(reason)<=1000 AND (operation<>'DELETE' OR length(trim(reason))>0) AND status IN ('PENDING','APPROVED','REJECTED') AND (status='PENDING' AND "decidedAt" IS NULL AND "appliedAt" IS NULL AND "decidedByEmployeeId" IS NULL OR status='APPROVED' AND "decidedAt" IS NOT NULL AND "appliedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL OR status='REJECTED' AND "decidedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL AND "appliedAt" IS NULL)); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ChangeApprovalDecision_state_check') THEN ALTER TABLE "ChangeApprovalDecision" ADD CONSTRAINT "ChangeApprovalDecision_state_check" CHECK(position>0 AND decision IN ('APPROVED','REJECTED') AND (decision<>'REJECTED' OR COALESCE(length(trim(reason)),0) BETWEEN 1 AND 1000)); END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_change_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ChangeApprovalRequest"%ROWTYPE; expected JSONB;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
 SELECT * INTO r FROM "ChangeApprovalRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 expected:=r.policy->'resolvedStages'->(NEW.position-1);
 IF r.status<>'PENDING' OR NEW."employeeId"=r."requestedByEmployeeId" OR expected->>'employeeId' IS DISTINCT FROM NEW."employeeId"::text OR NEW.position<>(SELECT count(*)+1 FROM "ChangeApprovalDecision" WHERE "requestId"=r.id) OR EXISTS(SELECT 1 FROM "ChangeApprovalDecision" WHERE "requestId"=r.id AND decision<>'APPROVED') OR NOT EXISTS(SELECT 1 FROM "Employee" e LEFT JOIN "EmployeeGrade" g ON g.id=e."gradeId" AND g."orgId"=e."orgId" LEFT JOIN "EmployeeGradeSet" gs ON gs.id=g."setId" WHERE e.id=NEW."employeeId" AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text=expected->>'role' AND (expected->>'gradeId' IS NULL OR e."gradeId"::text=expected->>'gradeId' AND g."isActive" AND gs."isActive")) THEN RAISE EXCEPTION 'CHANGE_APPROVER_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ChangeApprovalDecision_guard" ON "ChangeApprovalDecision";
CREATE TRIGGER "ChangeApprovalDecision_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ChangeApprovalDecision" FOR EACH ROW EXECUTE FUNCTION baro_change_decision_guard();
CREATE OR REPLACE FUNCTION baro_change_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW.result IS NOT NULL OR jsonb_typeof(NEW.policy->'resolvedStages') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.policy->'resolvedStages')=0 OR NEW.policy->>'menu' IS DISTINCT FROM NEW.menu OR NEW.policy->>'operation' IS DISTINCT FROM NEW.operation OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."requestedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.policy->'resolvedStages') s WHERE s->>'employeeId'=NEW."requestedByEmployeeId"::text OR NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id::text=s->>'employeeId' AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text=s->>'role' AND (s->>'gradeId' IS NULL OR e."gradeId"::text=s->>'gradeId'))) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.policy->'resolvedStages'))<>(SELECT count(DISTINCT s->>'employeeId') FROM jsonb_array_elements(NEW.policy->'resolvedStages') s) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF NEW."expenseRequestId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW."sourceKind"<>'request' OR NEW."sourceId"<>NEW."expenseRequestId"::text OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" WHERE id=NEW."expenseRequestId" AND "orgId"=NEW."orgId" AND version=NEW."sourceVersion" AND "deletedAt" IS NULL)) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."ledgerEntryId" IS NOT NULL AND (NEW.menu<>'BANK_LEDGER' OR NEW."sourceKind"<>'ledger' OR NEW."sourceId"<>NEW."ledgerEntryId" OR NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" WHERE id=NEW."ledgerEntryId" AND "orgId"=NEW."orgId" AND "voidedAt" IS NULL)) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."legacyCostId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW.operation<>'UPDATE' OR NEW."sourceKind"<>'cost' OR NEW."sourceId"<>NEW."legacyCostId" OR NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE id=NEW."legacyCostId" AND "orgId"=NEW."orgId")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."legacyRecordId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW.operation<>'UPDATE' OR NEW."sourceKind"<>'legacy' OR NEW."sourceId"<>NEW."legacyRecordId"::text OR NOT EXISTS(SELECT 1 FROM "OutsourcedWorkRecord" WHERE id=NEW."legacyRecordId" AND "orgId"=NEW."orgId")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt','appliedAt','result']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt','appliedAt','result']) THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
  IF OLD.status='APPROVED' AND NEW.status='APPROVED' AND OLD.result IS NULL AND NEW.result IS NOT NULL AND (to_jsonb(NEW)-'result')=(to_jsonb(OLD)-'result') THEN RETURN NEW; END IF;
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR NEW."decidedByEmployeeId"=NEW."requestedByEmployeeId" OR NOT EXISTS(SELECT 1 FROM "ChangeApprovalDecision" d WHERE d."requestId"=NEW.id AND d."employeeId"=NEW."decidedByEmployeeId" AND d.decision=NEW.status AND d.position=(SELECT max(position) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id)) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
  IF NEW.status='APPROVED' AND (jsonb_array_length(NEW.policy->'resolvedStages')<>(SELECT count(*) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id AND decision='APPROVED')) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ChangeApprovalRequest_guard" ON "ChangeApprovalRequest";
CREATE TRIGGER "ChangeApprovalRequest_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ChangeApprovalRequest" FOR EACH ROW EXECUTE FUNCTION baro_change_request_guard();
CREATE OR REPLACE FUNCTION baro_change_authorized(company_id INTEGER,subject TEXT,action TEXT,source_id TEXT) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=company_id AND r.menu=subject AND r.operation=action AND r."sourceId"=source_id AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND (r."expenseRequestId" IS NULL OR EXISTS(SELECT 1 FROM "ExpenseRequest" e WHERE e.id=r."expenseRequestId" AND e."orgId"=r."orgId" AND e.version=r."sourceVersion")))
$$;
CREATE OR REPLACE FUNCTION baro_ledger_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL AND NOT (baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',OLD.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',OLD.id)) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Ledger_change_approval_guard" ON "BankLedgerEntry";
CREATE TRIGGER "Ledger_change_approval_guard" BEFORE UPDATE ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_change_guard();
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "deletedChangeRequestId" TEXT;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequest_deleted_change_fkey') THEN ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_deleted_change_fkey" FOREIGN KEY("deletedChangeRequestId","orgId") REFERENCES "ChangeApprovalRequest"(id,"orgId") ON DELETE RESTRICT; END IF; END $$;
CREATE OR REPLACE FUNCTION baro_expense_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.version IS DISTINCT FROM OLD.version AND NEW."deletedAt" IS NULL AND NOT baro_change_authorized(OLD."orgId",'EXPENSE','UPDATE',OLD.id::text) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Expense_change_approval_guard" ON "ExpenseRequest";
CREATE TRIGGER "Expense_change_approval_guard" BEFORE UPDATE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_expense_change_guard();
CREATE OR REPLACE FUNCTION baro_expense_deleted_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_proof BOOLEAN; new_proof BOOLEAN;
BEGIN
 IF TG_OP='INSERT' THEN IF NEW."deletedAt" IS NOT NULL OR NEW."deletedByEmployeeId" IS NOT NULL OR NEW."deletionRequestId" IS NOT NULL OR NEW."deletedChangeRequestId" IS NOT NULL THEN RAISE EXCEPTION 'EXPENSE_DELETE_APPROVAL_REQUIRED'; END IF; RETURN NEW; END IF;
 IF OLD."deletedAt" IS NOT NULL THEN RAISE EXCEPTION 'EXPENSE_REQUEST_DELETED'; END IF;
 IF ROW(NEW."deletedAt",NEW."deletedByEmployeeId",NEW."deletionRequestId",NEW."deletedChangeRequestId") IS DISTINCT FROM ROW(OLD."deletedAt",OLD."deletedByEmployeeId",OLD."deletionRequestId",OLD."deletedChangeRequestId") THEN
  old_proof:=EXISTS(SELECT 1 FROM "ExpenseDeletionRequest" d WHERE d.id=NEW."deletionRequestId" AND d."requestId"=NEW.id AND d."orgId"=NEW."orgId" AND d.version=OLD.version AND d.status='APPROVED' AND d."decidedByEmployeeId"=NEW."deletedByEmployeeId" AND d."decidedByEmployeeId"::text=current_setting('baro.expense_editor_actor',true));
  new_proof:=NEW."deletedChangeRequestId"=current_setting('baro.change_request_id',true) AND baro_change_authorized(OLD."orgId",'EXPENSE','DELETE',OLD.id::text) AND NEW."deletedByEmployeeId"::text=current_setting('baro.change_approver',true) AND EXISTS(SELECT 1 FROM "ChangeApprovalRequest" WHERE id=NEW."deletedChangeRequestId" AND "sourceVersion"=OLD.version);
  IF NEW."deletedAt" IS NULL OR (to_jsonb(NEW)-ARRAY['deletedAt','deletedByEmployeeId','deletionRequestId','deletedChangeRequestId','version','updatedAt','updatedByEmployeeId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['deletedAt','deletedByEmployeeId','deletionRequestId','deletedChangeRequestId','version','updatedAt','updatedByEmployeeId']) OR NOT (COALESCE(old_proof,false) OR COALESCE(new_proof,false)) OR NOT baro_expense_deletion_payment_clear(OLD.id,OLD."orgId") THEN RAISE EXCEPTION 'EXPENSE_DELETE_APPROVAL_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_change_applied_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ChangeApprovalRequest"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "ChangeApprovalRequest" WHERE id=NEW.id;
 IF r.status='APPROVED' THEN
  IF r.result IS NULL THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
  IF r.menu='BANK_LEDGER' AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" e WHERE e.id=r."ledgerEntryId" AND e."orgId"=r."orgId" AND e."voidedAt" IS NOT NULL AND (r.operation='DELETE' OR EXISTS(SELECT 1 FROM "BankLedgerEntry" n WHERE n."revisesEntryId"=e.id AND n."orgId"=e."orgId"))) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
  IF r.menu='EXPENSE' AND r.operation='DELETE' AND NOT EXISTS(SELECT 1 FROM "ExpenseRequest" e WHERE e.id=r."expenseRequestId" AND e."orgId"=r."orgId" AND e."deletedAt" IS NOT NULL AND e."deletedChangeRequestId"=r.id) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
  IF r.menu='EXPENSE' AND r.operation='UPDATE' AND NOT EXISTS(SELECT 1 FROM "ExpenseRequestAudit" a WHERE a."orgId"=r."orgId" AND a."afterSnapshot"->'approvalPolicy'->>'changeRequestId'=r.id) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ChangeApprovalRequest_applied_guard" ON "ChangeApprovalRequest";
CREATE CONSTRAINT TRIGGER "ChangeApprovalRequest_applied_guard" AFTER UPDATE ON "ChangeApprovalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_change_applied_guard();
