CREATE TABLE IF NOT EXISTS "ExpenseUnit" (
 id SERIAL PRIMARY KEY,code TEXT NOT NULL UNIQUE,"nameKo" TEXT NOT NULL,"nameEn" TEXT NOT NULL,"nameVi" TEXT NOT NULL,
 "isActive" BOOLEAN NOT NULL DEFAULT true,"sortOrder" INTEGER NOT NULL DEFAULT 0
);
-- Seed once. Renaming/deactivating units must never recreate the old choices.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ExpenseUnit") THEN
 INSERT INTO "ExpenseUnit"(code,"nameKo","nameEn","nameVi","sortOrder") VALUES
 ('PCS','개','Piece','Cái',10),('M','미터','Meter','Mét',20),('M2','제곱미터','Square meter','Mét vuông',30),
 ('KG','킬로그램','Kilogram','Kilôgam',40),('HOUR','시간','Hour','Giờ',50),('TRIP','회','Trip','Chuyến',60),('JOB','건','Job','Việc',70);
 END IF;
END $$;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "unitId" INTEGER REFERENCES "ExpenseUnit"(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTransactionCost_id_orgId_key" ON "PartnerTransactionCost"(id,"orgId");
CREATE TABLE IF NOT EXISTS "ExpenseItemReference" (
 id SERIAL PRIMARY KEY,"costId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"workOrderId" INTEGER NOT NULL,"styleId" INTEGER,
 CONSTRAINT "ExpenseItemReference_cost_scope_fkey" FOREIGN KEY("costId","orgId") REFERENCES "PartnerTransactionCost"(id,"orgId") ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseItemReference_order_scope_fkey" FOREIGN KEY("workOrderId","orgId") REFERENCES "WorkOrder"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseItemReference_style_scope_fkey" FOREIGN KEY("styleId","orgId") REFERENCES "Style"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseItemReference_costId_workOrderId_styleId_key" ON "ExpenseItemReference"("costId","workOrderId","styleId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseItemReference_order_only_key" ON "ExpenseItemReference"("costId","workOrderId") WHERE "styleId" IS NULL;
CREATE INDEX IF NOT EXISTS "ExpenseItemReference_workOrderId_orgId_idx" ON "ExpenseItemReference"("workOrderId","orgId");
CREATE INDEX IF NOT EXISTS "ExpenseItemReference_styleId_orgId_idx" ON "ExpenseItemReference"("styleId","orgId");
CREATE OR REPLACE FUNCTION baro_expense_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD; scope_key TEXT; parent RECORD;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'expense reference identity immutable'; END IF;
 IF TG_OP='DELETE' THEN r:=OLD; ELSE r:=NEW; END IF;
 scope_key:=current_setting('baro.expense_editor_key',true);
 IF current_setting('baro.expense_editor_org',true) IS DISTINCT FROM r."orgId"::text
 OR (scope_key NOT LIKE 'EXPENSE_REQUEST_EDIT:'||r."orgId"||':%' AND scope_key NOT LIKE 'EXPENSE_REQUEST_CREATE:'||r."orgId"||':%') OR coalesce(scope_key,'')='' THEN
 RAISE EXCEPTION 'expense reference edit context required'; END IF;
 SELECT * INTO parent FROM "PartnerTransactionCost" WHERE id=r."costId" AND "orgId"=r."orgId" FOR UPDATE;
 IF FOUND THEN
 IF EXISTS(SELECT 1 FROM "WorkOrder" o WHERE o."orgId"=r."orgId" AND o."invoiceFinalLockedAt" IS NOT NULL
 AND (o.id=r."workOrderId" OR o.id=parent."workOrderId")) THEN RAISE EXCEPTION 'order finally locked'; END IF;
 IF EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=parent.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM "PartnerTransactionCost" c WHERE c.id=r."costId" AND c."orgId"=r."orgId" AND c."expenseRequestId" IS NOT NULL) THEN
 RAISE EXCEPTION 'expense request reference required'; END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_reference_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
 IF TG_OP='DELETE' THEN r:=OLD; ELSE r:=NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ExpenseRequestAudit" a WHERE a."orgId"=r."orgId" AND a."clientKey"=current_setting('baro.expense_editor_key',true)
 AND a."actorId"::text=current_setting('baro.expense_editor_actor',true)
 AND (coalesce(a."afterSnapshot"->'costs','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id',r."costId"))
 OR coalesce(a."beforeSnapshot"->'costs','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id',r."costId")))) THEN RAISE EXCEPTION 'expense reference audit required'; END IF;
 RETURN r;
END $$;
DROP TRIGGER IF EXISTS "ExpenseItemReference_guard" ON "ExpenseItemReference";
CREATE TRIGGER "ExpenseItemReference_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseItemReference" FOR EACH ROW EXECUTE FUNCTION baro_expense_reference_guard();
DROP TRIGGER IF EXISTS "ExpenseItemReference_audit_guard" ON "ExpenseItemReference";
CREATE CONSTRAINT TRIGGER "ExpenseItemReference_audit_guard" AFTER INSERT OR UPDATE OR DELETE ON "ExpenseItemReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_reference_audit_guard();
