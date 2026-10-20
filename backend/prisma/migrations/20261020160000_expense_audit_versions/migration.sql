-- Dedicated, append-only request history and explicit optimistic versions.
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "updatedByEmployeeId" INTEGER;
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_id_orgId_key" ON "ExpenseRequest"(id,"orgId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequest_updatedByEmployeeId_orgId_fkey') THEN
 ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_updatedByEmployeeId_orgId_fkey" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequest_version_check') THEN
 ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_version_check" CHECK(version>0); END IF;
END $$;
CREATE TABLE IF NOT EXISTS "ExpenseRequestAudit" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"requestId" INTEGER NOT NULL,"actorId" INTEGER,
 version INTEGER NOT NULL,action TEXT NOT NULL,"clientKey" TEXT NOT NULL,"inputHash" TEXT NOT NULL,
 "beforeSnapshot" JSONB NOT NULL,"afterSnapshot" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "legacyKey" TEXT,"legacyPayload" JSONB,
 CONSTRAINT "ExpenseRequestAudit_requestId_orgId_fkey" FOREIGN KEY("requestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "ExpenseRequestAudit_orgId_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ExpenseRequestAudit_actorId_orgId_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequestAudit_orgId_clientKey_key" ON "ExpenseRequestAudit"("orgId","clientKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequestAudit_requestId_version_key" ON "ExpenseRequestAudit"("requestId",version);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequestAudit_legacyKey_key" ON "ExpenseRequestAudit"("legacyKey");
CREATE INDEX IF NOT EXISTS "ExpenseRequestAudit_orgId_requestId_createdAt_idx" ON "ExpenseRequestAudit"("orgId","requestId","createdAt");
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "SystemSetting" s LEFT JOIN "ExpenseRequest" r ON r.id::text=s.value->>'requestId'
 LEFT JOIN "Employee" e ON e.id=s."updatedByEmployeeId" AND e."orgId"=r."orgId"
 WHERE s.key LIKE 'EXPENSE_REQUEST_EDIT:%' AND
 (r.id IS NULL OR split_part(s.key,':',2)<>r."orgId"::text OR jsonb_typeof(s.value->'before'->'costs') IS DISTINCT FROM 'array'
 OR jsonb_typeof(s.value->'after'->'costs') IS DISTINCT FROM 'array' OR s.value->'after'->'document'->>'id' IS DISTINCT FROM r.id::text
 OR coalesce(s.value->>'inputHash','')='' OR (s."updatedByEmployeeId" IS NOT NULL AND e.id IS NULL)))
 THEN RAISE EXCEPTION 'EXPENSE_LEGACY_AUDIT_REQUIRES_REVIEW'; END IF;
END $$;
INSERT INTO "ExpenseRequestAudit"(id,"orgId","requestId","actorId",version,action,"clientKey","inputHash","beforeSnapshot","afterSnapshot","createdAt","legacyKey","legacyPayload")
SELECT 'legacy:'||s.key,r."orgId",r.id,s."updatedByEmployeeId",
 (SELECT coalesce(max(a.version),0) FROM "ExpenseRequestAudit" a WHERE a."requestId"=r.id)::integer
 + row_number() OVER(PARTITION BY r.id ORDER BY s."createdAt",s.key)::integer,
 'IMPORT',s.key,s.value->>'inputHash',s.value->'before',s.value->'after',s."createdAt",s.key,to_jsonb(s)
FROM "SystemSetting" s JOIN "ExpenseRequest" r ON r.id::text=s.value->>'requestId'
WHERE s.key LIKE 'EXPENSE_REQUEST_EDIT:%' AND NOT EXISTS(SELECT 1 FROM "ExpenseRequestAudit" a WHERE a."legacyKey"=s.key);
-- Only imported, byte-for-byte preserved envelopes are removed from the settings table.
DELETE FROM "SystemSetting" s USING "ExpenseRequestAudit" a WHERE a."legacyKey"=s.key AND a."legacyPayload"=to_jsonb(s);
UPDATE "ExpenseRequest" r SET version=a.version,"updatedAt"=(a."legacyPayload"->>'updatedAt')::timestamp,"updatedByEmployeeId"=a."actorId"
FROM "ExpenseRequestAudit" a WHERE a."requestId"=r.id AND a.action='IMPORT'
 AND a.version=(SELECT max(x.version) FROM "ExpenseRequestAudit" x WHERE x."requestId"=r.id);
CREATE OR REPLACE FUNCTION baro_expense_editor_authorized(scope_org INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT current_setting('baro.expense_editor_org',true)=scope_org::text
 AND (current_setting('baro.expense_editor_key',true) LIKE 'EXPENSE_REQUEST_EDIT:'||scope_org::text||':%'
 OR current_setting('baro.expense_editor_key',true) LIKE 'EXPENSE_REQUEST_CREATE:'||scope_org::text||':%')
 AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=scope_org AND e.id::text=current_setting('baro.expense_editor_actor',true) AND e.status::text='ACTIVE');
$$;
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
    OR event."afterSnapshot"->'document'->>'title' IS DISTINCT FROM NEW.title
    OR event."afterSnapshot"->'document'->>'requestDate' IS DISTINCT FROM NEW."requestDate"
    OR event."afterSnapshot"->'document'->>'partnerOrgId' IS DISTINCT FROM NEW."partnerOrgId"::text
    OR event."afterSnapshot"->'document'->>'version' IS DISTINCT FROM NEW.version::text
    THEN RAISE EXCEPTION 'request audit mismatch'; END IF;
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
CREATE OR REPLACE FUNCTION baro_expense_request_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'request history cannot be deleted'; END IF;
 IF NOT coalesce(baro_expense_editor_authorized(NEW."orgId"),false) THEN RAISE EXCEPTION 'expense edit context required'; END IF;
 IF NEW."updatedByEmployeeId"::text IS DISTINCT FROM current_setting('baro.expense_editor_actor',true) OR NEW."updatedAt" IS NULL THEN RAISE EXCEPTION 'request editor metadata required'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW."orgId",NEW."createdAt",NEW."createdByEmployeeId",NEW."clientKey",NEW."submissionHash") IS DISTINCT FROM ROW(OLD.id,OLD."orgId",OLD."createdAt",OLD."createdByEmployeeId",OLD."clientKey",OLD."submissionHash") THEN RAISE EXCEPTION 'request identity immutable'; END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'request version must increment'; END IF;
 ELSIF NEW.version<>1 THEN RAISE EXCEPTION 'initial request version must be one'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_audit_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'expense audit is append only'; END IF;
 IF NEW.action NOT IN ('CREATE','UPDATE') OR NOT coalesce(baro_expense_editor_authorized(NEW."orgId"),false)
 OR NEW."actorId"::text IS DISTINCT FROM current_setting('baro.expense_editor_actor',true)
 OR NEW."clientKey" IS DISTINCT FROM current_setting('baro.expense_editor_key',true)
 OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId" AND r.version=NEW.version)
 THEN RAISE EXCEPTION 'invalid expense audit context'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseRequest_write_guard" ON "ExpenseRequest";
CREATE TRIGGER "ExpenseRequest_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_expense_request_write_guard();
DROP TRIGGER IF EXISTS "ExpenseRequest_audit_guard" ON "ExpenseRequest";
CREATE CONSTRAINT TRIGGER "ExpenseRequest_audit_guard" AFTER INSERT OR UPDATE ON "ExpenseRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_editor_audit_guard();
DROP TRIGGER IF EXISTS "ExpenseRequestAudit_append_only" ON "ExpenseRequestAudit";
CREATE TRIGGER "ExpenseRequestAudit_append_only" BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseRequestAudit" FOR EACH ROW EXECUTE FUNCTION baro_expense_audit_write_guard();

-- Fresh installations and upgrades receive the same business guards.
DROP TRIGGER IF EXISTS baro_transaction_cost_guard ON "PartnerTransactionCost";
CREATE TRIGGER baro_transaction_cost_guard BEFORE INSERT OR UPDATE OR DELETE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_transaction_cost_guard();
DROP TRIGGER IF EXISTS baro_request_production_guard ON "OutsourcedWorkRecord";
CREATE TRIGGER baro_request_production_guard BEFORE UPDATE OR DELETE ON "OutsourcedWorkRecord" FOR EACH ROW EXECUTE FUNCTION baro_request_production_guard();
