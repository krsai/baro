CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_id_orgId_key" ON "WorkOrder" (id, "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "Style_id_orgId_key" ON "Style" (id, "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_id_orgId_key" ON "Employee" (id, "orgId");
CREATE TABLE IF NOT EXISTS "PriorCompletionReason" (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  "nameKo" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameVi" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO "PriorCompletionReason" (code, "nameKo", "nameEn", "nameVi") VALUES
('BEFORE_RECORD_KEEPING', '관리 시작 전 작업 완료', 'Completed before record keeping began', 'Hoàn thành trước khi bắt đầu ghi nhận')
ON CONFLICT (code) DO NOTHING;
CREATE TABLE IF NOT EXISTS "PriorProductionCompletion" (
  id TEXT PRIMARY KEY, "orgId" INTEGER NOT NULL, "workOrderId" INTEGER NOT NULL,
  "styleId" INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0),
  "completedPeriod" TEXT NOT NULL CHECK ("completedPeriod" ~ '^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$')
    CHECK (CASE WHEN length("completedPeriod")=10 THEN "completedPeriod"::date::text="completedPeriod"
      ELSE ("completedPeriod" || '-01')::date IS NOT NULL END),
  "reasonId" INTEGER NOT NULL REFERENCES "PriorCompletionReason"(id) ON DELETE RESTRICT,
  "clientKey" TEXT NOT NULL, "createdByEmployeeId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "canceledAt" TIMESTAMP(3), "canceledByEmployeeId" INTEGER, "cancellationNote" TEXT,
  FOREIGN KEY ("workOrderId", "orgId") REFERENCES "WorkOrder"(id, "orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("styleId", "orgId") REFERENCES "Style"(id, "orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("createdByEmployeeId", "orgId") REFERENCES "Employee"(id, "orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("canceledByEmployeeId", "orgId") REFERENCES "Employee"(id, "orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (("canceledAt" IS NULL AND "canceledByEmployeeId" IS NULL) OR
    ("canceledAt" IS NOT NULL AND "canceledByEmployeeId" IS NOT NULL AND "cancellationNote" IS NOT NULL AND length(trim("cancellationNote")) > 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriorProductionCompletion_orgId_clientKey_key" ON "PriorProductionCompletion" ("orgId", "clientKey");
CREATE INDEX IF NOT EXISTS "PriorProductionCompletion_workOrderId_styleId_canceledAt_idx" ON "PriorProductionCompletion" ("workOrderId", "styleId", "canceledAt");
CREATE OR REPLACE FUNCTION baro_prior_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $prior_completion$
DECLARE locked_at TIMESTAMP;
BEGIN
  SELECT "invoiceFinalLockedAt" INTO locked_at FROM "WorkOrder" WHERE id=COALESCE(NEW."workOrderId", OLD."workOrderId") FOR UPDATE;
  IF locked_at IS NOT NULL THEN RAISE EXCEPTION 'order is finally locked'; END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'prior completion history cannot be deleted'; END IF;
  IF TG_OP='UPDATE' AND (OLD."canceledAt" IS NOT NULL OR
    (to_jsonb(NEW) - ARRAY['canceledAt','canceledByEmployeeId','cancellationNote']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['canceledAt','canceledByEmployeeId','cancellationNote'])) THEN
    RAISE EXCEPTION 'prior completion history is immutable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "WorkOrderItem" WHERE "workOrderId"=NEW."workOrderId" AND "styleId"=NEW."styleId") THEN
    RAISE EXCEPTION 'style is not part of order';
  END IF;
  RETURN NEW;
END $prior_completion$;
DROP TRIGGER IF EXISTS "PriorProductionCompletion_guard" ON "PriorProductionCompletion";
CREATE TRIGGER "PriorProductionCompletion_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PriorProductionCompletion"
FOR EACH ROW EXECUTE FUNCTION baro_prior_completion_guard();

CREATE OR REPLACE FUNCTION baro_prior_completion_item_guard() RETURNS trigger LANGUAGE plpgsql AS $prior_completion$
BEGIN
  IF EXISTS (SELECT 1 FROM "PriorProductionCompletion" WHERE "workOrderId"=OLD."workOrderId" AND "styleId"=OLD."styleId")
    AND NOT EXISTS (SELECT 1 FROM "WorkOrderItem" WHERE "workOrderId"=OLD."workOrderId" AND "styleId"=OLD."styleId") THEN
    RAISE EXCEPTION 'order style has prior completion history';
  END IF;
  RETURN NULL;
END $prior_completion$;
DROP TRIGGER IF EXISTS "WorkOrderItem_prior_completion_guard" ON "WorkOrderItem";
CREATE CONSTRAINT TRIGGER "WorkOrderItem_prior_completion_guard" AFTER DELETE OR UPDATE ON "WorkOrderItem"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_prior_completion_item_guard();
