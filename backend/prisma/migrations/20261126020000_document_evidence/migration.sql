-- Nullable headers retain historical row evidence without rewriting originals.
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "evidenceFiles" JSONB;
CREATE TABLE IF NOT EXISTS "BankLedgerDocument" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"changeRequestId" TEXT NOT NULL DEFAULT '',
 "managementNumber" TEXT NOT NULL,"transactionDate" TEXT NOT NULL,remark TEXT NOT NULL,"evidenceFiles" JSONB NOT NULL,
 "createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LedgerDocument_scope_key" UNIQUE(id,"orgId"),CONSTRAINT "LedgerDocument_number_key" UNIQUE("orgId","managementNumber")
);
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "documentId" TEXT;
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "documentPosition" INTEGER;
DROP INDEX IF EXISTS "Ledger_document_position_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Ledger_document_position_key" ON "BankLedgerEntry"("documentId","documentPosition") WHERE "voidedAt" IS NULL;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Ledger_document_position_check') THEN
 ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_document_position_check" CHECK(
 "documentId" IS NULL AND "documentPosition" IS NULL OR "documentId" IS NOT NULL AND
 ("documentPosition" IS NOT NULL AND "documentPosition" BETWEEN 0 AND 49 OR "documentPosition" IS NULL AND "internalTransferSourceId" IS NOT NULL));
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Ledger_document_scope_fkey') THEN
 ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_document_scope_fkey" FOREIGN KEY("documentId","orgId") REFERENCES "BankLedgerDocument"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
END IF; END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='LedgerDocument_org_fkey') THEN
 ALTER TABLE "BankLedgerDocument" ADD CONSTRAINT "LedgerDocument_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='LedgerDocument_approval_fkey') THEN
 ALTER TABLE "BankLedgerDocument" ADD CONSTRAINT "LedgerDocument_approval_fkey" FOREIGN KEY("changeRequestId","orgId") REFERENCES "ChangeApprovalRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_document_evidence_shape(value JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN value IS NULL THEN true
 WHEN jsonb_typeof(value)<>'array' THEN false
 WHEN jsonb_array_length(value)>50 THEN false
 ELSE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(value) item
  WHERE jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'path') IS DISTINCT FROM 'string'
  OR length(item->>'path') NOT BETWEEN 1 AND 500
  OR jsonb_typeof(item->'reference') IS DISTINCT FROM 'string'
  OR length(item->>'reference')>500) END
$$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequest_document_evidence_check') THEN
 ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_document_evidence_check" CHECK(baro_document_evidence_shape("evidenceFiles"));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='LedgerDocument_evidence_check') THEN
 ALTER TABLE "BankLedgerDocument" ADD CONSTRAINT "LedgerDocument_evidence_check" CHECK(baro_document_evidence_shape("evidenceFiles"));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION baro_ledger_document_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE yr integer; seq integer;
BEGIN
 NEW."changeRequestId"=current_setting('baro.change_request_id',true);
 IF NEW."transactionDate" !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'LEDGER_NUMBER_INVALID_DATE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r
 WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=NEW."orgId"
 AND r.menu='BANK_LEDGER' AND r.operation IN('CREATE','UPDATE') AND r.status='APPROVED'
 AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true)
 AND r.payload->>'documentVersion'='1' AND r.payload->'evidenceFiles'=NEW."evidenceFiles"
 AND r.payload->'rows'->0->>'transactionDate'=NEW."transactionDate") THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 yr=left(NEW."transactionDate",4)::integer;
 INSERT INTO "BankLedgerNumberCounter"("orgId",year,"lastNumber") VALUES(NEW."orgId",yr,1)
 ON CONFLICT("orgId",year) DO UPDATE SET "lastNumber"="BankLedgerNumberCounter"."lastNumber"+1 RETURNING "lastNumber" INTO seq;
 NEW."managementNumber"='BNK-'||yr||'-'||lpad(seq::text,greatest(6,length(seq::text)),'0');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "LedgerDocument_insert_guard" ON "BankLedgerDocument";
CREATE TRIGGER "LedgerDocument_insert_guard" BEFORE INSERT ON "BankLedgerDocument" FOR EACH ROW EXECUTE FUNCTION baro_ledger_document_insert();
DROP TRIGGER IF EXISTS "LedgerDocument_immutable" ON "BankLedgerDocument";
CREATE TRIGGER "LedgerDocument_immutable" BEFORE UPDATE OR DELETE ON "BankLedgerDocument" FOR EACH ROW EXECUTE FUNCTION baro_ledger_number_immutable();
CREATE OR REPLACE FUNCTION baro_ledger_document_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; actual integer;
BEGIN
 SELECT count(*) INTO expected FROM "ChangeApprovalRequest" r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'rows') p
 WHERE r.id=NEW."changeRequestId" AND r."orgId"=NEW."orgId" AND p->>'entryKind'='BANK';
 SELECT count(*) INTO actual FROM "BankLedgerEntry" WHERE "documentId"=NEW.id AND "orgId"=NEW."orgId" AND "documentPosition" IS NOT NULL;
 IF actual<>expected OR actual=0 OR NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" WHERE "documentId"=NEW.id AND "orgId"=NEW."orgId" AND "documentPosition"=0) THEN RAISE EXCEPTION 'LEDGER_DOCUMENT_INCOMPLETE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "LedgerDocument_complete_guard" ON "BankLedgerDocument";
CREATE CONSTRAINT TRIGGER "LedgerDocument_complete_guard" AFTER INSERT ON "BankLedgerDocument" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_ledger_document_complete();
CREATE OR REPLACE FUNCTION baro_ledger_number_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."documentId" IS NULL THEN PERFORM baro_assign_ledger_number(NEW.id,NEW."orgId",NEW."transactionDate",'AUTO',NULL); END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_ledger_document_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW."documentId" IS DISTINCT FROM OLD."documentId" OR NEW."documentPosition" IS DISTINCT FROM OLD."documentPosition") THEN RAISE EXCEPTION 'LEDGER_MANAGEMENT_NUMBER_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' AND NEW."documentId" IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM "BankLedgerDocument" d JOIN "ChangeApprovalRequest" r ON r.id=current_setting('baro.change_request_id',true)
 WHERE d.id=NEW."documentId" AND d."orgId"=NEW."orgId" AND d."transactionDate"=NEW."transactionDate"
 AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.operation IN('CREATE','UPDATE') AND r.status='APPROVED'
 AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true)
 AND r.id=d."changeRequestId" AND r.payload->>'documentVersion'='1' AND r.payload->'evidenceFiles'=d."evidenceFiles")
 AND NOT (baro_paid_expense_authorized(NEW."orgId",NEW.id) AND EXISTS(
 SELECT 1 FROM "PaidExpenseCorrection" p JOIN "BankLedgerEntry" old_entry ON old_entry.id=p."originalEntryId" AND old_entry."orgId"=p."orgId"
 WHERE p."replacementEntryId"=NEW.id AND p."orgId"=NEW."orgId" AND old_entry."documentId"=NEW."documentId" AND old_entry."documentPosition"=NEW."documentPosition"))
 THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Ledger_document_entry_guard" ON "BankLedgerEntry";
CREATE TRIGGER "Ledger_document_entry_guard" BEFORE INSERT OR UPDATE ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_document_entry_guard();
-- Keep the existing transfer/fee/paid correction checks; extend void approval only
-- to rows linked by the actual company-scoped document FK.
DO $$ DECLARE definition text; addition text; BEGIN
 SELECT pg_get_functiondef('baro_ledger_change_guard()'::regprocedure) INTO definition;
 IF position('document_authorized' in definition)=0 THEN
 addition='EXISTS(SELECT 1 FROM "BankLedgerEntry" document_authorized WHERE document_authorized."orgId"=OLD."orgId" AND OLD."documentId" IS NOT NULL AND document_authorized."documentId"=OLD."documentId" AND (baro_change_authorized(OLD."orgId",''BANK_LEDGER'',''UPDATE'',document_authorized.id) OR baro_change_authorized(OLD."orgId",''BANK_LEDGER'',''DELETE'',document_authorized.id))) OR ';
 IF position('baro_paid_expense_authorized(OLD."orgId",OLD.id)' in definition)=0 THEN RAISE EXCEPTION 'LEDGER_DOCUMENT_GUARD_BASE_MISMATCH'; END IF;
 EXECUTE replace(definition,'baro_paid_expense_authorized(OLD."orgId",OLD.id)',addition||'baro_paid_expense_authorized(OLD."orgId",OLD.id)');
 END IF;
END $$;
