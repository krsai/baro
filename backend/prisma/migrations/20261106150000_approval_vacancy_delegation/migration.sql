-- Original slots and decisions are retained; only an eligible actual signer may delegate.
ALTER TABLE "ExpenseApprovalDecision" ADD COLUMN IF NOT EXISTS "actingEmployeeId" INTEGER, ADD COLUMN IF NOT EXISTS delegation JSONB;
ALTER TABLE "ChangeApprovalDecision" ADD COLUMN IF NOT EXISTS "actingEmployeeId" INTEGER, ADD COLUMN IF NOT EXISTS delegation JSONB;
ALTER TABLE "ExpenseApprovalDecision" ADD CONSTRAINT "ExpenseDecision_acting_employee_fkey" FOREIGN KEY ("actingEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT;
ALTER TABLE "ChangeApprovalDecision" ADD CONSTRAINT "ChangeDecision_acting_employee_fkey" FOREIGN KEY ("actingEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION baro_approval_delegate_allowed(company INTEGER,drafter INTEGER,original INTEGER,acting INTEGER) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT acting<>drafter AND EXISTS(
 SELECT 1 FROM "Employee" old JOIN "EmployeeGrade" threshold ON threshold.id=old."gradeId" AND threshold."orgId"=company
 JOIN "Employee" candidate ON candidate.id=acting AND candidate."orgId"=company AND candidate.status='ACTIVE' AND candidate."orgRole"=old."orgRole"
 JOIN "EmployeeGrade" grade ON grade.id=candidate."gradeId" AND grade."orgId"=company AND grade."setId"=threshold."setId" AND grade."isActive"
 JOIN "EmployeeGradeSet" gs ON gs.id=grade."setId" AND gs."orgId"=company AND gs."isActive"
 WHERE old.id=original AND old."orgId"=company AND old.status<>'ACTIVE'
 AND (grade."sortOrder">=threshold."sortOrder" OR (
 NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "EmployeeGrade" g ON g.id=e."gradeId" AND g."orgId"=company WHERE e."orgId"=company AND e.status='ACTIVE' AND e."orgRole"=old."orgRole" AND g."isActive" AND g."setId"=threshold."setId" AND g."sortOrder">=threshold."sortOrder")
 AND grade."sortOrder"=(SELECT max(g."sortOrder") FROM "Employee" e JOIN "EmployeeGrade" g ON g.id=e."gradeId" AND g."orgId"=company WHERE e."orgId"=company AND e.status='ACTIVE' AND e."orgRole"=old."orgRole" AND g."isActive" AND g."setId"=threshold."setId"))))
$$;
CREATE OR REPLACE FUNCTION baro_expense_approval_role_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."actingEmployeeId" IS NOT NULL THEN
 NEW.delegation:=jsonb_build_object('reason','APPROVER_VACANCY','originalEmployeeId',NEW."employeeId",'actingEmployeeId',NEW."actingEmployeeId");
 IF NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=r.id AND s."orgId"=r."orgId" WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId" AND r.version=NEW.version AND s.position=NEW.position AND s."employeeId"=NEW."employeeId" AND baro_approval_delegate_allowed(r."orgId",r."createdByEmployeeId",s."employeeId",NEW."actingEmployeeId")) THEN RAISE EXCEPTION 'INVALID_EXPENSE_APPROVERS'; END IF;
 RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id=NEW."employeeId" AND e."orgId"=NEW."orgId" AND e.status='ACTIVE'
 AND (e."orgRole" IN ('ADMIN','ACCOUNTANT') OR (e."orgRole"='OPERATOR' AND baro_expense_operator_authorized(NEW."orgId",NEW."requestId",NEW.version,NEW."employeeId")))) THEN RAISE EXCEPTION 'INVALID_EXPENSE_APPROVERS'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM "ExpenseRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=r.id AND s."orgId"=r."orgId"
 JOIN "Employee" e ON e.id=s."employeeId" AND e."orgId"=s."orgId"
 WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId" AND r.version=NEW.version AND r."createdByEmployeeId"<>NEW."employeeId"
 AND s.position=NEW.position AND s."employeeId"=NEW."employeeId" AND ((NEW."actingEmployeeId" IS NULL AND e.status='ACTIVE') OR (NEW."actingEmployeeId" IS NOT NULL AND baro_approval_delegate_allowed(r."orgId",r."createdByEmployeeId",s."employeeId",NEW."actingEmployeeId")))
 AND (NEW."actingEmployeeId" IS NOT NULL OR e."orgRole" IN ('ADMIN','ACCOUNTANT') OR (e."orgRole"='OPERATOR' AND baro_expense_operator_authorized(NEW."orgId",NEW."requestId",NEW.version,NEW."employeeId"))))
 OR EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."orgId"=NEW."orgId" AND d."requestId"=NEW."requestId" AND d.version=NEW.version AND d.decision='REJECTED')
 OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=NEW."requestId" AND s.position<NEW.position AND NOT EXISTS
 (SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=s."requestId" AND d.version=NEW.version AND d.position=s.position AND d."employeeId"=s."employeeId" AND d.decision='APPROVED')) THEN RAISE EXCEPTION 'EXPENSE_APPROVAL_NOT_YOUR_TURN'; END IF;
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "BankLedgerEvidenceAllocation" a ON a."expenseItemId"=c.id JOIN "BankLedgerEntry" e ON e.id=a."entryId"
 WHERE c."expenseRequestId"=NEW."requestId" AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_change_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ChangeApprovalRequest"%ROWTYPE; expected JSONB;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CHANGE_HISTORY_IMMUTABLE'; END IF;
 SELECT * INTO r FROM "ChangeApprovalRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NEW."actingEmployeeId" IS NOT NULL THEN NEW.delegation:=jsonb_build_object('reason','APPROVER_VACANCY','originalEmployeeId',NEW."employeeId",'actingEmployeeId',NEW."actingEmployeeId"); END IF;
 expected:=r.policy->'resolvedStages'->(NEW.position-1);
 IF r.status<>'PENDING' OR (COALESCE(NEW."actingEmployeeId",NEW."employeeId")=r."requestedByEmployeeId" AND NOT (r.menu='EXPENSE' AND r.operation='DELETE' AND r."expenseRequestId" IS NOT NULL AND COALESCE(r.policy->>'highestSelfDeletion','false')='true' AND EXISTS(SELECT 1 FROM "Employee" self_actor JOIN "EmployeeGrade" self_grade ON self_grade.id=self_actor."gradeId" AND self_grade."orgId"=self_actor."orgId" WHERE self_actor.id=NEW."employeeId" AND self_actor."orgId"=r."orgId" AND baro_highest_company_approver(self_actor.id,self_actor."orgId",self_grade."setId")))) OR expected->>'employeeId' IS DISTINCT FROM NEW."employeeId"::text OR NEW.position<>(SELECT count(*)+1 FROM "ChangeApprovalDecision" WHERE "requestId"=r.id) OR EXISTS(SELECT 1 FROM "ChangeApprovalDecision" WHERE "requestId"=r.id AND decision<>'APPROVED') OR NOT ((NEW."actingEmployeeId" IS NOT NULL AND NOT (r.menu='EXPENSE' AND r.operation='DELETE') AND baro_approval_delegate_allowed(r."orgId",r."requestedByEmployeeId",NEW."employeeId",NEW."actingEmployeeId")) OR (NEW."actingEmployeeId" IS NULL AND EXISTS(SELECT 1 FROM "Employee" e LEFT JOIN "EmployeeGrade" g ON g.id=e."gradeId" AND g."orgId"=e."orgId" LEFT JOIN "EmployeeGradeSet" gs ON gs.id=g."setId" WHERE e.id=NEW."employeeId" AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text=expected->>'role' AND (expected->>'gradeId' IS NULL OR e."gradeId"::text=expected->>'gradeId' AND g."isActive" AND gs."isActive")) )) THEN RAISE EXCEPTION 'CHANGE_APPROVER_REQUIRED'; END IF;
 RETURN NEW;
END $$;
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
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR (NEW."decidedByEmployeeId"=NEW."requestedByEmployeeId" AND NOT (NEW.menu='EXPENSE' AND NEW.operation='DELETE' AND NEW."expenseRequestId" IS NOT NULL AND COALESCE(NEW.policy->>'highestSelfDeletion','false')='true' AND EXISTS(SELECT 1 FROM "Employee" self_actor JOIN "EmployeeGrade" self_grade ON self_grade.id=self_actor."gradeId" AND self_grade."orgId"=self_actor."orgId" WHERE self_actor.id=NEW."decidedByEmployeeId" AND self_actor."orgId"=NEW."orgId" AND baro_highest_company_approver(self_actor.id,self_actor."orgId",self_grade."setId")))) OR NOT EXISTS(SELECT 1 FROM "ChangeApprovalDecision" d WHERE d."requestId"=NEW.id AND COALESCE(d."actingEmployeeId",d."employeeId")=NEW."decidedByEmployeeId" AND d.decision=NEW.status AND d.position=(SELECT max(position) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id)) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
  IF NEW.status='APPROVED' AND (jsonb_array_length(NEW.policy->'resolvedStages')<>(SELECT count(*) FROM "ChangeApprovalDecision" WHERE "requestId"=NEW.id AND decision='APPROVED')) THEN RAISE EXCEPTION 'CHANGE_INVALID_DECISION'; END IF;
 END IF;
 RETURN NEW;
END $$;
