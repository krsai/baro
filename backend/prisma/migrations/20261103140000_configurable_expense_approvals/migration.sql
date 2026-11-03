-- Only explicitly snapshotted rules authorize an operator to approve.
CREATE OR REPLACE FUNCTION baro_expense_operator_authorized(org_id INTEGER,request_id INTEGER,request_version INTEGER,employee_id INTEGER)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "ExpenseRequestAudit" a
 JOIN "Employee" e ON e.id=employee_id AND e."orgId"=org_id AND e.status='ACTIVE' AND e."orgRole"='OPERATOR'
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a."afterSnapshot"->'approvalPolicy'->'resolvedStages','[]'::jsonb)) stage
 WHERE a."orgId"=org_id AND a."requestId"=request_id AND a.version=request_version
 AND a."afterSnapshot"->'approvalPolicy'->'config'->>'version'='2'
 AND a."afterSnapshot"->'approvalPolicy'->'config'->>'kind'='EXPENSE'
 AND stage->>'employeeId'=employee_id::text AND stage->>'role'='OPERATOR' AND stage->>'gradeId'=e."gradeId"::text)
$$;
CREATE OR REPLACE FUNCTION baro_expense_approval_role_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id=NEW."employeeId" AND e."orgId"=NEW."orgId" AND e.status='ACTIVE'
 AND (e."orgRole" IN ('ADMIN','ACCOUNTANT') OR (e."orgRole"='OPERATOR' AND baro_expense_operator_authorized(NEW."orgId",NEW."requestId",NEW.version,NEW."employeeId")))) THEN RAISE EXCEPTION 'INVALID_EXPENSE_APPROVERS'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM "ExpenseRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=r.id AND s."orgId"=r."orgId"
 JOIN "Employee" e ON e.id=s."employeeId" AND e."orgId"=s."orgId"
 WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId" AND r.version=NEW.version AND r."createdByEmployeeId"<>NEW."employeeId"
 AND s.position=NEW.position AND s."employeeId"=NEW."employeeId" AND e.status='ACTIVE'
 AND (e."orgRole" IN ('ADMIN','ACCOUNTANT') OR (e."orgRole"='OPERATOR' AND baro_expense_operator_authorized(NEW."orgId",NEW."requestId",NEW.version,NEW."employeeId"))))
 OR EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."orgId"=NEW."orgId" AND d."requestId"=NEW."requestId" AND d.version=NEW.version AND d.decision='REJECTED')
 OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=NEW."requestId" AND s.position<NEW.position AND NOT EXISTS
 (SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=s."requestId" AND d.version=NEW.version AND d.position=s.position AND d."employeeId"=s."employeeId" AND d.decision='APPROVED')) THEN RAISE EXCEPTION 'EXPENSE_APPROVAL_NOT_YOUR_TURN'; END IF;
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "BankLedgerEvidenceAllocation" a ON a."expenseItemId"=c.id JOIN "BankLedgerEntry" e ON e.id=a."entryId"
 WHERE c."expenseRequestId"=NEW."requestId" AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;
 RETURN NEW;
END $$;
