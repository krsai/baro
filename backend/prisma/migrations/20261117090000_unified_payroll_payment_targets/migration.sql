-- Preserve legacy values and events; either exclusion excludes payment use. New changes set both flags.
CREATE OR REPLACE FUNCTION baro_payroll_management_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE excluded boolean;
BEGIN
 IF NEW."payrollItemId" IS NULL THEN RETURN NEW; END IF;
 SELECT (s."payableManagementExcluded" OR COALESCE(s."evidenceManagementExcluded",false)) INTO excluded FROM "PayrollSnapshot" s JOIN "PayrollPayableDocument" d ON d."snapshotId"=s.id AND d."orgId"=s."orgId" JOIN "PayrollPayableItem" i ON i."documentId"=d.id AND i."orgId"=d."orgId" WHERE i.id=NEW."payrollItemId" AND i."orgId"=NEW."orgId" FOR SHARE OF s;
 IF excluded THEN RAISE EXCEPTION 'PAYROLL_MONTH_MANAGEMENT_EXCLUDED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_payroll_unified_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."payableManagementExcluded" IS DISTINCT FROM OLD."payableManagementExcluded" OR NEW."evidenceManagementExcluded" IS DISTINCT FROM OLD."evidenceManagementExcluded" THEN
  IF NEW."evidenceManagementExcluded" IS DISTINCT FROM NEW."payableManagementExcluded" THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollSnapshot_unified_target_guard" ON "PayrollSnapshot";
CREATE TRIGGER "PayrollSnapshot_unified_target_guard" BEFORE UPDATE ON "PayrollSnapshot" FOR EACH ROW EXECUTE FUNCTION baro_payroll_unified_target_guard();
