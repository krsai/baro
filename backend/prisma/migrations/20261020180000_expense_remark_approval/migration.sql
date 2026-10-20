-- Use the code FK for live localized descriptions; preserve original text and titles.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ExpenseRequest' AND column_name='title') THEN
 ALTER TABLE "ExpenseRequest" RENAME COLUMN title TO "legacyTitle"; END IF;
END $$;
ALTER TABLE "ExpenseRequest" ALTER COLUMN "legacyTitle" DROP NOT NULL;
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS remark TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_remark_check" CHECK(length(remark)<=500 AND remark !~ E'[\r\n]');
CREATE TABLE IF NOT EXISTS "ExpenseRequestApprovalStep" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"requestId" INTEGER NOT NULL,position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 20),"employeeId" INTEGER NOT NULL,
 CONSTRAINT "ExpenseRequestApprovalStep_requestId_orgId_fkey" FOREIGN KEY("requestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseRequestApprovalStep_orgId_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ExpenseRequestApprovalStep_employeeId_orgId_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequestApprovalStep_position_check' AND conrelid='"ExpenseRequestApprovalStep"'::regclass) THEN
 ALTER TABLE "ExpenseRequestApprovalStep" ADD CONSTRAINT "ExpenseRequestApprovalStep_position_check" CHECK(position BETWEEN 1 AND 20); END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequestApprovalStep_requestId_position_key" ON "ExpenseRequestApprovalStep"("requestId",position);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequestApprovalStep_requestId_employeeId_key" ON "ExpenseRequestApprovalStep"("requestId","employeeId");
CREATE INDEX IF NOT EXISTS "ExpenseRequestApprovalStep_orgId_employeeId_idx" ON "ExpenseRequestApprovalStep"("orgId","employeeId");
CREATE OR REPLACE FUNCTION baro_expense_editor_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event RECORD; scope_org INTEGER; row_id TEXT; found_before BOOLEAN; found_after BOOLEAN;
BEGIN
 scope_org:=CASE WHEN TG_OP='DELETE' THEN OLD."orgId" ELSE NEW."orgId" END;
 IF NOT coalesce(baro_expense_editor_authorized(scope_org),false) THEN
  -- Unwrapped historical cost clients are outside the request document lifecycle.
  IF TG_TABLE_NAME='PartnerTransactionCost' AND TG_OP='INSERT' AND NEW."expenseRequestId" IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'expense edit context required';
 END IF;
 SELECT * INTO event FROM "ExpenseRequestAudit" WHERE "orgId"=scope_org AND "clientKey"=current_setting('baro.expense_editor_key',true)
 AND "actorId"::text=current_setting('baro.expense_editor_actor',true);
 IF NOT FOUND THEN RAISE EXCEPTION 'expense edit audit required'; END IF;
 row_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
 IF TG_TABLE_NAME='ExpenseRequest' THEN
   IF event."requestId"<>NEW.id OR event.version<>NEW.version
    OR event."afterSnapshot"->'document'->>'remark' IS DISTINCT FROM NEW.remark
    OR event."afterSnapshot"->'document'->>'requestDate' IS DISTINCT FROM NEW."requestDate"
    OR event."afterSnapshot"->'document'->>'partnerOrgId' IS DISTINCT FROM NEW."partnerOrgId"::text
    OR event."afterSnapshot"->'document'->>'version' IS DISTINCT FROM NEW.version::text
    THEN RAISE EXCEPTION 'request audit mismatch'; END IF;
 ELSIF TG_TABLE_NAME='ExpenseRequestApprovalStep' THEN
   IF event."requestId" IS DISTINCT FROM (CASE WHEN TG_OP='DELETE' THEN OLD."requestId" ELSE NEW."requestId" END) THEN RAISE EXCEPTION 'approval request mismatch'; END IF;
   IF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(event."beforeSnapshot"->'document'->'approvalSteps','[]'::jsonb)) r WHERE r->>'id'=OLD.id) THEN RAISE EXCEPTION 'approval audit mismatch'; END IF;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(event."afterSnapshot"->'document'->'approvalSteps') r WHERE r->>'id'=NEW.id AND r->>'employeeId'=NEW."employeeId"::text AND r->>'position'=NEW.position::text)
     THEN RAISE EXCEPTION 'approval audit mismatch'; END IF;
   END IF;
 ELSIF TG_TABLE_NAME='PartnerTransactionCost' THEN
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(event."beforeSnapshot"->'costs') r WHERE r->>'id'=row_id AND r->>'orgId'=scope_org::text) INTO found_before;
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(event."afterSnapshot"->'costs') r WHERE r->>'id'=row_id AND r->>'orgId'=scope_org::text) INTO found_after;
   IF (TG_OP<>'INSERT' AND NOT found_before) OR (TG_OP='INSERT' AND NOT found_after)
    OR (TG_OP='UPDATE' AND NOT found_after AND EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE id::text=row_id)) THEN RAISE EXCEPTION 'expense edit audit mismatch'; END IF;
 ELSE
   IF event."beforeSnapshot"->'record'->>'id' IS DISTINCT FROM row_id AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(event."beforeSnapshot"->'costs') r WHERE r->'outsourcedWorkRecord'->>'id'=row_id)
    THEN RAISE EXCEPTION 'production edit audit mismatch'; END IF;
   IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "OutsourcedWorkRecord" r ON r.id=c."outsourcedWorkRecordId"
    WHERE r.id=NEW.id AND (c.quantity IS DISTINCT FROM r.quantity::numeric OR c."unitPrice" IS DISTINCT FROM r."outsourceUnitPrice" OR c."partnerOrgId"<>r."outsourcingPartnerId")) THEN RAISE EXCEPTION 'production does not match request'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION baro_expense_approval_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_org INTEGER;
BEGIN
 scope_org:=CASE WHEN TG_OP='DELETE' THEN OLD."orgId" ELSE NEW."orgId" END;
 IF NOT coalesce(baro_expense_editor_authorized(scope_org),false) THEN RAISE EXCEPTION 'expense edit context required'; END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'approval steps must be replaced with audited version'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "ExpenseRequestApprovalStep_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseRequestApprovalStep" FOR EACH ROW EXECUTE FUNCTION baro_expense_approval_write_guard();
CREATE CONSTRAINT TRIGGER "ExpenseRequestApprovalStep_audit_guard" AFTER INSERT OR DELETE ON "ExpenseRequestApprovalStep" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_editor_audit_guard();
