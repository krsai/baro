-- Preserve existing documents; only an explicit policy snapshot for this version exempts approval.
CREATE OR REPLACE FUNCTION baro_expense_approval_exempt(request_id integer, org_id integer, request_version integer) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestAudit" a ON a."requestId"=r.id AND a."orgId"=r."orgId" AND a.version=r.version
 WHERE r.id=request_id AND r."orgId"=org_id AND r.version=request_version
 AND a."afterSnapshot"->'approvalPolicy'->>'exempt'='true'
 AND a."afterSnapshot"->'approvalPolicy'->>'drafterId'=r."createdByEmployeeId"::text)
$$;
CREATE OR REPLACE FUNCTION baro_expense_approval_role_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."employeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole" IN ('ADMIN','ACCOUNTANT')) THEN RAISE EXCEPTION 'INVALID_EXPENSE_APPROVERS'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseApprovalDecision_role_guard" ON "ExpenseApprovalDecision";
CREATE TRIGGER "ExpenseApprovalDecision_role_guard" BEFORE INSERT ON "ExpenseApprovalDecision" FOR EACH ROW EXECUTE FUNCTION baro_expense_approval_role_guard();
CREATE OR REPLACE FUNCTION baro_ledger_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE entry "BankLedgerEntry"; cost "PartnerTransactionCost"; bill "Invoice"; BEGIN
 SELECT * INTO entry FROM "BankLedgerEntry" WHERE id=NEW."entryId";
 IF entry."orgId"<>NEW."orgId" OR entry."voidedAt" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW."invoiceId" IS NOT NULL THEN
 SELECT * INTO bill FROM "Invoice" WHERE id=NEW."invoiceId" FOR UPDATE;
 IF entry."evidenceType"<>'INVOICE' OR entry.direction<>'IN' OR bill.status<>'ISSUED' OR bill."currencyCode"<>(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId") THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW.amount+(SELECT coalesce(sum(a.amount),0) FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."invoiceId"=NEW."invoiceId" AND e."voidedAt" IS NULL)>bill.total THEN RAISE EXCEPTION 'LEDGER_EXCEEDS_DOCUMENT'; END IF;
 ELSE
 SELECT * INTO cost FROM "PartnerTransactionCost" WHERE id=NEW."expenseItemId";
 PERFORM id FROM "ExpenseRequest" WHERE id=cost."expenseRequestId" FOR UPDATE;
 IF entry."evidenceType"<>'EXPENSE' OR entry.direction<>'OUT' OR cost.currency<>(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId")
 OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=cost."expenseRequestId" AND r.version=NEW."requestVersion")
 OR (NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=cost."expenseRequestId") AND NOT baro_expense_approval_exempt(cost."expenseRequestId",NEW."orgId",NEW."requestVersion"))
 OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=cost."expenseRequestId" AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=s."requestId" AND d.version=NEW."requestVersion" AND d.position=s.position AND d."employeeId"=s."employeeId")) THEN RAISE EXCEPTION 'LEDGER_EXPENSE_NOT_APPROVED'; END IF;
 IF NEW.amount+(SELECT coalesce(sum(a.amount),0) FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=NEW."expenseItemId" AND e."voidedAt" IS NULL)>cost.amount THEN RAISE EXCEPTION 'LEDGER_EXCEEDS_DOCUMENT'; END IF;
 END IF; RETURN NEW;
END $$;
