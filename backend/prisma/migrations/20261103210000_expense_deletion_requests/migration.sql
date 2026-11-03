ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),ADD COLUMN IF NOT EXISTS "deletedByEmployeeId" INTEGER,ADD COLUMN IF NOT EXISTS "deletionRequestId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_deletionRequestId_key" ON "ExpenseRequest"("deletionRequestId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequest_deletedByEmployeeId_orgId_fkey') THEN ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_deletedByEmployeeId_orgId_fkey" FOREIGN KEY("deletedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT; END IF;
END $$;
CREATE TABLE IF NOT EXISTS "ExpenseDeletionRequest"(
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"requestId" INTEGER NOT NULL,version INTEGER NOT NULL,"clientKey" TEXT NOT NULL,
 "requestedByEmployeeId" INTEGER NOT NULL,reason TEXT NOT NULL,"finalEmployeeId" INTEGER NOT NULL,"finalGradeId" INTEGER NOT NULL,"gradeSetId" INTEGER NOT NULL,"finalGradeOrder" INTEGER NOT NULL,
 "documentSnapshot" JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',"decidedByEmployeeId" INTEGER,"decisionReason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"decidedAt" TIMESTAMP(3),
 CONSTRAINT "ExpenseDeletionRequest_request_scope_fkey" FOREIGN KEY("requestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseDeletionRequest_requester_scope_fkey" FOREIGN KEY("requestedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseDeletionRequest_decider_scope_fkey" FOREIGN KEY("decidedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseDeletionRequest_final_scope_fkey" FOREIGN KEY("finalEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseDeletionRequest_grade_scope_fkey" FOREIGN KEY("finalGradeId","orgId") REFERENCES "EmployeeGrade"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseDeletionRequest_state_check" CHECK(length(trim(reason)) BETWEEN 1 AND 1000 AND version>0 AND (status='PENDING' AND "decidedAt" IS NULL AND "decidedByEmployeeId" IS NULL OR status IN ('APPROVED','REJECTED') AND "decidedAt" IS NOT NULL AND "decidedByEmployeeId" IS NOT NULL) AND (status<>'REJECTED' OR COALESCE(length(trim("decisionReason")),0) BETWEEN 1 AND 1000))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseDeletionRequest_orgId_clientKey_key" ON "ExpenseDeletionRequest"("orgId","clientKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseDeletionRequest_pending_key" ON "ExpenseDeletionRequest"("orgId","requestId",version) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS "ExpenseDeletionRequest_orgId_status_createdAt_idx" ON "ExpenseDeletionRequest"("orgId",status,"createdAt");
CREATE OR REPLACE FUNCTION baro_expense_deletion_allowed(request_id INTEGER,org_id INTEGER,request_version INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
 RETURN EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=request_id AND r."orgId"=org_id AND r.version=request_version AND r."deletedAt" IS NULL)
 AND NOT (baro_expense_approval_exempt(request_id,org_id,request_version) OR
  EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" WHERE "requestId"=request_id AND "orgId"=org_id) AND
  NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=request_id AND s."orgId"=org_id AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=request_id AND d."orgId"=org_id AND d.version=request_version AND d.position=s.position AND d."employeeId"=s."employeeId" AND d.decision='APPROVED')))
 AND NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "BankLedgerEvidenceAllocation" a ON a."expenseItemId"=c.id JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE c."expenseRequestId"=request_id AND c."orgId"=org_id AND e."voidedAt" IS NULL);
END $$;
CREATE OR REPLACE FUNCTION baro_expense_deletion_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'EXPENSE_DELETE_HISTORY_IMMUTABLE'; END IF;
 PERFORM id FROM "ExpenseRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT baro_expense_deletion_allowed(NEW."requestId",NEW."orgId",NEW.version) THEN RAISE EXCEPTION 'EXPENSE_DELETE_NOT_AVAILABLE'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW."documentSnapshot"->'document'->>'id' IS DISTINCT FROM NEW."requestId"::text OR NEW."documentSnapshot"->'document'->>'version' IS DISTINCT FROM NEW.version::text THEN RAISE EXCEPTION 'EXPENSE_DELETE_INVALID_REQUEST'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "ExpenseRequest" r ON r."orgId"=e."orgId" WHERE e.id=NEW."requestedByEmployeeId" AND e."orgId"=NEW."orgId" AND e.status='ACTIVE' AND r.id=NEW."requestId" AND (e."orgRole"='ADMIN' OR r."createdByEmployeeId"=e.id OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id AND s."employeeId"=e.id))) THEN RAISE EXCEPTION 'EXPENSE_DELETE_NOT_PARTICIPANT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s JOIN "Employee" e ON e.id=s."employeeId" AND e."orgId"=s."orgId" JOIN "EmployeeGrade" g ON g.id=e."gradeId" AND g."orgId"=e."orgId" JOIN "EmployeeGradeSet" gs ON gs.id=g."setId" WHERE s."requestId"=NEW."requestId" AND s."orgId"=NEW."orgId" AND s."employeeId"=NEW."finalEmployeeId" AND g.id=NEW."finalGradeId" AND g."setId"=NEW."gradeSetId" AND g."sortOrder"=NEW."finalGradeOrder" AND g."isActive" AND gs."isActive" AND s.position=(SELECT max(position) FROM "ExpenseRequestApprovalStep" WHERE "requestId"=NEW."requestId")) THEN RAISE EXCEPTION 'EXPENSE_DELETE_FINAL_GRADE_REQUIRED'; END IF;
 ELSE
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR (to_jsonb(NEW)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decidedByEmployeeId','decisionReason','decidedAt']) THEN RAISE EXCEPTION 'EXPENSE_DELETE_HISTORY_IMMUTABLE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" a JOIN "EmployeeGrade" g ON g.id=a."gradeId" AND g."orgId"=a."orgId" JOIN "EmployeeGradeSet" gs ON gs.id=g."setId" JOIN "Employee" f ON f.id=NEW."finalEmployeeId" AND f."orgId"=a."orgId" JOIN "EmployeeGrade" fg ON fg.id=f."gradeId" AND fg."orgId"=f."orgId" WHERE a.id=NEW."decidedByEmployeeId" AND a."orgId"=NEW."orgId" AND a.id<>NEW."requestedByEmployeeId" AND a.status='ACTIVE' AND a."orgRole"='ADMIN' AND g."isActive" AND gs."isActive" AND g."setId"=NEW."gradeSetId" AND f."gradeId"=NEW."finalGradeId" AND fg."setId"=NEW."gradeSetId" AND g."sortOrder">GREATEST(NEW."finalGradeOrder",fg."sortOrder")) THEN RAISE EXCEPTION 'EXPENSE_DELETE_APPROVER_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseDeletionRequest_guard" ON "ExpenseDeletionRequest";
CREATE TRIGGER "ExpenseDeletionRequest_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseDeletionRequest" FOR EACH ROW EXECUTE FUNCTION baro_expense_deletion_request_guard();
CREATE OR REPLACE FUNCTION baro_expense_deleted_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN IF NEW."deletedAt" IS NOT NULL OR NEW."deletedByEmployeeId" IS NOT NULL OR NEW."deletionRequestId" IS NOT NULL THEN RAISE EXCEPTION 'EXPENSE_DELETE_APPROVAL_REQUIRED'; END IF; RETURN NEW; END IF;
 IF OLD."deletedAt" IS NOT NULL THEN RAISE EXCEPTION 'EXPENSE_REQUEST_DELETED'; END IF;
 IF ROW(NEW."deletedAt",NEW."deletedByEmployeeId",NEW."deletionRequestId") IS DISTINCT FROM ROW(OLD."deletedAt",OLD."deletedByEmployeeId",OLD."deletionRequestId") THEN
  IF NEW."deletedAt" IS NULL OR (to_jsonb(NEW)-ARRAY['deletedAt','deletedByEmployeeId','deletionRequestId','version','updatedAt','updatedByEmployeeId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['deletedAt','deletedByEmployeeId','deletionRequestId','version','updatedAt','updatedByEmployeeId']) OR NOT EXISTS(SELECT 1 FROM "ExpenseDeletionRequest" d WHERE d.id=NEW."deletionRequestId" AND d."requestId"=NEW.id AND d."orgId"=NEW."orgId" AND d.version=OLD.version AND d.status='APPROVED' AND d."decidedByEmployeeId"=NEW."deletedByEmployeeId" AND d."decidedByEmployeeId"::text=current_setting('baro.expense_editor_actor',true)) THEN RAISE EXCEPTION 'EXPENSE_DELETE_APPROVAL_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseRequest_deleted_guard" ON "ExpenseRequest";
CREATE TRIGGER "ExpenseRequest_deleted_guard" BEFORE INSERT OR UPDATE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_expense_deleted_guard();
CREATE OR REPLACE FUNCTION baro_expense_deleted_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "ExpenseRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" AND "deletedAt" IS NOT NULL) THEN RAISE EXCEPTION 'EXPENSE_REQUEST_DELETED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseDeletionApproval_guard" ON "ExpenseApprovalDecision";
CREATE TRIGGER "ExpenseDeletionApproval_guard" BEFORE INSERT ON "ExpenseApprovalDecision" FOR EACH ROW EXECUTE FUNCTION baro_expense_deleted_decision_guard();
CREATE OR REPLACE FUNCTION baro_expense_deletion_applied_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId" AND r."deletedAt" IS NOT NULL AND r."deletionRequestId"=NEW.id AND r."deletedByEmployeeId"=NEW."decidedByEmployeeId") THEN RAISE EXCEPTION 'EXPENSE_DELETE_NOT_APPLIED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseDeletionRequest_applied_guard" ON "ExpenseDeletionRequest";
CREATE CONSTRAINT TRIGGER "ExpenseDeletionRequest_applied_guard" AFTER UPDATE ON "ExpenseDeletionRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_deletion_applied_guard();
-- An approved deletion does not register or change a payee. A later inactive
-- bank account must not prevent deleting an otherwise eligible expense.
DO $$ BEGIN
 IF to_regprocedure('baro_expense_payee_bank_guard()') IS NOT NULL THEN
  DROP TRIGGER IF EXISTS "ExpenseRequest_payee_bank_guard" ON "ExpenseRequest";
  CREATE CONSTRAINT TRIGGER "ExpenseRequest_payee_bank_guard" AFTER INSERT OR UPDATE ON "ExpenseRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW."deletedAt" IS NULL) EXECUTE FUNCTION baro_expense_payee_bank_guard();
 END IF;
END $$;
