-- Additive rollout. Existing external paths, approvals and snapshots are untouched.
CREATE TABLE IF NOT EXISTS "EvidenceAttachment" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"createdByEmployeeId" INTEGER NOT NULL,purpose TEXT NOT NULL,
 "originalFileName" TEXT NOT NULL,"contentType" TEXT NOT NULL,"byteSize" INTEGER NOT NULL,sha256 TEXT NOT NULL,
 "storageRoot" TEXT NOT NULL,"storageKey" TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"readyAt" TIMESTAMP(3),
 CONSTRAINT "EvidenceAttachment_scope_key" UNIQUE(id,"orgId"),
 CONSTRAINT "EvidenceAttachment_storage_key" UNIQUE("storageRoot","storageKey"),
 CONSTRAINT "EvidenceAttachment_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "EvidenceAttachment_actor_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE IF NOT EXISTS "EvidenceAttachmentLink" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"attachmentId" TEXT NOT NULL,"expenseRequestId" INTEGER,"ledgerDocumentId" TEXT,"changeRequestId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EvidenceLink_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "EvidenceLink_attachment_fkey" FOREIGN KEY("attachmentId","orgId") REFERENCES "EvidenceAttachment"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "EvidenceLink_expense_fkey" FOREIGN KEY("expenseRequestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "EvidenceLink_ledger_fkey" FOREIGN KEY("ledgerDocumentId","orgId") REFERENCES "BankLedgerDocument"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "EvidenceLink_change_fkey" FOREIGN KEY("changeRequestId","orgId") REFERENCES "ChangeApprovalRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "EvidenceAttachmentLink_attachmentId_orgId_idx" ON "EvidenceAttachmentLink"("attachmentId","orgId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='EvidenceAttachment_values_check') THEN
 ALTER TABLE "EvidenceAttachment" ADD CONSTRAINT "EvidenceAttachment_values_check" CHECK(
 purpose IN('EXPENSE','BANK_LEDGER') AND status IN('PENDING','READY') AND "byteSize" BETWEEN 1 AND 5242880
 AND sha256 ~ '^[a-f0-9]{64}$' AND length("originalFileName") BETWEEN 1 AND 180
 AND (status='READY')=("readyAt" IS NOT NULL)); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='EvidenceLink_source_check') THEN
 ALTER TABLE "EvidenceAttachmentLink" ADD CONSTRAINT "EvidenceLink_source_check" CHECK(
 (CASE WHEN "expenseRequestId" IS NULL THEN 0 ELSE 1 END + CASE WHEN "ledgerDocumentId" IS NULL THEN 0 ELSE 1 END + CASE WHEN "changeRequestId" IS NULL THEN 0 ELSE 1 END)=1); END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_evidence_attachment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'EVIDENCE_ATTACHMENT_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status='READY' OR (to_jsonb(NEW)-'status'-'readyAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'readyAt')
   OR NEW.status<>'READY' OR NEW."readyAt" IS NULL THEN RAISE EXCEPTION 'EVIDENCE_ATTACHMENT_IMMUTABLE'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE') THEN RAISE EXCEPTION 'ACTIVE_EMPLOYEE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "EvidenceAttachment_guard" ON "EvidenceAttachment";
CREATE TRIGGER "EvidenceAttachment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "EvidenceAttachment" FOR EACH ROW EXECUTE FUNCTION baro_evidence_attachment_guard();
CREATE OR REPLACE FUNCTION baro_evidence_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE files JSONB; item JSONB; aid TEXT; a "EvidenceAttachment"; kind TEXT; linkid TEXT;
BEGIN
 IF TG_TABLE_NAME='ChangeApprovalRequest' THEN kind=NEW.menu; files=NEW.payload->'evidenceFiles';
 ELSE
  kind=CASE TG_TABLE_NAME WHEN 'ExpenseRequest' THEN 'EXPENSE' ELSE 'BANK_LEDGER' END;files=NEW."evidenceFiles";
 END IF;
 IF jsonb_typeof(files) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(files) LOOP
  IF lower(item->>'path') LIKE '/nas-evidence/%' OR lower(item->>'path')='/nas-evidence' THEN
   aid=split_part(item->>'path','/',3);
   SELECT * INTO a FROM "EvidenceAttachment" WHERE id=aid AND "orgId"=NEW."orgId" AND status='READY' AND purpose=kind;
   IF NOT FOUND OR split_part(item->>'path','/',2)<>'nas-evidence' THEN RAISE EXCEPTION 'EVIDENCE_FILE_NOT_FOUND'; END IF;
   linkid=aid||':'||TG_TABLE_NAME||':'||NEW.id::text;
   INSERT INTO "EvidenceAttachmentLink"(id,"orgId","attachmentId","expenseRequestId","ledgerDocumentId","changeRequestId")
   VALUES(linkid,NEW."orgId",aid,CASE WHEN TG_TABLE_NAME='ExpenseRequest' THEN NEW.id::text::integer END,
    CASE WHEN TG_TABLE_NAME='BankLedgerDocument' THEN NEW.id::text END,CASE WHEN TG_TABLE_NAME='ChangeApprovalRequest' THEN NEW.id::text END)
   ON CONFLICT(id) DO NOTHING;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseRequest_attachment_links" ON "ExpenseRequest";
CREATE TRIGGER "ExpenseRequest_attachment_links" AFTER INSERT OR UPDATE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_evidence_links();
DROP TRIGGER IF EXISTS "LedgerDocument_attachment_links" ON "BankLedgerDocument";
CREATE TRIGGER "LedgerDocument_attachment_links" AFTER INSERT ON "BankLedgerDocument" FOR EACH ROW EXECUTE FUNCTION baro_evidence_links();
DROP TRIGGER IF EXISTS "ChangeApproval_attachment_links" ON "ChangeApprovalRequest";
CREATE TRIGGER "ChangeApproval_attachment_links" AFTER INSERT OR UPDATE ON "ChangeApprovalRequest" FOR EACH ROW EXECUTE FUNCTION baro_evidence_links();
CREATE OR REPLACE FUNCTION baro_evidence_link_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EVIDENCE_LINK_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS "EvidenceLink_immutable" ON "EvidenceAttachmentLink";
CREATE TRIGGER "EvidenceLink_immutable" BEFORE UPDATE OR DELETE ON "EvidenceAttachmentLink" FOR EACH ROW EXECUTE FUNCTION baro_evidence_link_immutable();
-- Rollback: disable upload configuration, retain these additive tables and all file/history links.
