-- Existing documents have no assumed payment schedule.
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "scheduledPaymentDate" TEXT;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_scheduled_payment_date_check"
 CHECK ("scheduledPaymentDate" IS NULL OR CASE
 WHEN "scheduledPaymentDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "scheduledPaymentDate">='0001-01-01'
 THEN to_char("scheduledPaymentDate"::date,'YYYY-MM-DD')="scheduledPaymentDate" ELSE false END);
CREATE INDEX "ExpenseRequest_orgId_scheduledPaymentDate_idx" ON "ExpenseRequest"("orgId","scheduledPaymentDate") WHERE "deletedAt" IS NULL;

CREATE FUNCTION baro_expense_schedule_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."scheduledPaymentDate" IS NOT DISTINCT FROM OLD."scheduledPaymentDate" THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW."scheduledPaymentDate" IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM "ExpenseRequestAudit" a WHERE a."requestId"=NEW.id AND a."orgId"=NEW."orgId" AND a.version=NEW.version
  AND a."afterSnapshot"->'document'->>'scheduledPaymentDate' IS NOT DISTINCT FROM NEW."scheduledPaymentDate")
 THEN RAISE EXCEPTION 'EXPENSE_SCHEDULE_AUDIT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "ExpenseRequest_schedule_audit_guard" AFTER INSERT OR UPDATE ON "ExpenseRequest"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_schedule_audit();
