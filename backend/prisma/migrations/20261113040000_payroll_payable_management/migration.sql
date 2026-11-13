-- Management metadata is separate from frozen wages and financial revision.
ALTER TABLE "PayrollSnapshot" ADD COLUMN IF NOT EXISTS "payableManagementExcluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PayrollSnapshot" ADD COLUMN IF NOT EXISTS "managementRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "PayrollManagementEvent" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"snapshotId" INTEGER NOT NULL,revision INTEGER NOT NULL,"snapshotRevision" INTEGER NOT NULL,excluded BOOLEAN NOT NULL,"actorId" INTEGER NOT NULL,"clientKey" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PayrollManagementEvent_snapshot_fkey" FOREIGN KEY("snapshotId","orgId") REFERENCES "PayrollSnapshot"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "PayrollManagementEvent_actor_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "PayrollManagementEvent_values_check" CHECK(revision>0 AND "snapshotRevision">=0 AND length("clientKey") BETWEEN 8 AND 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollManagementEvent_orgId_clientKey_key" ON "PayrollManagementEvent"("orgId","clientKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollManagementEvent_snapshotId_revision_key" ON "PayrollManagementEvent"("snapshotId",revision);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollManagementEvent_values_check' AND conrelid='"PayrollManagementEvent"'::regclass) THEN
  ALTER TABLE "PayrollManagementEvent" ADD CONSTRAINT "PayrollManagementEvent_values_check" CHECK(revision>0 AND "snapshotRevision">=0 AND length("clientKey") BETWEEN 8 AND 100);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_payroll_management_actor(company_id integer,actor_id integer) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" LEFT JOIN "SystemSetting" p ON p.key='ROLE_ACCESS_POLICY'
 WHERE e.id=actor_id AND e."orgId"=company_id AND e.status::text='ACTIVE' AND e."orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR') AND o.type::text IN ('MANUFACTURER','SERVICE')
 AND CASE WHEN jsonb_typeof(p.value->(o.type::text)->(e."orgRole"::text))='array' THEN (p.value->(o.type::text)->(e."orgRole"::text)) ? 'PAYROLL' ELSE true END);
$$;
CREATE OR REPLACE FUNCTION baro_payroll_management_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."payableManagementExcluded" OR NEW."managementRevision"<>0 THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_CHANGED'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."payableManagementExcluded" IS NOT DISTINCT FROM OLD."payableManagementExcluded" AND NEW."managementRevision"=OLD."managementRevision" THEN RETURN NEW; END IF;
 IF NEW."payableManagementExcluded"=OLD."payableManagementExcluded" OR NEW."managementRevision"<>OLD."managementRevision"+1 OR (to_jsonb(NEW)-'payableManagementExcluded'-'managementRevision') IS DISTINCT FROM (to_jsonb(OLD)-'payableManagementExcluded'-'managementRevision') THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_CHANGED'; END IF;
 IF NOT baro_payroll_management_actor(NEW."orgId",nullif(current_setting('baro.payroll_management_actor',true),'')::integer) THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_ACCESS_DENIED'; END IF;
 IF NEW."payableManagementExcluded" AND EXISTS(SELECT 1 FROM "PayrollPayableDocument" d JOIN "PayrollPayableItem" i ON i."documentId"=d.id AND i."orgId"=d."orgId" JOIN "PayrollPayableAllocation" a ON a."payrollItemId"=i.id AND a."orgId"=i."orgId" JOIN "BankLedgerEntry" e ON e.id=a."entryId" AND e."orgId"=a."orgId" WHERE d."snapshotId"=NEW.id AND d."orgId"=NEW."orgId" AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_PAYMENT_LINKED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollSnapshot_management_guard" ON "PayrollSnapshot";
CREATE TRIGGER "PayrollSnapshot_management_guard" BEFORE INSERT OR UPDATE ON "PayrollSnapshot" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_guard();
CREATE OR REPLACE FUNCTION baro_payroll_management_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
 IF NEW."actorId"::text IS DISTINCT FROM current_setting('baro.payroll_management_actor',true) OR NOT baro_payroll_management_actor(NEW."orgId",NEW."actorId") OR NOT EXISTS(SELECT 1 FROM "PayrollSnapshot" s WHERE s.id=NEW."snapshotId" AND s."orgId"=NEW."orgId" AND s."managementRevision"=NEW.revision AND s.revision=NEW."snapshotRevision" AND s."payableManagementExcluded"=NEW.excluded) THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_CHANGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollManagementEvent_guard" ON "PayrollManagementEvent";
CREATE TRIGGER "PayrollManagementEvent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollManagementEvent" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_event_guard();
CREATE OR REPLACE FUNCTION baro_payroll_management_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PayrollManagementEvent" e WHERE e."orgId"=NEW."orgId" AND e."snapshotId"=NEW.id AND e.revision=NEW."managementRevision" AND e.excluded=NEW."payableManagementExcluded" AND e."snapshotRevision"=NEW.revision) THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_AUDIT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollSnapshot_management_consistency" ON "PayrollSnapshot";
CREATE CONSTRAINT TRIGGER "PayrollSnapshot_management_consistency" AFTER UPDATE ON "PayrollSnapshot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."managementRevision" IS DISTINCT FROM NEW."managementRevision") EXECUTE FUNCTION baro_payroll_management_consistency();
CREATE OR REPLACE FUNCTION baro_payroll_management_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE excluded boolean;
BEGIN
 IF NEW."payrollItemId" IS NULL THEN RETURN NEW; END IF;
 SELECT s."payableManagementExcluded" INTO excluded FROM "PayrollSnapshot" s JOIN "PayrollPayableDocument" d ON d."snapshotId"=s.id AND d."orgId"=s."orgId" JOIN "PayrollPayableItem" i ON i."documentId"=d.id AND i."orgId"=d."orgId" WHERE i.id=NEW."payrollItemId" AND i."orgId"=NEW."orgId" FOR SHARE OF s;
 IF excluded THEN RAISE EXCEPTION 'PAYROLL_MONTH_MANAGEMENT_EXCLUDED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollAllocation_management_guard" ON "PayrollPayableAllocation";
CREATE TRIGGER "PayrollAllocation_management_guard" BEFORE INSERT ON "PayrollPayableAllocation" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_payment_guard();
DROP TRIGGER IF EXISTS "PayrollOpening_management_guard" ON "AccountingOpeningItem";
CREATE TRIGGER "PayrollOpening_management_guard" BEFORE INSERT ON "AccountingOpeningItem" FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_payment_guard();
-- Compatible rollback: disable this toggle and keep metadata, events and wages;
-- restore management explicitly before reverting eligibility filters.
