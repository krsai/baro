-- Add real employee payees without changing existing vendor identities or payroll bank fields.
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "payeeEmployeeId" INTEGER;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "payeeEmployeeId" INTEGER;
ALTER TABLE "ExpenseRequest" ALTER COLUMN "partnerOrgId" DROP NOT NULL;
ALTER TABLE "PartnerTransactionCost" ALTER COLUMN "partnerOrgId" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_id_orgId_payeeEmployeeId_key" ON "ExpenseRequest"(id,"orgId","payeeEmployeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_id_orgId_key" ON "ExpenseRequest"(id,"orgId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequest_payeeEmployeeId_orgId_fkey') THEN
 ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_payeeEmployeeId_orgId_fkey" FOREIGN KEY("payeeEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_payee_kind_check" CHECK(num_nonnulls("partnerOrgId","payeeEmployeeId")=1);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PartnerTransactionCost_payeeEmployeeId_orgId_fkey') THEN
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "PartnerTransactionCost_payeeEmployeeId_orgId_fkey" FOREIGN KEY("payeeEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_payee_kind_check" CHECK(num_nonnulls("partnerOrgId","payeeEmployeeId")=1 AND ("payeeEmployeeId" IS NULL OR "outsourcedWorkRecordId" IS NULL));
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_employee_request_fkey" FOREIGN KEY("expenseRequestId","orgId","payeeEmployeeId") REFERENCES "ExpenseRequest"(id,"orgId","payeeEmployeeId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_request_scope_fkey" FOREIGN KEY("expenseRequestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS "EmployeeExpenseBankAccount"(
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"employeeId" INTEGER NOT NULL,"createdByEmployeeId" INTEGER NOT NULL,
 "currencyCode" TEXT NOT NULL CHECK("currencyCode" IN ('VND','USD','KRW')),
 "bankName" TEXT NOT NULL CHECK(length(trim("bankName")) BETWEEN 1 AND 200),
 "accountNumber" TEXT NOT NULL CHECK(length(trim("accountNumber")) BETWEEN 1 AND 200),
 "accountHolder" TEXT NOT NULL CHECK(length(trim("accountHolder")) BETWEEN 1 AND 200),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmployeeExpenseBankAccount_employeeId_orgId_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "EmployeeExpenseBankAccount_createdByEmployeeId_orgId_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeExpenseBank_identity_key" ON "EmployeeExpenseBankAccount"("orgId","employeeId","currencyCode","bankName","accountNumber");
CREATE OR REPLACE FUNCTION baro_employee_expense_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'employee expense bank identity immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."employeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE')
 OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT')) THEN RAISE EXCEPTION 'invalid employee expense bank scope'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "EmployeeExpenseBankAccount_write_guard" ON "EmployeeExpenseBankAccount";
CREATE TRIGGER "EmployeeExpenseBankAccount_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeExpenseBankAccount" FOR EACH ROW EXECUTE FUNCTION baro_employee_expense_bank_guard();
CREATE OR REPLACE FUNCTION baro_expense_payee_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."payeeEmployeeId" IS NOT NULL THEN
  PERFORM id FROM "Employee" WHERE id=NEW."payeeEmployeeId" AND "orgId"=NEW."orgId" FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM "EmployeeExpenseBankAccount" WHERE "employeeId"=NEW."payeeEmployeeId" AND "orgId"=NEW."orgId") THEN RAISE EXCEPTION 'PAYEE_BANK_ACCOUNT_REQUIRED'; END IF;
 ELSE
  PERFORM id FROM "Organization" WHERE id=NEW."partnerOrgId" FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE "entityId"=NEW."partnerOrgId" AND "orgId"=NEW."orgId") THEN RAISE EXCEPTION 'PAYEE_BANK_ACCOUNT_REQUIRED'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE "expenseRequestId"=NEW.id AND "orgId"=NEW."orgId" AND ("partnerOrgId" IS DISTINCT FROM NEW."partnerOrgId" OR "payeeEmployeeId" IS DISTINCT FROM NEW."payeeEmployeeId")) THEN RAISE EXCEPTION 'expense request payee mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_cost_payee_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_cost RECORD;
BEGIN
 SELECT * INTO current_cost FROM "PartnerTransactionCost" WHERE id=NEW.id;
 IF FOUND AND current_cost."expenseRequestId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=current_cost."expenseRequestId" AND r."orgId"=current_cost."orgId" AND r."partnerOrgId" IS NOT DISTINCT FROM current_cost."partnerOrgId" AND r."payeeEmployeeId" IS NOT DISTINCT FROM current_cost."payeeEmployeeId") THEN RAISE EXCEPTION 'expense request payee mismatch'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "TransactionCost_payee_match_guard" ON "PartnerTransactionCost";
CREATE CONSTRAINT TRIGGER "TransactionCost_payee_match_guard" AFTER INSERT OR UPDATE ON "PartnerTransactionCost" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_cost_payee_guard();

CREATE OR REPLACE FUNCTION baro_transaction_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $cost$
DECLARE mode TEXT; fields TEXT[]; field TEXT; options RECORD; taxable BOOLEAN; production RECORD; precision INTEGER; link_target TEXT; audit_base INTEGER;
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
 ELSIF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."partnerOrgId" AND "ownerOrgId"=NEW."orgId" AND "isActive" AND type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER')) THEN RAISE EXCEPTION 'invalid transaction partner'; END IF;
 IF NEW."transactionCodeId" IS NULL THEN
   SELECT s."entryMode",s."requiredFields",s."orderInput",s."styleInput",s."processInput" INTO options
   FROM "OutsourcingServiceType" s WHERE s.id=NEW."serviceTypeId" AND s."ownerOrgId"=NEW."orgId" AND s."isActive";
 ELSE
   SELECT b."entryMode",b."requiredFields",b."orderInput",b."styleInput",b."processInput" INTO options
   FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "ExpenseType" t ON t.id=b."expenseTypeId"
   WHERE c.id=NEW."transactionCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."serviceTypeId"=NEW."serviceTypeId" AND c."isActive" AND b."isActive" AND t."isActive";
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid expense code'; END IF;
 mode:=options."entryMode"; fields:=options."requiredFields";
 IF NEW."transactionCodeId" IS NOT NULL THEN
   IF TG_OP='UPDATE' THEN
     IF OLD."linkTarget" IS NOT NULL AND ROW(NEW."linkTarget",NEW."linkPolicyAuditId") IS DISTINCT FROM ROW(OLD."linkTarget",OLD."linkPolicyAuditId") THEN RAISE EXCEPTION 'expense link snapshot immutable'; END IF;
     link_target:=coalesce(OLD."linkTarget",CASE WHEN OLD."outsourcedWorkRecordId" IS NOT NULL THEN 'PROCESS' ELSE 'NONE' END);
   ELSE
     SELECT p.target INTO link_target FROM "ExpenseCodeLinkPolicy" p JOIN "TransactionCode" c ON c."baseId"=p."baseId" WHERE c.id=NEW."transactionCodeId" AND p."orgId"=NEW."orgId";
     link_target:=coalesce(link_target,'NONE');
     -- Attaching an already-recorded legacy source is not creating production.
     IF NEW."outsourcedWorkRecordId" IS NOT NULL AND coalesce(baro_expense_editor_authorized(NEW."orgId"),false) THEN link_target:='PROCESS'; END IF;
   END IF;
   IF NEW."linkTarget" IS NOT NULL AND NEW."linkTarget"<>link_target THEN RAISE EXCEPTION 'expense link target mismatch'; END IF;
   NEW."linkTarget":=link_target;
   IF NEW."linkPolicyAuditId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ExpenseCodeLinkAudit" WHERE id=NEW."linkPolicyAuditId" AND "orgId"=NEW."orgId" AND target=link_target) THEN RAISE EXCEPTION 'expense link audit mismatch'; END IF;
   mode:=CASE WHEN NEW."outsourcedWorkRecordId" IS NOT NULL OR (TG_OP='INSERT' AND mode='PROCESS' AND link_target='PROCESS') THEN 'PROCESS' ELSE 'GENERAL' END;
   options."orderInput":=CASE WHEN link_target IN ('ORDER','STYLE','PROCESS') THEN 'REQUIRED' ELSE 'OPTIONAL' END;
   options."styleInput":=CASE WHEN link_target IN ('STYLE','PROCESS') THEN 'REQUIRED' WHEN link_target='ORDER' THEN 'HIDDEN' ELSE 'OPTIONAL' END;
   options."processInput":=CASE WHEN link_target='PROCESS' THEN 'REQUIRED' WHEN TG_OP='UPDATE' AND OLD."styleProcessId" IS NOT NULL THEN 'OPTIONAL' ELSE 'HIDDEN' END;
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
CREATE OR REPLACE FUNCTION baro_expense_editor_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event RECORD; scope_org INTEGER; row_id TEXT; found_before BOOLEAN; found_after BOOLEAN;
BEGIN
 scope_org:=CASE WHEN TG_OP='DELETE' THEN OLD."orgId" ELSE NEW."orgId" END;
 IF NOT coalesce(baro_expense_editor_authorized(scope_org),false) THEN
  -- Unwrapped historical cost clients are outside the request document lifecycle.
  IF TG_TABLE_NAME='PartnerTransactionCost' AND TG_OP='INSERT' AND NEW."expenseRequestId" IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'expense edit context required';
 END IF;
 SELECT * INTO event FROM "ExpenseRequestAudit" WHERE "orgId"=scope_org AND "clientKey"=current_setting('baro.expense_editor_key',true)
 AND "actorId"::text=current_setting('baro.expense_editor_actor',true);
 IF NOT FOUND THEN RAISE EXCEPTION 'expense edit audit required'; END IF;
 row_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
 IF TG_TABLE_NAME='ExpenseRequest' THEN
   IF event."requestId"<>NEW.id OR event.version<>NEW.version
    OR event."afterSnapshot"->'document'->>'remark' IS DISTINCT FROM NEW.remark
    OR event."afterSnapshot"->'document'->>'requestDate' IS DISTINCT FROM NEW."requestDate"
    OR event."afterSnapshot"->'document'->>'partnerOrgId' IS DISTINCT FROM NEW."partnerOrgId"::text
    OR event."afterSnapshot"->'document'->>'payeeEmployeeId' IS DISTINCT FROM NEW."payeeEmployeeId"::text
    OR event."afterSnapshot"->'document'->>'version' IS DISTINCT FROM NEW.version::text
    THEN RAISE EXCEPTION 'request audit mismatch'; END IF;
 ELSIF TG_TABLE_NAME='ExpenseRequestApprovalStep' THEN
   IF event."requestId" IS DISTINCT FROM (CASE WHEN TG_OP='DELETE' THEN OLD."requestId" ELSE NEW."requestId" END) THEN RAISE EXCEPTION 'approval request mismatch'; END IF;
   IF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(event."beforeSnapshot"->'document'->'approvalSteps','[]'::jsonb)) r WHERE r->>'id'=OLD.id) THEN RAISE EXCEPTION 'approval audit mismatch'; END IF;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(event."afterSnapshot"->'document'->'approvalSteps') r WHERE r->>'id'=NEW.id AND r->>'employeeId'=NEW."employeeId"::text AND r->>'position'=NEW.position::text)
     THEN RAISE EXCEPTION 'approval audit mismatch'; END IF;
   END IF;
 ELSIF TG_TABLE_NAME='PartnerTransactionCost' THEN
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(event."beforeSnapshot"->'costs') r WHERE r->>'id'=row_id AND r->>'orgId'=scope_org::text) INTO found_before;
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(event."afterSnapshot"->'costs') r WHERE r->>'id'=row_id AND r->>'orgId'=scope_org::text) INTO found_after;
   IF (TG_OP<>'INSERT' AND NOT found_before) OR (TG_OP='INSERT' AND NOT found_after)
    OR (TG_OP='UPDATE' AND NOT found_after AND EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE id::text=row_id)) THEN RAISE EXCEPTION 'expense edit audit mismatch'; END IF;
 ELSE
   IF event."beforeSnapshot"->'record'->>'id' IS DISTINCT FROM row_id AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(event."beforeSnapshot"->'costs') r WHERE r->'outsourcedWorkRecord'->>'id'=row_id)
    THEN RAISE EXCEPTION 'production edit audit mismatch'; END IF;
   IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "OutsourcedWorkRecord" r ON r.id=c."outsourcedWorkRecordId"
    WHERE r.id=NEW.id AND (c.quantity IS DISTINCT FROM r.quantity::numeric OR c."unitPrice" IS DISTINCT FROM r."outsourceUnitPrice" OR c."partnerOrgId"<>r."outsourcingPartnerId")) THEN RAISE EXCEPTION 'production does not match request'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
