-- Existing expense references remain EXP-{id}; no issued document or audit is rewritten.
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "managementNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_orgId_managementNumber_key" ON "ExpenseRequest"("orgId","managementNumber");
CREATE OR REPLACE FUNCTION baro_expense_number_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' AND (NEW."managementNumber" IS NULL OR length(trim(NEW."managementNumber")) NOT BETWEEN 1 AND 200 OR NEW."managementNumber" ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'INVALID_DOCUMENT_NUMBER'; END IF;
 IF TG_OP='UPDATE' AND NEW."managementNumber" IS DISTINCT FROM OLD."managementNumber" THEN RAISE EXCEPTION 'DOCUMENT_NUMBER_LOCKED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseRequest_number_guard" ON "ExpenseRequest";
CREATE TRIGGER "ExpenseRequest_number_guard" BEFORE INSERT OR UPDATE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_expense_number_guard();
