ALTER TABLE "DashboardWorkRequest" ADD COLUMN IF NOT EXISTS "reportRequired" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
 ADD COLUMN IF NOT EXISTS "reportFileRequired" BOOLEAN NOT NULL DEFAULT false,ADD COLUMN IF NOT EXISTS "automaticWarning" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "warningMessage" TEXT NOT NULL DEFAULT '',ADD COLUMN IF NOT EXISTS "warningArmedAt" TIMESTAMP(3),
 ADD COLUMN IF NOT EXISTS "requirementVersion" INT NOT NULL DEFAULT 1,ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "DashboardWorkRequest" DROP CONSTRAINT IF EXISTS "DashboardWorkRequest_values_check";
ALTER TABLE "DashboardWorkRequest" ADD CONSTRAINT "DashboardWorkRequest_values_check" CHECK("senderId"<>"recipientId" AND version>0 AND length(trim(title)) BETWEEN 1 AND 200 AND length(message)<=4000 AND ((status='OPEN' AND "completedAt" IS NULL AND ("cancelledAt" IS NOT NULL OR "senderHiddenAt" IS NULL AND "recipientHiddenAt" IS NULL)) OR (status='DONE' AND "completedAt" IS NOT NULL)));
ALTER TABLE "DashboardWorkRequest" DROP CONSTRAINT IF EXISTS "WorkTask_fields_check";
ALTER TABLE "DashboardWorkRequest" ADD CONSTRAINT "WorkTask_fields_check" CHECK("requirementVersion">0 AND (NOT "reportRequired" OR "dueAt" IS NOT NULL) AND (NOT "reportFileRequired" OR "reportRequired") AND (NOT "automaticWarning" OR ("reportRequired" AND "warningArmedAt" IS NOT NULL AND length(trim("warningMessage")) BETWEEN 1 AND 4000)) AND ("cancelledAt" IS NULL OR ("reportRequired" AND length(trim("cancellationReason")) BETWEEN 1 AND 1000)));
ALTER TABLE "DashboardWorkRequestEvent" DROP CONSTRAINT IF EXISTS "DashboardWorkRequestEvent_action_check";
ALTER TABLE "DashboardWorkRequestEvent" ADD CONSTRAINT "DashboardWorkRequestEvent_action_check" CHECK(action IN('CREATE','COMPLETE','HIDE','UPDATE','TASK_UPDATE','TASK_CANCEL','REPORT_SUBMIT'));
CREATE TABLE IF NOT EXISTS "WorkTaskReport" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"requestId" TEXT NOT NULL,"authorId" INT NOT NULL,"requirementVersion" INT NOT NULL,
 "clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,body TEXT NOT NULL,"taskSnapshot" JSONB NOT NULL,"submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId"),UNIQUE("requestId","requirementVersion"),UNIQUE("orgId","authorId","clientKey"),
 CONSTRAINT "WorkTaskReport_request_fkey" FOREIGN KEY("requestId","orgId") REFERENCES "DashboardWorkRequest"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "WorkTaskReport_author_fkey" FOREIGN KEY("authorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CHECK("requirementVersion">0 AND length(body)<=20000)
);
ALTER TABLE "EvidenceAttachment" DROP CONSTRAINT IF EXISTS "EvidenceAttachment_values_check";
ALTER TABLE "EvidenceAttachment" ADD CONSTRAINT "EvidenceAttachment_values_check" CHECK(purpose IN('EXPENSE','BANK_LEDGER','WORK_REPORT') AND status IN('PENDING','READY') AND "byteSize" BETWEEN 1 AND 5242880 AND sha256 ~ '^[a-f0-9]{64}$' AND length("originalFileName") BETWEEN 1 AND 180 AND (status='READY')=("readyAt" IS NOT NULL));
ALTER TABLE "EvidenceAttachmentLink" ADD COLUMN IF NOT EXISTS "workReportId" TEXT;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='EvidenceLink_work_report_fkey') THEN
 ALTER TABLE "EvidenceAttachmentLink" ADD CONSTRAINT "EvidenceLink_work_report_fkey" FOREIGN KEY("workReportId","orgId") REFERENCES "WorkTaskReport"(id,"orgId") ON DELETE RESTRICT;
END IF; END $$;
ALTER TABLE "EvidenceAttachmentLink" DROP CONSTRAINT IF EXISTS "EvidenceLink_source_check";
ALTER TABLE "EvidenceAttachmentLink" ADD CONSTRAINT "EvidenceLink_source_check" CHECK(num_nonnulls("expenseRequestId","ledgerDocumentId","changeRequestId","workReportId")=1);
ALTER TABLE "EmployeeFeedbackDelivery" ALTER COLUMN "ruleId" DROP NOT NULL;
ALTER TABLE "EmployeeFeedbackDelivery" ADD COLUMN IF NOT EXISTS "taskId" TEXT,ADD COLUMN IF NOT EXISTS "taskRequirementVersion" INT;
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackDelivery_scope_key" ON "EmployeeFeedbackDelivery"(id,"orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackDelivery_task_key" ON "EmployeeFeedbackDelivery"("taskId","taskRequirementVersion");
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FeedbackDelivery_task_fkey') THEN
 ALTER TABLE "EmployeeFeedbackDelivery" ADD CONSTRAINT "FeedbackDelivery_task_fkey" FOREIGN KEY("taskId","orgId") REFERENCES "DashboardWorkRequest"(id,"orgId") ON DELETE RESTRICT;
END IF; END $$;
ALTER TABLE "EmployeeFeedbackDelivery" DROP CONSTRAINT IF EXISTS "FeedbackDelivery_subject_check";
ALTER TABLE "EmployeeFeedbackDelivery" ADD CONSTRAINT "FeedbackDelivery_subject_check" CHECK(("ruleId" IS NOT NULL AND "taskId" IS NULL AND "taskRequirementVersion" IS NULL) OR ("ruleId" IS NULL AND "taskId" IS NOT NULL AND "taskRequirementVersion">0));
CREATE TABLE IF NOT EXISTS "WorkTaskReportCheck" (
 "requestId" TEXT NOT NULL,"orgId" INT NOT NULL,"requirementVersion" INT NOT NULL,result TEXT NOT NULL,"reportId" TEXT,"deliveryId" TEXT,"lastError" TEXT,"checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("requestId","requirementVersion"),
 CONSTRAINT "TaskReportCheck_request_fkey" FOREIGN KEY("requestId","orgId") REFERENCES "DashboardWorkRequest"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "TaskReportCheck_report_fkey" FOREIGN KEY("reportId","orgId") REFERENCES "WorkTaskReport"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "TaskReportCheck_delivery_fkey" FOREIGN KEY("deliveryId","orgId") REFERENCES "EmployeeFeedbackDelivery"(id,"orgId") ON DELETE RESTRICT,
 CHECK(result IN('PENDING','ON_TIME','WARNED'))
);
CREATE OR REPLACE FUNCTION baro_task_report_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "DashboardWorkRequest";
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'TASK_REPORT_IMMUTABLE'; END IF;
 SELECT * INTO t FROM "DashboardWorkRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT FOUND OR NOT t."reportRequired" OR t."cancelledAt" IS NOT NULL OR t.status<>'OPEN' OR t."recipientId"<>NEW."authorId" OR t."requirementVersion"<>NEW."requirementVersion" THEN RAISE EXCEPTION 'TASK_REPORT_CHANGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "WorkTaskReport_guard" ON "WorkTaskReport";
CREATE TRIGGER "WorkTaskReport_guard" BEFORE INSERT OR UPDATE OR DELETE ON "WorkTaskReport" FOR EACH ROW EXECUTE FUNCTION baro_task_report_guard();
CREATE OR REPLACE FUNCTION baro_task_report_files_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n INT; required BOOLEAN;
BEGIN
 SELECT count(*) INTO n FROM "EvidenceAttachmentLink" l JOIN "EvidenceAttachment" a ON a.id=l."attachmentId" AND a."orgId"=l."orgId" WHERE l."workReportId"=NEW.id AND l."orgId"=NEW."orgId" AND a.status='READY' AND a.purpose='WORK_REPORT' AND a."createdByEmployeeId"=NEW."authorId";
 SELECT "reportFileRequired" INTO required FROM "DashboardWorkRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId";
 IF (length(trim(NEW.body))=0 AND n=0) OR (required AND n=0) THEN RAISE EXCEPTION 'TASK_REPORT_FILE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "WorkTaskReport_files_guard" ON "WorkTaskReport";
CREATE CONSTRAINT TRIGGER "WorkTaskReport_files_guard" AFTER INSERT ON "WorkTaskReport" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_task_report_files_guard();
CREATE OR REPLACE FUNCTION baro_work_report_attachment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."workReportId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "WorkTaskReport" r JOIN "EvidenceAttachment" a ON a.id=NEW."attachmentId" AND a."orgId"=r."orgId" WHERE r.id=NEW."workReportId" AND r."orgId"=NEW."orgId" AND a.status='READY' AND a.purpose='WORK_REPORT' AND a."createdByEmployeeId"=r."authorId") THEN RAISE EXCEPTION 'EVIDENCE_FILE_NOT_FOUND'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "WorkReport_attachment_guard" ON "EvidenceAttachmentLink";
CREATE TRIGGER "WorkReport_attachment_guard" BEFORE INSERT ON "EvidenceAttachmentLink" FOR EACH ROW EXECUTE FUNCTION baro_work_report_attachment_guard();
CREATE OR REPLACE FUNCTION baro_task_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed BOOLEAN;
BEGIN
 IF NEW."reportRequired" IS DISTINCT FROM OLD."reportRequired" THEN RAISE EXCEPTION 'TASK_REPORT_CHANGED'; END IF;
 IF NOT OLD."reportRequired" THEN RETURN NEW; END IF;
 changed=ROW(NEW.title,NEW.message,NEW."dueAt",NEW."timeZone",NEW."reportFileRequired",NEW."automaticWarning",NEW."warningMessage") IS DISTINCT FROM ROW(OLD.title,OLD.message,OLD."dueAt",OLD."timeZone",OLD."reportFileRequired",OLD."automaticWarning",OLD."warningMessage");
 IF (OLD.status='DONE' OR OLD."cancelledAt" IS NOT NULL) AND (changed OR NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt" OR NEW."cancellationReason" IS DISTINCT FROM OLD."cancellationReason") OR (changed AND NEW."requirementVersion"<>OLD."requirementVersion"+1) OR (NOT changed AND (NEW."requirementVersion"<>OLD."requirementVersion" OR NEW."warningArmedAt" IS DISTINCT FROM OLD."warningArmedAt")) THEN RAISE EXCEPTION 'TASK_REPORT_CHANGED'; END IF;
 IF NEW.status='DONE' AND NOT EXISTS(SELECT 1 FROM "WorkTaskReport" WHERE "requestId"=NEW.id AND "orgId"=NEW."orgId" AND "requirementVersion"=NEW."requirementVersion") THEN RAISE EXCEPTION 'TASK_REPORT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "WorkTask_request_guard" ON "DashboardWorkRequest";
CREATE TRIGGER "WorkTask_request_guard" BEFORE UPDATE ON "DashboardWorkRequest" FOR EACH ROW EXECUTE FUNCTION baro_task_request_guard();
CREATE OR REPLACE FUNCTION baro_dashboard_work_request_edit_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."reportRequired" THEN
  IF ROW(NEW.title,NEW.message,NEW."dueAt",NEW."automaticWarning",NEW."reportFileRequired",NEW."warningMessage",NEW."timeZone") IS DISTINCT FROM ROW(OLD.title,OLD.message,OLD."dueAt",OLD."automaticWarning",OLD."reportFileRequired",OLD."warningMessage",OLD."timeZone") AND NOT EXISTS(SELECT 1 FROM "DashboardWorkRequestEvent" WHERE "requestId"=NEW.id AND "orgId"=NEW."orgId" AND version=NEW.version AND action='TASK_UPDATE' AND "actorId"=NEW."senderId" AND snapshot->'before'->>'title'=OLD.title AND snapshot->'after'->>'title'=NEW.title AND snapshot->'before'->>'message'=OLD.message AND snapshot->'after'->>'message'=NEW.message AND (snapshot->'before'->>'dueAt')::timestamptz AT TIME ZONE 'UTC'=OLD."dueAt" AND (snapshot->'after'->>'dueAt')::timestamptz AT TIME ZONE 'UTC'=NEW."dueAt") THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
  IF NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt" AND NOT EXISTS(SELECT 1 FROM "DashboardWorkRequestEvent" WHERE "requestId"=NEW.id AND "orgId"=NEW."orgId" AND version=NEW.version AND action='TASK_CANCEL' AND "actorId"=NEW."senderId") THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
 ELSE
  IF (NEW.title,NEW.message) IS DISTINCT FROM (OLD.title,OLD.message) AND NOT EXISTS(SELECT 1 FROM "DashboardWorkRequestEvent" e WHERE e."requestId"=NEW.id AND e."orgId"=NEW."orgId" AND e.version=NEW.version AND e.action='UPDATE' AND e."actorId"=NEW."senderId" AND e.snapshot=jsonb_build_object('before',jsonb_build_object('title',OLD.title,'message',OLD.message),'after',jsonb_build_object('title',NEW.title,'message',NEW.message))) THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
 END IF;
 RETURN NEW;
END $$;
