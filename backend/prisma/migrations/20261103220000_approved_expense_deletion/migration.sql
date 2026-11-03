-- Approval completion does not block deletion. Only live payment links do.
-- Keep voided ledger entries, allocations, original expense and decision history.
CREATE OR REPLACE FUNCTION baro_expense_deletion_payment_clear(request_id INTEGER,org_id INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
 RETURN NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "BankLedgerEvidenceAllocation" a ON a."expenseItemId"=c.id JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE c."expenseRequestId"=request_id AND c."orgId"=org_id AND e."voidedAt" IS NULL);
END $$;
-- Serialize new expense allocations against deletion and refuse linking a
-- deleted expense, including documents that originally used self authority.
CREATE OR REPLACE FUNCTION baro_deleted_expense_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."expenseItemId" IS NOT NULL THEN
  PERFORM r.id FROM "ExpenseRequest" r JOIN "PartnerTransactionCost" c ON c."expenseRequestId"=r.id AND c."orgId"=r."orgId" WHERE c.id=NEW."expenseItemId" FOR UPDATE OF r;
  IF EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "PartnerTransactionCost" c ON c."expenseRequestId"=r.id AND c."orgId"=r."orgId" WHERE c.id=NEW."expenseItemId" AND r."deletedAt" IS NOT NULL) THEN RAISE EXCEPTION 'EXPENSE_REQUEST_DELETED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankLedgerExpenseDeleted_guard" ON "BankLedgerEvidenceAllocation";
CREATE TRIGGER "BankLedgerExpenseDeleted_guard" BEFORE INSERT ON "BankLedgerEvidenceAllocation" FOR EACH ROW EXECUTE FUNCTION baro_deleted_expense_payment_guard();
CREATE OR REPLACE FUNCTION baro_expense_deletion_allowed(request_id INTEGER,org_id INTEGER,request_version INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
 RETURN EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=request_id AND r."orgId"=org_id AND r.version=request_version AND r."deletedAt" IS NULL) AND baro_expense_deletion_payment_clear(request_id,org_id);
END $$;
-- A self-authorized request has no approval step; its original drafter is the
-- final authority. The higher-grade administrator and no-self-decision rules stay.
CREATE OR REPLACE FUNCTION baro_expense_deletion_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'EXPENSE_DELETE_HISTORY_IMMUTABLE'; END IF;
 PERFORM id FROM "ExpenseRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT baro_expense_deletion_allowed(NEW."requestId",NEW."orgId",NEW.version) THEN RAISE EXCEPTION 'EXPENSE_DELETE_NOT_AVAILABLE'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW."documentSnapshot"->'document'->>'id' IS DISTINCT FROM NEW."requestId"::text OR NEW."documentSnapshot"->'document'->>'version' IS DISTINCT FROM NEW.version::text THEN RAISE EXCEPTION 'EXPENSE_DELETE_INVALID_REQUEST'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "ExpenseRequest" r ON r."orgId"=e."orgId" WHERE e.id=NEW."requestedByEmployeeId" AND e."orgId"=NEW."orgId" AND e.status='ACTIVE' AND r.id=NEW."requestId" AND (e."orgRole"='ADMIN' OR r."createdByEmployeeId"=e.id OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id AND s."employeeId"=e.id))) THEN RAISE EXCEPTION 'EXPENSE_DELETE_NOT_PARTICIPANT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "EmployeeGrade" g ON g.id=e."gradeId" AND g."orgId"=e."orgId" JOIN "EmployeeGradeSet" gs ON gs.id=g."setId" WHERE e.id=NEW."finalEmployeeId" AND e."orgId"=NEW."orgId" AND g.id=NEW."finalGradeId" AND g."setId"=NEW."gradeSetId" AND g."sortOrder"=NEW."finalGradeOrder" AND g."isActive" AND gs."isActive" AND e.id=COALESCE((SELECT s."employeeId" FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=NEW."requestId" AND s."orgId"=NEW."orgId" ORDER BY s.position DESC LIMIT 1),(SELECT r."createdByEmployeeId" FROM "ExpenseRequest" r WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId"))) THEN RAISE EXCEPTION 'EXPENSE_DELETE_FINAL_GRADE_REQUIRED'; END IF;
 ELSE
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR (to_jsonb(NEW)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt']) THEN RAISE EXCEPTION 'EXPENSE_DELETE_HISTORY_IMMUTABLE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" a JOIN "EmployeeGrade" g ON g.id=a."gradeId" AND g."orgId"=a."orgId" JOIN "EmployeeGradeSet" gs ON gs.id=g."setId" JOIN "Employee" f ON f.id=NEW."finalEmployeeId" AND f."orgId"=a."orgId" JOIN "EmployeeGrade" fg ON fg.id=f."gradeId" AND fg."orgId"=f."orgId" WHERE a.id=NEW."decidedByEmployeeId" AND a."orgId"=NEW."orgId" AND a.id<>NEW."requestedByEmployeeId" AND a.status='ACTIVE' AND a."orgRole"='ADMIN' AND g."isActive" AND gs."isActive" AND g."setId"=NEW."gradeSetId" AND f."gradeId"=NEW."finalGradeId" AND fg."setId"=NEW."gradeSetId" AND g."sortOrder">GREATEST(NEW."finalGradeOrder",fg."sortOrder")) THEN RAISE EXCEPTION 'EXPENSE_DELETE_APPROVER_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
