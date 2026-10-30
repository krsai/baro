ALTER TABLE "ExpenseApprovalDecision" ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "ExpenseApprovalDecision" ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE "ExpenseApprovalDecision" DROP CONSTRAINT IF EXISTS "ExpenseApprovalDecision_result_check";
ALTER TABLE "ExpenseApprovalDecision" ADD CONSTRAINT "ExpenseApprovalDecision_result_check" CHECK (
 (decision='APPROVED' AND reason IS NULL) OR
 (decision='REJECTED' AND reason IS NOT NULL AND length(reason)<=1000 AND reason ~ '[^[:space:]]')
);
CREATE OR REPLACE FUNCTION baro_expense_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM "ExpenseRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=r.id AND s."orgId"=r."orgId"
 JOIN "Employee" e ON e.id=s."employeeId" AND e."orgId"=s."orgId"
 WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId" AND r.version=NEW.version AND r."createdByEmployeeId"<>NEW."employeeId"
 AND s.position=NEW.position AND s."employeeId"=NEW."employeeId" AND e.status='ACTIVE' AND e."orgRole" IN ('ADMIN','ACCOUNTANT'))
 OR EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."orgId"=NEW."orgId" AND d."requestId"=NEW."requestId" AND d.version=NEW.version AND d.decision='REJECTED')
 OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=NEW."requestId" AND s.position<NEW.position AND NOT EXISTS
 (SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=s."requestId" AND d.version=NEW.version AND d.position=s.position AND d."employeeId"=s."employeeId" AND d.decision='APPROVED')) THEN RAISE EXCEPTION 'EXPENSE_APPROVAL_NOT_YOUR_TURN'; END IF;
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "BankLedgerEvidenceAllocation" a ON a."expenseItemId"=c.id JOIN "BankLedgerEntry" e ON e.id=a."entryId"
 WHERE c."expenseRequestId"=NEW."requestId" AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_rejected_expense_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_id INTEGER;
BEGIN
 IF NEW."expenseItemId" IS NOT NULL THEN
 SELECT "expenseRequestId" INTO request_id FROM "PartnerTransactionCost" WHERE id=NEW."expenseItemId" AND "orgId"=NEW."orgId";
 PERFORM id FROM "ExpenseRequest" WHERE id=request_id AND "orgId"=NEW."orgId" FOR UPDATE;
 IF EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" WHERE "orgId"=NEW."orgId" AND "requestId"=request_id AND version=NEW."requestVersion" AND decision='REJECTED') THEN RAISE EXCEPTION 'LEDGER_EXPENSE_NOT_APPROVED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankLedgerExpenseRejection_guard" ON "BankLedgerEvidenceAllocation";
CREATE TRIGGER "BankLedgerExpenseRejection_guard" BEFORE INSERT ON "BankLedgerEvidenceAllocation" FOR EACH ROW EXECUTE FUNCTION baro_rejected_expense_payment_guard();
