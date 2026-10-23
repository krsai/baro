-- Tenant policy is keyed by base FK, never by industry or tax variant.
CREATE TABLE IF NOT EXISTS "ExpenseCodeLinkAudit" (
 id SERIAL PRIMARY KEY,"orgId" INTEGER NOT NULL,"baseId" INTEGER NOT NULL,
 "previousTarget" TEXT,target TEXT NOT NULL,"actorId" INTEGER,source TEXT NOT NULL DEFAULT 'USER',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExpenseCodeLinkAudit_orgId_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ExpenseCodeLinkAudit_baseId_fkey" FOREIGN KEY("baseId") REFERENCES "TransactionCodeBase"(id) ON DELETE RESTRICT,
 CONSTRAINT "ExpenseCodeLinkAudit_actorId_orgId_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseCodeLinkAudit_id_orgId_key" UNIQUE(id,"orgId"),
 CONSTRAINT "ExpenseCodeLinkAudit_id_orgId_baseId_key" UNIQUE(id,"orgId","baseId")
);
CREATE TABLE IF NOT EXISTS "ExpenseCodeLinkPolicy" (
 "orgId" INTEGER NOT NULL,"baseId" INTEGER NOT NULL,target TEXT NOT NULL DEFAULT 'NONE',"auditId" INTEGER NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExpenseCodeLinkPolicy_pkey" PRIMARY KEY("orgId","baseId"),
 CONSTRAINT "ExpenseCodeLinkPolicy_orgId_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ExpenseCodeLinkPolicy_baseId_fkey" FOREIGN KEY("baseId") REFERENCES "TransactionCodeBase"(id) ON DELETE RESTRICT,
 CONSTRAINT "ExpenseCodeLinkPolicy_auditId_orgId_baseId_fkey" FOREIGN KEY("auditId","orgId","baseId") REFERENCES "ExpenseCodeLinkAudit"(id,"orgId","baseId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ExpenseCodeLinkAudit_orgId_baseId_createdAt_idx" ON "ExpenseCodeLinkAudit"("orgId","baseId","createdAt");
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "linkTarget" TEXT;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "linkPolicyAuditId" INTEGER;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PartnerTransactionCost_linkPolicyAuditId_orgId_fkey') THEN
  ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "PartnerTransactionCost_linkPolicyAuditId_orgId_fkey" FOREIGN KEY("linkPolicyAuditId","orgId") REFERENCES "ExpenseCodeLinkAudit"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseCodeLinkPolicy_target_check') THEN
  ALTER TABLE "ExpenseCodeLinkPolicy" ADD CONSTRAINT "ExpenseCodeLinkPolicy_target_check" CHECK(target IN ('NONE','PROCESS'));
  ALTER TABLE "ExpenseCodeLinkAudit" ADD CONSTRAINT "ExpenseCodeLinkAudit_target_check" CHECK(target IN ('NONE','PROCESS') AND ("previousTarget" IS NULL OR "previousTarget" IN ('NONE','PROCESS')));
  ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_link_target_check" CHECK(("linkTarget" IS NULL OR "linkTarget" IN ('NONE','PROCESS')) AND ("linkPolicyAuditId" IS NULL OR "linkTarget" IS NOT NULL));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_link_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'expense code link audit is append-only'; END $$;
DROP TRIGGER IF EXISTS "ExpenseCodeLinkAudit_append_only" ON "ExpenseCodeLinkAudit";
CREATE TRIGGER "ExpenseCodeLinkAudit_append_only" BEFORE UPDATE OR DELETE ON "ExpenseCodeLinkAudit" FOR EACH ROW EXECUTE FUNCTION baro_expense_link_audit_guard();
CREATE OR REPLACE FUNCTION baro_expense_link_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ExpenseCodeLinkAudit" WHERE id=NEW."auditId" AND "orgId"=NEW."orgId" AND "baseId"=NEW."baseId" AND target=NEW.target) THEN RAISE EXCEPTION 'expense code link audit mismatch'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseCodeLinkPolicy_audit_guard" ON "ExpenseCodeLinkPolicy";
CREATE TRIGGER "ExpenseCodeLinkPolicy_audit_guard" BEFORE INSERT OR UPDATE ON "ExpenseCodeLinkPolicy" FOR EACH ROW EXECUTE FUNCTION baro_expense_link_policy_guard();
-- Historical industry policies and cost rows are deliberately not rewritten.

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
 IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."partnerOrgId" AND "ownerOrgId"=NEW."orgId" AND "isActive" AND type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER')) THEN RAISE EXCEPTION 'invalid transaction partner'; END IF;
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
   options."orderInput":=CASE WHEN link_target='PROCESS' THEN 'REQUIRED' ELSE 'OPTIONAL' END;
   options."styleInput":=CASE WHEN link_target='PROCESS' THEN 'REQUIRED' ELSE 'OPTIONAL' END;
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
