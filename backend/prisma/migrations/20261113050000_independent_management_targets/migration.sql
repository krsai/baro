-- NULL evidence flags retain the earlier combined exclusion without rewriting history.
ALTER TABLE "PayrollSnapshot" ADD COLUMN IF NOT EXISTS "evidenceManagementExcluded" BOOLEAN;
ALTER TABLE "PayrollManagementEvent" ADD COLUMN IF NOT EXISTS "evidenceExcluded" BOOLEAN;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "invoiceTargetRevision" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_id_sellerOrgId_key" ON "WorkOrder"(id,"sellerOrgId");
CREATE TABLE IF NOT EXISTS "OrderInvoicePolicy" (
 "workOrderId" INTEGER PRIMARY KEY,"orgId" INTEGER NOT NULL,excluded BOOLEAN NOT NULL DEFAULT false,revision INTEGER NOT NULL DEFAULT 1,"updatedByEmployeeId" INTEGER NOT NULL,
 CONSTRAINT "OrderInvoicePolicy_order_fkey" FOREIGN KEY("workOrderId","orgId") REFERENCES "WorkOrder"(id,"sellerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "OrderInvoicePolicy_actor_fkey" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderInvoicePolicy_workOrderId_orgId_key" ON "OrderInvoicePolicy"("workOrderId","orgId");
CREATE TABLE IF NOT EXISTS "OrderInvoicePolicyEvent" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"workOrderId" INTEGER NOT NULL,revision INTEGER NOT NULL,excluded BOOLEAN NOT NULL,reason TEXT NOT NULL,"actorId" INTEGER NOT NULL,"clientKey" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "OrderInvoicePolicyEvent_policy_fkey" FOREIGN KEY("workOrderId","orgId") REFERENCES "OrderInvoicePolicy"("workOrderId","orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "OrderInvoicePolicyEvent_actor_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderInvoicePolicyEvent_orgId_clientKey_key" ON "OrderInvoicePolicyEvent"("orgId","clientKey");
CREATE UNIQUE INDEX IF NOT EXISTS "OrderInvoicePolicyEvent_workOrderId_revision_key" ON "OrderInvoicePolicyEvent"("workOrderId",revision);
CREATE OR REPLACE FUNCTION baro_order_invoice_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_id integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'TARGET_HISTORY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='OrderInvoicePolicyEvent' THEN
  actor_id:=NEW."actorId";
  IF TG_OP<>'INSERT' OR NOT EXISTS(SELECT 1 FROM "OrderInvoicePolicy" p WHERE p."workOrderId"=NEW."workOrderId" AND p."orgId"=NEW."orgId" AND p.revision=NEW.revision AND p.excluded=NEW.excluded AND p."updatedByEmployeeId"=NEW."actorId") OR length(trim(NEW.reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'TARGET_CHANGED'; END IF;
 ELSE
  actor_id:=NEW."updatedByEmployeeId";
  PERFORM id FROM "WorkOrder" WHERE id=NEW."workOrderId" AND "sellerOrgId"=NEW."orgId" FOR UPDATE;
  IF NOT FOUND OR NEW.revision<1 OR (TG_OP='INSERT' AND NEW.revision<>1) OR (TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR NEW."orgId"<>OLD."orgId" OR NEW."workOrderId"<>OLD."workOrderId")) THEN RAISE EXCEPTION 'TARGET_CHANGED'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" LEFT JOIN "SystemSetting" p ON p.key='ROLE_ACCESS_POLICY' WHERE e.id=actor_id AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR') AND o.type::text='MANUFACTURER' AND o."isActive" AND o."ownerOrgId" IS NULL AND CASE WHEN jsonb_typeof(p.value->(o.type::text)->(e."orgRole"::text))='array' THEN (p.value->(o.type::text)->(e."orgRole"::text)) ? 'ORDER' ELSE true END) THEN RAISE EXCEPTION 'TARGET_ACCESS_DENIED'; END IF;
 -- Touch only management metadata so a concurrent Serializable issuer retries;
 -- the order's business updatedAt and all commercial fields stay unchanged.
 IF TG_TABLE_NAME='OrderInvoicePolicy' THEN UPDATE "WorkOrder" SET "invoiceTargetRevision"=NEW.revision WHERE id=NEW."workOrderId"; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "OrderInvoicePolicy_guard" ON "OrderInvoicePolicy";
CREATE TRIGGER "OrderInvoicePolicy_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OrderInvoicePolicy" FOR EACH ROW EXECUTE FUNCTION baro_order_invoice_policy_guard();
DROP TRIGGER IF EXISTS "OrderInvoicePolicyEvent_guard" ON "OrderInvoicePolicyEvent";
CREATE TRIGGER "OrderInvoicePolicyEvent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OrderInvoicePolicyEvent" FOR EACH ROW EXECUTE FUNCTION baro_order_invoice_policy_guard();
CREATE OR REPLACE FUNCTION baro_order_invoice_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OrderInvoicePolicyEvent" e WHERE e."workOrderId"=NEW."workOrderId" AND e."orgId"=NEW."orgId" AND e.revision=NEW.revision AND e.excluded=NEW.excluded AND e."actorId"=NEW."updatedByEmployeeId") THEN RAISE EXCEPTION 'TARGET_AUDIT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "OrderInvoicePolicy_audit" ON "OrderInvoicePolicy";
CREATE CONSTRAINT TRIGGER "OrderInvoicePolicy_audit" AFTER INSERT OR UPDATE ON "OrderInvoicePolicy" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_order_invoice_policy_audit();
CREATE OR REPLACE FUNCTION baro_invoice_order_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_revision integer; policy_revision integer;
BEGIN
 IF NEW."workOrderId" IS NULL THEN RETURN NEW; END IF;
 SELECT "invoiceTargetRevision" INTO target_revision FROM "WorkOrder" WHERE id=NEW."workOrderId" FOR SHARE;
 SELECT revision INTO policy_revision FROM "OrderInvoicePolicy" WHERE "workOrderId"=NEW."workOrderId";
 IF target_revision<>COALESCE(policy_revision,0) THEN RAISE EXCEPTION 'INVOICE_SOURCE_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM "OrderInvoicePolicy" p JOIN "Invoice" i ON i.id=NEW."invoiceId" AND i."sellerOrgId"=p."orgId" WHERE p."workOrderId"=NEW."workOrderId" AND p.excluded AND i."revisionOfInvoiceId" IS NULL) THEN RAISE EXCEPTION 'INVOICE_ORDER_MANAGEMENT_EXCLUDED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InvoiceOrder_target_guard" ON "InvoiceOrder";
CREATE TRIGGER "InvoiceOrder_target_guard" BEFORE INSERT ON "InvoiceOrder" FOR EACH ROW EXECUTE FUNCTION baro_invoice_order_target_guard();
CREATE OR REPLACE FUNCTION baro_payroll_management_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."payableManagementExcluded" OR COALESCE(NEW."evidenceManagementExcluded",false) OR NEW."managementRevision"<>0 THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_CHANGED'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."payableManagementExcluded" IS NOT DISTINCT FROM OLD."payableManagementExcluded" AND NEW."evidenceManagementExcluded" IS NOT DISTINCT FROM OLD."evidenceManagementExcluded" AND NEW."managementRevision"=OLD."managementRevision" THEN RETURN NEW; END IF;
 IF (NEW."payableManagementExcluded"=OLD."payableManagementExcluded" AND NEW."evidenceManagementExcluded" IS NOT DISTINCT FROM OLD."evidenceManagementExcluded") OR NEW."managementRevision"<>OLD."managementRevision"+1 OR (to_jsonb(NEW)-'payableManagementExcluded'-'evidenceManagementExcluded'-'managementRevision') IS DISTINCT FROM (to_jsonb(OLD)-'payableManagementExcluded'-'evidenceManagementExcluded'-'managementRevision') THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_CHANGED'; END IF;
 IF NOT baro_payroll_management_actor(NEW."orgId",nullif(current_setting('baro.payroll_management_actor',true),'')::integer) THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_ACCESS_DENIED'; END IF;
 IF (NEW."payableManagementExcluded" OR COALESCE(NEW."evidenceManagementExcluded",NEW."payableManagementExcluded")) AND EXISTS(SELECT 1 FROM "PayrollPayableDocument" d JOIN "PayrollPayableItem" i ON i."documentId"=d.id AND i."orgId"=d."orgId" JOIN "PayrollPayableAllocation" a ON a."payrollItemId"=i.id AND a."orgId"=i."orgId" JOIN "BankLedgerEntry" e ON e.id=a."entryId" AND e."orgId"=a."orgId" WHERE d."snapshotId"=NEW.id AND d."orgId"=NEW."orgId" AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_PAYMENT_LINKED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollSnapshot_management_guard" ON "PayrollSnapshot";
CREATE TRIGGER "PayrollSnapshot_management_guard" BEFORE INSERT OR UPDATE ON "PayrollSnapshot" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_guard();
CREATE OR REPLACE FUNCTION baro_payroll_management_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
 IF NEW."actorId"::text IS DISTINCT FROM current_setting('baro.payroll_management_actor',true) OR NOT baro_payroll_management_actor(NEW."orgId",NEW."actorId") OR NOT EXISTS(SELECT 1 FROM "PayrollSnapshot" s WHERE s.id=NEW."snapshotId" AND s."orgId"=NEW."orgId" AND s."managementRevision"=NEW.revision AND s.revision=NEW."snapshotRevision" AND s."payableManagementExcluded"=NEW.excluded AND NEW."evidenceExcluded" IS NOT NULL AND COALESCE(s."evidenceManagementExcluded",s."payableManagementExcluded")=NEW."evidenceExcluded") THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_CHANGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollManagementEvent_guard" ON "PayrollManagementEvent";
CREATE TRIGGER "PayrollManagementEvent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollManagementEvent" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_event_guard();
CREATE OR REPLACE FUNCTION baro_payroll_management_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PayrollManagementEvent" e WHERE e."orgId"=NEW."orgId" AND e."snapshotId"=NEW.id AND e.revision=NEW."managementRevision" AND e.excluded=NEW."payableManagementExcluded" AND e."snapshotRevision"=NEW.revision AND e."evidenceExcluded"=COALESCE(NEW."evidenceManagementExcluded",NEW."payableManagementExcluded")) THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_AUDIT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollSnapshot_management_consistency" ON "PayrollSnapshot";
CREATE CONSTRAINT TRIGGER "PayrollSnapshot_management_consistency" AFTER UPDATE ON "PayrollSnapshot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."managementRevision" IS DISTINCT FROM NEW."managementRevision") EXECUTE FUNCTION baro_payroll_management_consistency();
CREATE OR REPLACE FUNCTION baro_payroll_management_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE excluded boolean;
BEGIN
 IF NEW."payrollItemId" IS NULL THEN RETURN NEW; END IF;
 SELECT CASE WHEN TG_TABLE_NAME='PayrollPayableAllocation' THEN COALESCE(s."evidenceManagementExcluded",s."payableManagementExcluded") ELSE s."payableManagementExcluded" END INTO excluded FROM "PayrollSnapshot" s JOIN "PayrollPayableDocument" d ON d."snapshotId"=s.id AND d."orgId"=s."orgId" JOIN "PayrollPayableItem" i ON i."documentId"=d.id AND i."orgId"=d."orgId" WHERE i.id=NEW."payrollItemId" AND i."orgId"=NEW."orgId" FOR SHARE OF s;
 IF excluded THEN RAISE EXCEPTION 'PAYROLL_MONTH_MANAGEMENT_EXCLUDED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollAllocation_management_guard" ON "PayrollPayableAllocation";
CREATE TRIGGER "PayrollAllocation_management_guard" BEFORE INSERT ON "PayrollPayableAllocation" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_payment_guard();
DROP TRIGGER IF EXISTS "PayrollOpening_management_guard" ON "AccountingOpeningItem";
CREATE TRIGGER "PayrollOpening_management_guard" BEFORE INSERT ON "AccountingOpeningItem" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_payment_guard();
-- Rollback: stop new settings writes and keep policies, events, snapshots and all
-- documents. Do not collapse independent flags or rewrite earlier exclusions.
