-- Additive only: existing requests and ledger allocations remain unscheduled.
CREATE TABLE "ExpensePaymentSchedule" (
 id TEXT PRIMARY KEY, "orgId" INTEGER NOT NULL, "requestId" INTEGER NOT NULL,
 "expenseItemId" TEXT NOT NULL,
 position INTEGER NOT NULL CHECK(position>0), label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 100),
 "scheduledDate" TEXT NOT NULL CHECK("scheduledDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "scheduledDate">='0001-01-01' AND to_char("scheduledDate"::date,'YYYY-MM-DD')="scheduledDate"),
 currency TEXT NOT NULL CHECK(currency IN ('VND','USD','KRW')),
 amount DECIMAL(24,4) NOT NULL CHECK(amount>0 AND amount=round(amount,CASE WHEN currency='USD' THEN 2 ELSE 0 END)),
 active BOOLEAN NOT NULL DEFAULT true,
 CONSTRAINT "ExpensePaymentSchedule_id_orgId_key" UNIQUE(id,"orgId"),
 CONSTRAINT "ExpensePaymentSchedule_expenseItemId_orgId_fkey" FOREIGN KEY("expenseItemId","orgId") REFERENCES "PartnerTransactionCost"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpensePaymentSchedule_requestId_orgId_fkey" FOREIGN KEY("requestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "ExpensePaymentSchedule_orgId_requestId_active_idx" ON "ExpensePaymentSchedule"("orgId","requestId",active);
ALTER TABLE "BankLedgerEvidenceAllocation" ADD COLUMN "paymentScheduleId" TEXT;
ALTER TABLE "BankLedgerEvidenceAllocation" ADD CONSTRAINT "BankLedgerEvidenceAllocation_paymentScheduleId_orgId_fkey"
 FOREIGN KEY("paymentScheduleId","orgId") REFERENCES "ExpensePaymentSchedule"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "BankLedgerEvidenceAllocation_paymentScheduleId_idx" ON "BankLedgerEvidenceAllocation"("paymentScheduleId");

CREATE FUNCTION baro_expense_payment_schedule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_schedule "ExpensePaymentSchedule"%ROWTYPE; paid NUMERIC;
BEGIN
 IF TG_TABLE_NAME='BankLedgerEvidenceAllocation' THEN
  IF NEW."paymentScheduleId" IS NULL AND EXISTS(SELECT 1 FROM "ExpensePaymentSchedule" s WHERE s."orgId"=NEW."orgId" AND s."expenseItemId"=NEW."expenseItemId" AND s.active)
  THEN RAISE EXCEPTION 'INVALID_EXPENSE_PAYMENT_SCHEDULE'; END IF;
  IF NEW."paymentScheduleId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "ExpensePaymentSchedule" s JOIN "PartnerTransactionCost" c ON c.id=NEW."expenseItemId" AND c.id=s."expenseItemId" AND c."orgId"=s."orgId" AND c."expenseRequestId"=s."requestId" AND c.currency=s.currency
   WHERE s.id=NEW."paymentScheduleId" AND s."orgId"=NEW."orgId" AND s.active)
  THEN RAISE EXCEPTION 'INVALID_EXPENSE_PAYMENT_SCHEDULE'; END IF;
  IF NEW."paymentScheduleId" IS NOT NULL THEN
   SELECT * INTO selected_schedule FROM "ExpensePaymentSchedule" WHERE id=NEW."paymentScheduleId" AND "orgId"=NEW."orgId" FOR UPDATE;
   SELECT COALESCE(sum(a.amount),0) INTO paid FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" AND e."voidedAt" IS NULL
    WHERE a."orgId"=NEW."orgId" AND a."paymentScheduleId"=NEW."paymentScheduleId" AND a.id<>NEW.id;
   IF paid+NEW.amount>selected_schedule.amount THEN RAISE EXCEPTION 'LEDGER_EXCEEDS_DOCUMENT'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'EXPENSE_PAYMENT_SCHEDULE_PRESERVE_HISTORY'; END IF;
 IF TG_OP='UPDATE' AND (NEW."orgId",NEW."requestId",NEW."expenseItemId") IS DISTINCT FROM (OLD."orgId",OLD."requestId",OLD."expenseItemId")
 THEN RAISE EXCEPTION 'INVALID_EXPENSE_PAYMENT_SCHEDULE'; END IF;
 IF TG_OP='UPDATE' AND NOT NEW.active AND EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" AND e."voidedAt" IS NULL WHERE a."paymentScheduleId"=OLD.id)
 THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;
 IF TG_OP='UPDATE' AND (NEW.label,NEW."scheduledDate",NEW.currency,NEW.amount,NEW."orgId",NEW."requestId",NEW."expenseItemId") IS DISTINCT FROM (OLD.label,OLD."scheduledDate",OLD.currency,OLD.amount,OLD."orgId",OLD."requestId",OLD."expenseItemId")
  AND EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a WHERE a."paymentScheduleId"=OLD.id)
 THEN RAISE EXCEPTION 'EXPENSE_PAYMENT_SCHEDULE_REFERENCED'; END IF;
 IF current_setting('baro.expense_editor_org',true) IS DISTINCT FROM NEW."orgId"::text THEN RAISE EXCEPTION 'EXPENSE_PAYMENT_SCHEDULE_EDITOR_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ExpensePaymentSchedule_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ExpensePaymentSchedule" FOR EACH ROW EXECUTE FUNCTION baro_expense_payment_schedule_guard();
CREATE TRIGGER "BankLedgerEvidenceAllocation_schedule_guard" BEFORE INSERT OR UPDATE ON "BankLedgerEvidenceAllocation" FOR EACH ROW EXECUTE FUNCTION baro_expense_payment_schedule_guard();

CREATE FUNCTION baro_expense_payment_schedule_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestAudit" a ON a."requestId"=r.id AND a."orgId"=r."orgId" AND a.version=r.version
  WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId"
   AND jsonb_array_length(COALESCE(a."afterSnapshot"->'document'->'paymentSchedule','[]'::jsonb))=(SELECT count(*) FROM "ExpensePaymentSchedule" s WHERE s."requestId"=r.id AND s."orgId"=r."orgId" AND s.active)
   AND NOT EXISTS(SELECT 1 FROM "ExpensePaymentSchedule" p WHERE p."requestId"=r.id AND p."orgId"=r."orgId" AND p.active AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(COALESCE(a."afterSnapshot"->'document'->'paymentSchedule','[]'::jsonb)) s
    WHERE s->>'id'=p.id AND s->>'expenseItemId'=p."expenseItemId" AND s->>'label'=p.label AND s->>'scheduledDate'=p."scheduledDate" AND s->>'currency'=p.currency AND (s->>'amount')::numeric=p.amount AND (s->>'position')::integer=p.position))
 ) THEN RAISE EXCEPTION 'EXPENSE_PAYMENT_SCHEDULE_AUDIT_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM "ExpensePaymentSchedule" s LEFT JOIN "PartnerTransactionCost" c ON c.id=s."expenseItemId" AND c."orgId"=s."orgId" AND c."expenseRequestId"=s."requestId" AND c.currency=s.currency
  WHERE s."orgId"=NEW."orgId" AND s."requestId"=NEW."requestId" AND s.active GROUP BY s."expenseItemId",c.id,c.amount
  HAVING c.id IS NULL OR count(*)<2 OR count(DISTINCT s.position)<>count(*) OR sum(s.amount)<>c.amount)
 THEN RAISE EXCEPTION 'EXPENSE_PAYMENT_SCHEDULE_TOTAL_MISMATCH'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "ExpensePaymentSchedule_audit_guard" AFTER INSERT OR UPDATE ON "ExpensePaymentSchedule" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_payment_schedule_audit();
