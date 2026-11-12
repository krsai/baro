ALTER TABLE "DashboardWorkRequestEvent" ADD COLUMN IF NOT EXISTS snapshot JSONB;
ALTER TABLE "DashboardWorkRequestEvent" DROP CONSTRAINT IF EXISTS "DashboardWorkRequestEvent_action_check";
ALTER TABLE "DashboardWorkRequestEvent" ADD CONSTRAINT "DashboardWorkRequestEvent_action_check" CHECK (action IN ('CREATE','COMPLETE','HIDE','UPDATE'));
ALTER TABLE "DashboardWorkRequestEvent" DROP CONSTRAINT IF EXISTS "DashboardWorkRequestEvent_edit_snapshot_check";
ALTER TABLE "DashboardWorkRequestEvent" ADD CONSTRAINT "DashboardWorkRequestEvent_edit_snapshot_check" CHECK (action<>'UPDATE' OR (snapshot IS NOT NULL AND snapshot ? 'before' AND snapshot ? 'after'));
CREATE OR REPLACE FUNCTION baro_dashboard_work_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='DashboardWorkRequestEvent' THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
 IF ROW(NEW.id,NEW."orgId",NEW."senderId",NEW."recipientId",NEW."clientKey",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."orgId",OLD."senderId",OLD."recipientId",OLD."clientKey",OLD."createdAt") OR ((NEW.title,NEW.message) IS DISTINCT FROM (OLD.title,OLD.message) AND (OLD.status<>'OPEN' OR NEW.status<>'OPEN' OR NEW."completedAt" IS NOT NULL)) OR NEW.version<>OLD.version+1 OR (OLD.status='DONE' AND (NEW.status<>'DONE' OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt")) OR (OLD."senderHiddenAt" IS NOT NULL AND NEW."senderHiddenAt" IS DISTINCT FROM OLD."senderHiddenAt") OR (OLD."recipientHiddenAt" IS NOT NULL AND NEW."recipientHiddenAt" IS DISTINCT FROM OLD."recipientHiddenAt") THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_dashboard_work_request_edit_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.title,NEW.message) IS DISTINCT FROM (OLD.title,OLD.message) AND NOT EXISTS (
 SELECT 1 FROM "DashboardWorkRequestEvent" e WHERE e."requestId"=NEW.id AND e."orgId"=NEW."orgId" AND e.version=NEW.version AND e.action='UPDATE' AND e."actorId"=NEW."senderId" AND e.snapshot=jsonb_build_object('before',jsonb_build_object('title',OLD.title,'message',OLD.message),'after',jsonb_build_object('title',NEW.title,'message',NEW.message))
 ) THEN RAISE EXCEPTION 'WORK_REQUEST_HISTORY_PROTECTED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "DashboardWorkRequest_edit_audit_guard" ON "DashboardWorkRequest";
CREATE CONSTRAINT TRIGGER "DashboardWorkRequest_edit_audit_guard" AFTER UPDATE ON "DashboardWorkRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_dashboard_work_request_edit_audit();
