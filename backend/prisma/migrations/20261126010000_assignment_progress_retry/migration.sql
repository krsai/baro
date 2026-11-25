-- Durable invalidation is committed with each real production record mutation.
-- No historical records or confirmed snapshots are rewritten by this migration.
CREATE TABLE IF NOT EXISTS "AssignmentProgressSync" (
 "assignmentPlanId" integer NOT NULL,
 "orgId" integer NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 "syncedRevision" bigint NOT NULL DEFAULT 0,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 "nextAttemptAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastError" text,
 "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "syncedAt" timestamp(3),
 PRIMARY KEY ("assignmentPlanId", "orgId"),
 FOREIGN KEY ("assignmentPlanId", "orgId") REFERENCES "AssignmentPlan"(id, "orgId") ON DELETE CASCADE ON UPDATE RESTRICT,
 CHECK ("syncedRevision" >= 0 AND "syncedRevision" <= revision)
);
CREATE INDEX IF NOT EXISTS "AssignmentProgressSync_pending" ON "AssignmentProgressSync" ("nextAttemptAt") WHERE "syncedRevision" < revision;
CREATE OR REPLACE FUNCTION baro_queue_assignment_progress(plan_id integer, company_id integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "AssignmentProgressSync" ("assignmentPlanId", "orgId") VALUES (plan_id, company_id)
 ON CONFLICT ("assignmentPlanId", "orgId") DO UPDATE SET
 revision = "AssignmentProgressSync".revision + 1, attempts = 0,
 "nextAttemptAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP;
END $$;
CREATE OR REPLACE FUNCTION baro_record_progress_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN PERFORM baro_queue_assignment_progress(OLD."assignmentPlanId", OLD."orgId"); END IF;
 IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW."assignmentPlanId" IS DISTINCT FROM OLD."assignmentPlanId" OR NEW."orgId" IS DISTINCT FROM OLD."orgId") THEN
  PERFORM baro_queue_assignment_progress(NEW."assignmentPlanId", NEW."orgId");
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS "WorkRecord_progress_retry" ON "WorkRecord";
CREATE TRIGGER "WorkRecord_progress_retry" AFTER INSERT OR UPDATE OR DELETE ON "WorkRecord" FOR EACH ROW EXECUTE FUNCTION baro_record_progress_changed();
DROP TRIGGER IF EXISTS "OutsourcedWorkRecord_progress_retry" ON "OutsourcedWorkRecord";
CREATE TRIGGER "OutsourcedWorkRecord_progress_retry" AFTER INSERT OR UPDATE OR DELETE ON "OutsourcedWorkRecord" FOR EACH ROW EXECUTE FUNCTION baro_record_progress_changed();
