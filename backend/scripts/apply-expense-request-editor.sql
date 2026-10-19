-- Authorized request edits replace the old blanket immutability rule.
-- No existing business rows are rewritten by this deployment.
-- HTTP gates enforce management roles (including the SYSTEM administrator).
-- The database capability additionally requires the active actor's tenant FK.
CREATE OR REPLACE FUNCTION baro_expense_editor_authorized(scope_org INTEGER) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
 SELECT current_setting('baro.expense_editor_org',true)=scope_org::text
 AND current_setting('baro.expense_editor_key',true) LIKE 'EXPENSE_REQUEST_EDIT:'||scope_org::text||':%'
 AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=scope_org
   AND e.id::text=current_setting('baro.expense_editor_actor',true)
   AND e.status::text='ACTIVE');
$$;

CREATE OR REPLACE FUNCTION baro_expense_editor_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event JSONB; scope_org INTEGER; row_id TEXT; found_before BOOLEAN; found_after BOOLEAN;
BEGIN
 scope_org:=CASE WHEN TG_OP='DELETE' THEN OLD."orgId" ELSE NEW."orgId" END;
 IF NOT coalesce(baro_expense_editor_authorized(scope_org),false) THEN
   IF TG_TABLE_NAME='PartnerTransactionCost' AND TG_OP='INSERT' THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'expense edit context required';
 END IF;
 SELECT value INTO event FROM "SystemSetting"
 WHERE key=current_setting('baro.expense_editor_key',true)
 AND "updatedByEmployeeId"::text=current_setting('baro.expense_editor_actor',true);
 IF NOT FOUND THEN RAISE EXCEPTION 'expense edit audit required'; END IF;
 row_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
 IF TG_TABLE_NAME='PartnerTransactionCost' THEN
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(event->'before'->'costs') r WHERE r->>'id'=row_id AND r->>'orgId'=scope_org::text) INTO found_before;
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(event->'after'->'costs') r WHERE r->>'id'=row_id AND r->>'orgId'=scope_org::text) INTO found_after;
   IF (TG_OP<>'INSERT' AND NOT found_before) OR (TG_OP='INSERT' AND NOT found_after)
     OR (TG_OP='UPDATE' AND NOT found_after AND EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE id::text=row_id))
     THEN RAISE EXCEPTION 'expense edit audit mismatch'; END IF;
 ELSE
   IF event->'before'->'record'->>'id' IS DISTINCT FROM row_id AND NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(event->'before'->'costs') r WHERE r->'outsourcedWorkRecord'->>'id'=row_id
   ) THEN RAISE EXCEPTION 'production edit audit mismatch'; END IF;
   IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "OutsourcedWorkRecord" r ON r.id=c."outsourcedWorkRecordId"
     WHERE r.id=NEW.id AND (c.quantity IS DISTINCT FROM r.quantity::numeric OR c."unitPrice" IS DISTINCT FROM r."outsourceUnitPrice"
       OR c."partnerOrgId"<>r."outsourcingPartnerId")) THEN RAISE EXCEPTION 'production does not match request'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS "ExpenseRequestEdit_cost_audit" ON "PartnerTransactionCost";
CREATE CONSTRAINT TRIGGER "ExpenseRequestEdit_cost_audit" AFTER INSERT OR UPDATE OR DELETE ON "PartnerTransactionCost"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_editor_audit_guard();
DROP TRIGGER IF EXISTS "ExpenseRequestEdit_production_audit" ON "OutsourcedWorkRecord";
CREATE CONSTRAINT TRIGGER "ExpenseRequestEdit_production_audit" AFTER UPDATE ON "OutsourcedWorkRecord"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (current_setting('baro.expense_editor_key',true) IS NOT NULL AND current_setting('baro.expense_editor_key',true)<>'')
 EXECUTE FUNCTION baro_expense_editor_audit_guard();

CREATE OR REPLACE FUNCTION baro_request_production_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan RECORD; physical_change BOOLEAN; business_zone TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE "outsourcedWorkRecordId"=OLD.id) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP='DELETE' OR NOT coalesce(baro_expense_editor_authorized(OLD."orgId"),false) THEN RAISE EXCEPTION 'request production history cannot be changed'; END IF;
 IF ROW(NEW.id,NEW."orgId",NEW."workLogId",NEW."assignmentPlanId",NEW."styleId",NEW."styleProcessId",NEW."createdByEmployeeId")
   IS DISTINCT FROM ROW(OLD.id,OLD."orgId",OLD."workLogId",OLD."assignmentPlanId",OLD."styleId",OLD."styleProcessId",OLD."createdByEmployeeId") THEN RAISE EXCEPTION 'production identity immutable'; END IF;
 SELECT a.* INTO plan FROM "AssignmentPlan" a WHERE a.id=OLD."assignmentPlanId" AND a."orgId"=OLD."orgId" FOR UPDATE;
 PERFORM id FROM "WorkOrder" WHERE id=plan."workOrderId" FOR UPDATE;
 IF EXISTS(SELECT 1 FROM "WorkOrder" WHERE id=plan."workOrderId" AND "invoiceFinalLockedAt" IS NOT NULL) THEN RAISE EXCEPTION 'order finally locked'; END IF;
 physical_change:=ROW(NEW.quantity,NEW."outsourceUnitPrice",NEW."outsourcingPartnerId") IS DISTINCT FROM ROW(OLD.quantity,OLD."outsourceUnitPrice",OLD."outsourcingPartnerId");
 business_zone:=coalesce(nullif(current_setting('baro.expense_editor_timezone',true),''),'Asia/Seoul');
 IF physical_change AND (plan."isCompleted" OR plan."ctReviewRequired") THEN RAISE EXCEPTION 'completed production cannot be changed'; END IF;
 IF physical_change AND EXISTS(SELECT 1 FROM "PayrollSnapshot" p JOIN "WorkLog" l ON l.id=OLD."workLogId"
   WHERE p."orgId"=OLD."orgId" AND p."factoryId"=plan."factoryId" AND NOT p."isProvisional"
   AND p.month IN (left(l."workDate",7),to_char(plan."closedAt" AT TIME ZONE 'UTC' AT TIME ZONE business_zone,'YYYY-MM'),to_char(plan."productionCompletedAt" AT TIME ZONE 'UTC' AT TIME ZONE business_zone,'YYYY-MM'),to_char(plan."completedAt" AT TIME ZONE 'UTC' AT TIME ZONE business_zone,'YYYY-MM'))) THEN RAISE EXCEPTION 'payroll locked'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_transaction_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $cost$
DECLARE mode TEXT; fields TEXT[]; field TEXT; options RECORD; taxable BOOLEAN; production RECORD; precision INTEGER;
BEGIN
 IF TG_OP<>'INSERT' THEN
   IF NOT coalesce(baro_expense_editor_authorized(OLD."orgId"),false) THEN RAISE EXCEPTION 'transaction cost history cannot be changed'; END IF;
   PERFORM id FROM "WorkOrder" WHERE "orgId"=OLD."orgId" AND id IN (OLD."workOrderId",CASE WHEN TG_OP='UPDATE' THEN NEW."workOrderId" END) ORDER BY id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM "WorkOrder" WHERE "orgId"=OLD."orgId" AND "invoiceFinalLockedAt" IS NOT NULL AND id IN (OLD."workOrderId",CASE WHEN TG_OP='UPDATE' THEN NEW."workOrderId" END)) THEN RAISE EXCEPTION 'order finally locked'; END IF;
   IF TG_OP='DELETE' THEN RETURN OLD; END IF;
   IF ROW(NEW.id,NEW."orgId",NEW."clientKey",NEW."createdByEmployeeId",NEW."createdAt",NEW."outsourcedWorkRecordId") IS DISTINCT FROM ROW(OLD.id,OLD."orgId",OLD."clientKey",OLD."createdByEmployeeId",OLD."createdAt",OLD."outsourcedWorkRecordId") THEN RAISE EXCEPTION 'expense identity immutable'; END IF;
   IF (to_jsonb(NEW)-'expenseRequestId'-'expenseRequestLine')=(to_jsonb(OLD)-'expenseRequestId'-'expenseRequestLine') THEN RETURN NEW; END IF;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."partnerOrgId" AND "ownerOrgId"=NEW."orgId" AND "isActive" AND type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER')) THEN RAISE EXCEPTION 'invalid transaction partner'; END IF;
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
