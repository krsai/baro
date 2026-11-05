-- Extend immutable approval requests to new single-account ledger documents.
CREATE OR REPLACE FUNCTION baro_ledger_registration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."evidenceType"='ADJUSTMENT' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND (r.operation='UPDATE' AND NEW."revisesEntryId"=r."ledgerEntryId" OR r.operation='CREATE' AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK' AND p->>'clientKey'=NEW."clientKey" AND p->>'transactionDate'=NEW."transactionDate" AND p->>'direction'=NEW.direction AND (p->>'amount')::numeric=NEW.amount AND (p->>'accountId'=NEW."accountId" OR p->>'accountId'='entity:'||(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "orgId"=NEW."orgId"))))) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Ledger_registration_approval_guard" BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_registration_guard();
ALTER TABLE "ChangeApprovalRequest" DROP CONSTRAINT IF EXISTS "ChangeApprovalRequest_state_check";
ALTER TABLE "ChangeApprovalRequest" ADD CONSTRAINT "ChangeApprovalRequest_state_check" CHECK(menu IN ('EXPENSE','BANK_LEDGER') AND operation IN ('CREATE','UPDATE','DELETE') AND (operation='CREATE' AND menu='BANK_LEDGER' AND "sourceKind"='batch' AND num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId")=0 OR operation<>'CREATE' AND num_nonnulls("expenseRequestId","ledgerEntryId","legacyCostId","legacyRecordId")=1) AND length(reason)<=1000 AND (operation<>'DELETE' OR length(trim(reason))>0) AND status IN ('PENDING','APPROVED','REJECTED') AND (status='PENDING' AND "decidedAt" IS NULL AND "appliedAt" IS NULL AND "decidedByEmployeeId" IS NULL OR status='APPROVED' AND "decidedAt" IS NOT NULL AND "appliedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL OR status='REJECTED' AND "decidedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL AND "appliedAt" IS NULL));
CREATE OR REPLACE FUNCTION baro_change_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW.result IS NOT NULL OR jsonb_typeof(NEW.policy->'resolvedStages') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.policy->'resolvedStages')=0 OR NEW.policy->>'menu' IS DISTINCT FROM NEW.menu OR NEW.policy->>'operation' IS DISTINCT FROM NEW.operation OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."requestedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.policy->'resolvedStages') s WHERE (s->>'employeeId'=NEW."requestedByEmployeeId"::text AND NOT (NEW.menu='EXPENSE' AND NEW.operation='DELETE' AND NEW."expenseRequestId" IS NOT NULL AND COALESCE(NEW.policy->>'highestSelfDeletion','false')='true' AND EXISTS(SELECT 1 FROM "Employee" self_actor JOIN "EmployeeGrade" self_grade ON self_grade.id=self_actor."gradeId" AND self_grade."orgId"=self_actor."orgId" WHERE self_actor.id=NEW."requestedByEmployeeId" AND self_actor."orgId"=NEW."orgId" AND baro_highest_company_approver(self_actor.id,self_actor."orgId",self_grade."setId")))) OR NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id::text=s->>'employeeId' AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text=s->>'role' AND (s->>'gradeId' IS NULL OR e."gradeId"::text=s->>'gradeId'))) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.policy->'resolvedStages'))<>(SELECT count(DISTINCT s->>'employeeId') FROM jsonb_array_elements(NEW.policy->'resolvedStages') s) THEN RAISE EXCEPTION 'CHANGE_INVALID_REQUEST'; END IF;
  IF NEW.operation='CREATE' AND (NEW.menu<>'BANK_LEDGER' OR NEW."sourceKind"<>'batch' OR NEW."sourceId" IS DISTINCT FROM NEW.payload->>'clientKey' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'rows') p JOIN "OrganizationBankAccount" a ON a.id=replace(p->>'accountId','entity:','') OR a.id=(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=p->>'accountId' AND "orgId"=NEW."orgId") WHERE p->>'entryKind'='BANK' AND a."orgId"=NEW."orgId" AND a."entityId"=NEW."orgId" AND a."isActive")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."expenseRequestId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW."sourceKind"<>'request' OR NEW."sourceId"<>NEW."expenseRequestId"::text OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" WHERE id=NEW."expenseRequestId" AND "orgId"=NEW."orgId" AND version=NEW."sourceVersion" AND "deletedAt" IS NULL)) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."ledgerEntryId" IS NOT NULL AND (NEW.menu<>'BANK_LEDGER' OR NEW."sourceKind"<>'ledger' OR NEW."sourceId"<>NEW."ledgerEntryId" OR NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" WHERE id=NEW."ledgerEntryId" AND "orgId"=NEW."orgId" AND "voidedAt" IS NULL)) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."legacyCostId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW.operation<>'UPDATE' OR NEW."sourceKind"<>'cost' OR NEW."sourceId"<>NEW."legacyCostId" OR NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE id=NEW."legacyCostId" AND "orgId"=NEW."orgId")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
  IF NEW."legacyRecordId" IS NOT NULL AND (NEW.menu<>'EXPENSE' OR NEW.operation<>'UPDATE' OR NEW."sourceKind"<>'legacy' OR NEW."sourceId"<>NEW."legacyRecordId"::text OR NOT EXISTS(SELECT 1 FROM "OutsourcedWorkRecord" WHERE id=NEW."legacyRecordId" AND "orgId"=NEW."orgId")) THEN RAISE EXCEPTION 'CHANGE_INVALID_SOURCE'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt','appliedAt','result']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt','appliedAt','result']) THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
  IF OLD.status='APPROVED' AND NEW.status='APPROVED' AND OLD.result IS NULL AND NEW.result IS NOT NULL AND (to_jsonb(NEW)-'result')=(to_jsonb(OLD)-'result') THEN RETURN NEW; END IF;
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR (NEW."decidedByEmployeeId"=NEW."requestedByEmployeeId" AND NOT (NEW.menu='EXPENSE' AND NEW.operation='DELETE' AND NEW."expenseRequestId" IS NOT NULL AND COALESCE(NEW.policy->>'highestSelfDeletion','false')='true' AND EXISTS(SELECT 1 FROM "Employee" self_actor JOIN "EmployeeGrade" self_grade ON self_grade.id=self_actor."gradeId" AND self_grade."orgId"=self_actor."orgId" WHERE self_actor.id=NEW."decidedByEmployeeId" AND self_actor."orgId"=NEW."orgId" AND baro_highest_company_approver(self_actor.id,self_actor."orgId",self_grade."setId")))) OR NOT EXISTS(SELECT 1 FROM "ChangeApprovalDecision" d WHERE d."requestId"=NEW.id AND d."employeeId"=NEW."decidedByEmployeeId" AND d.decision=NEW.status AND d.position=(SELECT max(position) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id)) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
  IF NEW.status='APPROVED' AND (jsonb_array_length(NEW.policy->'resolvedStages')<>(SELECT count(*) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id AND decision='APPROVED')) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_change_applied_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ChangeApprovalRequest"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "ChangeApprovalRequest" WHERE id=NEW.id;
 IF r.status='APPROVED' THEN
  IF r.operation='CREATE' AND NOT EXISTS(SELECT 1 FROM "BankLedgerBatch" b WHERE b."orgId"=r."orgId" AND b."clientKey"=r."sourceId" AND jsonb_array_length(b."entryIds")=(SELECT count(*) FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK')) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
  IF r.result IS NULL THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
  IF r.menu='BANK_LEDGER' AND r.operation<>'CREATE' AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" e WHERE e.id=r."ledgerEntryId" AND e."orgId"=r."orgId" AND e."voidedAt" IS NOT NULL AND (r.operation='DELETE' OR EXISTS(SELECT 1 FROM "BankLedgerEntry" n WHERE n."revisesEntryId"=e.id AND n."orgId"=e."orgId"))) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
  IF r.menu='EXPENSE' AND r.operation='DELETE' AND NOT EXISTS(SELECT 1 FROM "ExpenseRequest" e WHERE e.id=r."expenseRequestId" AND e."orgId"=r."orgId" AND e."deletedAt" IS NOT NULL AND e."deletedChangeRequestId"=r.id) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
  IF r.menu='EXPENSE' AND r.operation='UPDATE' AND NOT EXISTS(SELECT 1 FROM "ExpenseRequestAudit" a WHERE a."orgId"=r."orgId" AND a."afterSnapshot"->'approvalPolicy'->>'changeRequestId'=r.id) THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_transaction_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $cost$
DECLARE mode TEXT; fields TEXT[]; field TEXT; options RECORD; taxable BOOLEAN; production RECORD; precision INTEGER; link_target TEXT; audit_base INTEGER; input_settings JSONB;
BEGIN
 IF TG_OP<>'INSERT' THEN
   IF NOT coalesce(baro_expense_editor_authorized(OLD."orgId"),false) THEN RAISE EXCEPTION 'transaction cost history cannot be changed'; END IF;
   PERFORM id FROM "WorkOrder" WHERE "orgId"=OLD."orgId" AND id IN (OLD."workOrderId",CASE WHEN TG_OP='UPDATE' THEN NEW."workOrderId" END) ORDER BY id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM "WorkOrder" WHERE "orgId"=OLD."orgId" AND "invoiceFinalLockedAt" IS NOT NULL AND id IN (OLD."workOrderId",CASE WHEN TG_OP='UPDATE' THEN NEW."workOrderId" END)) THEN RAISE EXCEPTION 'order finally locked'; END IF;
   IF TG_OP='DELETE' THEN RETURN OLD; END IF;
   IF ROW(NEW.id,NEW."orgId",NEW."clientKey",NEW."createdByEmployeeId",NEW."createdAt",NEW."outsourcedWorkRecordId") IS DISTINCT FROM ROW(OLD.id,OLD."orgId",OLD."clientKey",OLD."createdByEmployeeId",OLD."createdAt",OLD."outsourcedWorkRecordId") THEN RAISE EXCEPTION 'expense identity immutable'; END IF;
   IF (to_jsonb(NEW)-'expenseRequestId'-'expenseRequestLine')=(to_jsonb(OLD)-'expenseRequestId'-'expenseRequestLine') THEN RETURN NEW; END IF;
 END IF;
 IF NEW."payeeEmployeeId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."payeeEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE') OR NEW."outsourcedWorkRecordId" IS NOT NULL THEN RAISE EXCEPTION 'invalid employee expense payee'; END IF;
 ELSIF NOT EXISTS (SELECT 1 FROM "Organization" p WHERE p.id=NEW."partnerOrgId" AND p.id<>NEW."orgId" AND p."isActive" AND (p."ownerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id OR r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=p.id))) THEN RAISE EXCEPTION 'invalid transaction partner'; END IF;
 IF NEW."transactionCodeId" IS NULL THEN
   SELECT s."entryMode",s."requiredFields",s."orderInput",s."styleInput",s."processInput" INTO options
   FROM "OutsourcingServiceType" s WHERE s.id=NEW."serviceTypeId" AND s."ownerOrgId"=NEW."orgId" AND s."isActive";
 ELSE
   SELECT b."entryMode",b."requiredFields",b."orderInput",b."styleInput",b."processInput" INTO options
   FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" LEFT JOIN "ExpenseType" t ON t.id=b."expenseTypeId"
   WHERE c.id=NEW."transactionCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."serviceTypeId"=NEW."serviceTypeId" AND c."isActive" AND b."isActive" AND (t.id IS NULL OR (t."isActive" AND t.code<>'OTHER'));
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid expense code'; END IF;
 mode:=options."entryMode"; fields:=options."requiredFields";
 IF NEW."transactionCodeId" IS NOT NULL THEN
   IF TG_OP='UPDATE' THEN
     IF OLD."linkTarget" IS NOT NULL AND ROW(NEW."linkTarget",NEW."linkPolicyAuditId") IS DISTINCT FROM ROW(OLD."linkTarget",OLD."linkPolicyAuditId") THEN RAISE EXCEPTION 'expense link snapshot immutable'; END IF;
     link_target:=coalesce(OLD."linkTarget",CASE WHEN OLD."outsourcedWorkRecordId" IS NOT NULL THEN 'PROCESS' ELSE 'NONE' END);
     IF OLD."linkPolicyAuditId" IS NOT NULL THEN SELECT a."inputSettings" INTO input_settings FROM "ExpenseCodeLinkAudit" a WHERE a.id=OLD."linkPolicyAuditId" AND a."orgId"=NEW."orgId"; END IF;
   ELSE
     SELECT p.target,p."inputSettings" INTO link_target,input_settings FROM "ExpenseCodeLinkPolicy" p JOIN "TransactionCode" c ON c."baseId"=p."baseId" WHERE c.id=NEW."transactionCodeId" AND p."orgId"=NEW."orgId";
     IF NOT FOUND THEN
      input_settings:=to_jsonb(options);
      link_target:=CASE WHEN options."processInput"='REQUIRED' THEN 'PROCESS' WHEN options."styleInput"='REQUIRED' THEN 'STYLE' WHEN options."orderInput"='REQUIRED' THEN 'ORDER' ELSE 'NONE' END;
     END IF;
     IF NEW."linkPolicyAuditId" IS NOT NULL THEN SELECT a."inputSettings" INTO input_settings FROM "ExpenseCodeLinkAudit" a WHERE a.id=NEW."linkPolicyAuditId" AND a."orgId"=NEW."orgId"; END IF;
     -- Attaching an already-recorded legacy source is not creating production.
     IF NEW."outsourcedWorkRecordId" IS NOT NULL AND coalesce(baro_expense_editor_authorized(NEW."orgId"),false) THEN link_target:='PROCESS'; END IF;
   END IF;
   IF NEW."linkTarget" IS NOT NULL AND NEW."linkTarget"<>link_target THEN RAISE EXCEPTION 'expense link target mismatch'; END IF;
   NEW."linkTarget":=link_target;
   IF NEW."linkPolicyAuditId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ExpenseCodeLinkAudit" WHERE id=NEW."linkPolicyAuditId" AND "orgId"=NEW."orgId" AND target=link_target AND (TG_OP='UPDATE' OR "baseId"=(SELECT "baseId" FROM "TransactionCode" WHERE id=NEW."transactionCodeId"))) THEN RAISE EXCEPTION 'expense link audit mismatch'; END IF;
   mode:=CASE WHEN NEW."outsourcedWorkRecordId" IS NOT NULL OR (TG_OP='INSERT' AND mode='PROCESS' AND link_target='PROCESS') THEN 'PROCESS' ELSE 'GENERAL' END;
   options."orderInput":=CASE WHEN link_target IN ('ORDER','STYLE','PROCESS') THEN 'REQUIRED' ELSE 'OPTIONAL' END;
   options."styleInput":=CASE WHEN link_target IN ('STYLE','PROCESS') THEN 'REQUIRED' WHEN link_target='ORDER' THEN 'HIDDEN' ELSE 'OPTIONAL' END;
   options."processInput":=CASE WHEN link_target='PROCESS' THEN 'REQUIRED' WHEN TG_OP='UPDATE' AND OLD."styleProcessId" IS NOT NULL THEN 'OPTIONAL' ELSE 'HIDDEN' END;
   IF input_settings IS NOT NULL THEN
    options."orderInput":=input_settings->>'orderInput';options."styleInput":=input_settings->>'styleInput';options."processInput":=input_settings->>'processInput';
    fields:=ARRAY(SELECT jsonb_array_elements_text(input_settings->'requiredFields'));
   END IF;
 END IF;
 FOREACH field IN ARRAY fields LOOP IF coalesce(length(trim(NEW.details->>field)),0)=0 THEN RAISE EXCEPTION 'required transaction detail: %',field; END IF; END LOOP;
 IF NEW."transactionCodeId" IS NULL THEN
   IF mode NOT IN ('LOGISTICS','GENERAL') THEN RAISE EXCEPTION 'process request code required'; END IF;
   RETURN NEW;
 END IF;
 SELECT "vatEnabled" INTO taxable FROM "TransactionCode" WHERE id=NEW."transactionCodeId" AND "ownerOrgId"=NEW."orgId" AND "serviceTypeId"=NEW."serviceTypeId" AND "isActive";
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid transaction code'; END IF;
 IF NEW."unitPrice" IS NULL OR NEW.quantity IS NULL OR NEW.subtotal IS NULL OR NEW."vatRate" IS NULL OR NEW."vatAmount" IS NULL OR NEW."unitPrice"<=0 OR NEW.quantity<=0 OR NEW."vatRate" NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid accounting inputs'; END IF;
 IF NOT taxable AND NEW."vatRate"<>0 THEN RAISE EXCEPTION 'VAT is disabled'; END IF;
 precision:=CASE WHEN NEW.currency='USD' THEN 2 ELSE 0 END;
 IF NEW.subtotal<>round(NEW."unitPrice"*NEW.quantity,precision) OR NEW."vatAmount"<>round(NEW.subtotal*NEW."vatRate"/100,precision) OR NEW.amount<>NEW.subtotal+NEW."vatAmount" THEN RAISE EXCEPTION 'invalid accounting totals'; END IF;
 IF NEW."payeeEmployeeId" IS NOT NULL AND mode='PROCESS' THEN RAISE EXCEPTION 'employee production linkage forbidden'; END IF;
 IF mode='PROCESS' OR (NEW."outsourcedWorkRecordId" IS NOT NULL AND coalesce(baro_expense_editor_authorized(NEW."orgId"),false)) THEN
   IF NEW."workOrderId" IS NULL OR NEW."styleId" IS NULL OR NEW."styleProcessId" IS NULL OR NEW."outsourcedWorkRecordId" IS NULL OR NEW.quantity<>trunc(NEW.quantity) OR NEW.currency<>'VND' THEN RAISE EXCEPTION 'process references required'; END IF;
   SELECT r.*,a."workOrderId" INTO production FROM "OutsourcedWorkRecord" r JOIN "AssignmentPlan" a ON a.id=r."assignmentPlanId" WHERE r.id=NEW."outsourcedWorkRecordId";
   IF NOT FOUND OR production."orgId"<>NEW."orgId" OR production."outsourcingPartnerId"<>NEW."partnerOrgId" OR production."styleId"<>NEW."styleId" OR production."styleProcessId"<>NEW."styleProcessId" OR production."workOrderId" IS DISTINCT FROM NEW."workOrderId" OR production.quantity<>NEW.quantity OR production."outsourceUnitPrice"<>NEW."unitPrice" THEN RAISE EXCEPTION 'production does not match request'; END IF;
 ELSE
   IF NEW."outsourcedWorkRecordId" IS NOT NULL THEN RAISE EXCEPTION 'service cost cannot create production'; END IF;
   IF (options."orderInput"='REQUIRED' AND NEW."workOrderId" IS NULL) OR (options."styleInput"='REQUIRED' AND NEW."styleId" IS NULL) OR (options."processInput"='REQUIRED' AND NEW."styleProcessId" IS NULL) THEN RAISE EXCEPTION 'required input option'; END IF;
   IF (options."orderInput"='HIDDEN' AND NEW."workOrderId" IS NOT NULL) OR (options."styleInput"='HIDDEN' AND NEW."styleId" IS NOT NULL) OR (options."processInput"='HIDDEN' AND NEW."styleProcessId" IS NOT NULL) THEN RAISE EXCEPTION 'unexpected input option'; END IF;
 END IF;
 RETURN NEW;
END $cost$;
