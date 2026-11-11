CREATE TABLE "DashboardWorkRequest" (
 "id" TEXT PRIMARY KEY,
 "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "senderId" INTEGER NOT NULL,
 "recipientId" INTEGER NOT NULL,
 "clientKey" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "message" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3),
 "senderHiddenAt" TIMESTAMP(3),
 "recipientHiddenAt" TIMESTAMP(3),
 CONSTRAINT "DashboardWorkRequest_id_orgId_key" UNIQUE (id,"orgId"),
 CONSTRAINT "DashboardWorkRequest_retry_key" UNIQUE ("orgId","senderId","clientKey"),
 CONSTRAINT "DashboardWorkRequest_sender_scope_fkey" FOREIGN KEY ("senderId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "DashboardWorkRequest_recipient_scope_fkey" FOREIGN KEY ("recipientId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "DashboardWorkRequest_values_check" CHECK ("senderId"<>"recipientId" AND "version">0 AND length(trim(title)) BETWEEN 1 AND 200 AND length(message)<=4000 AND ((status='OPEN' AND "completedAt" IS NULL AND "senderHiddenAt" IS NULL AND "recipientHiddenAt" IS NULL) OR (status='DONE' AND "completedAt" IS NOT NULL)))
);
CREATE INDEX "DashboardWorkRequest_sender_idx" ON "DashboardWorkRequest"("orgId","senderId","createdAt" DESC,id);
CREATE INDEX "DashboardWorkRequest_recipient_idx" ON "DashboardWorkRequest"("orgId","recipientId","createdAt" DESC,id);
CREATE TABLE "DashboardWorkRequestEvent" (
 id TEXT PRIMARY KEY,
 "orgId" INTEGER NOT NULL,
 "requestId" TEXT NOT NULL,
 "actorId" INTEGER NOT NULL,
 action TEXT NOT NULL CHECK (action IN ('CREATE','COMPLETE','HIDE')),
 version INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DashboardWorkRequestEvent_request_scope_fkey" FOREIGN KEY ("requestId","orgId") REFERENCES "DashboardWorkRequest"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "DashboardWorkRequestEvent_actor_scope_fkey" FOREIGN KEY ("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "DashboardWorkRequestEvent_revision_key" UNIQUE ("requestId",version)
);
CREATE FUNCTION baro_dashboard_work_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='DashboardWorkRequestEvent' THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
 IF ROW(NEW.id,NEW."orgId",NEW."senderId",NEW."recipientId",NEW."clientKey",NEW.title,NEW.message,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."orgId",OLD."senderId",OLD."recipientId",OLD."clientKey",OLD.title,OLD.message,OLD."createdAt") OR NEW.version<>OLD.version+1 OR (OLD.status='DONE' AND (NEW.status<>'DONE' OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt")) OR (OLD."senderHiddenAt" IS NOT NULL AND NEW."senderHiddenAt" IS DISTINCT FROM OLD."senderHiddenAt") OR (OLD."recipientHiddenAt" IS NOT NULL AND NEW."recipientHiddenAt" IS DISTINCT FROM OLD."recipientHiddenAt") THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "DashboardWorkRequest_write_guard" BEFORE UPDATE OR DELETE ON "DashboardWorkRequest" FOR EACH ROW EXECUTE FUNCTION baro_dashboard_work_request_guard();
CREATE TRIGGER "DashboardWorkRequestEvent_append_only" BEFORE UPDATE OR DELETE ON "DashboardWorkRequestEvent" FOR EACH ROW EXECUTE FUNCTION baro_dashboard_work_request_guard();
