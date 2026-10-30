-- Current administrator authority can complete the author's own request without
-- creating a fictitious self-approval decision or rewriting historical documents.
CREATE OR REPLACE FUNCTION baro_admin_drafter_exempt(request_id integer, org_id integer, request_version integer)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "Employee" e ON e.id=r."createdByEmployeeId" AND e."orgId"=r."orgId"
 WHERE r.id=request_id AND r."orgId"=org_id AND r.version=request_version
 AND e.status='ACTIVE' AND e."orgRole"='ADMIN'
 AND NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id AND s."orgId"=r."orgId")
 AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d."orgId"=r."orgId" AND d.version=r.version))
$$;
CREATE OR REPLACE FUNCTION baro_expense_approval_exempt(request_id integer, org_id integer, request_version integer)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=request_id AND d."orgId"=org_id AND d.version=request_version AND d.decision='REJECTED')
 AND (baro_admin_drafter_exempt(request_id,org_id,request_version) OR EXISTS(
 SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestAudit" a ON a."requestId"=r.id AND a."orgId"=r."orgId" AND a.version=r.version
 WHERE r.id=request_id AND r."orgId"=org_id AND r.version=request_version
 AND a."afterSnapshot"->'approvalPolicy'->>'exempt'='true'
 AND a."afterSnapshot"->'approvalPolicy'->>'drafterId'=r."createdByEmployeeId"::text))
$$;
