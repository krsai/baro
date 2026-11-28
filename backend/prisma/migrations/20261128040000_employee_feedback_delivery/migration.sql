-- Existing rules stay off. No policy is enabled and no message is backfilled.
ALTER TABLE "EmployeeFeedbackRule" DROP CONSTRAINT IF EXISTS "FeedbackRule_preparation_check";
ALTER TABLE "EmployeeFeedbackRule" DROP CONSTRAINT IF EXISTS "FeedbackRule_delivery_mode_check";
ALTER TABLE "EmployeeFeedbackRule" ADD CONSTRAINT "FeedbackRule_delivery_mode_check" CHECK(coalesce(jsonb_typeof(definition->'automaticDelivery')='boolean',false) AND version>0);
ALTER TABLE "EmployeeFeedbackRule" ADD COLUMN IF NOT EXISTS "armedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "automationByEmployeeId" INT;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FeedbackRule_automation_actor_fkey') THEN
 ALTER TABLE "EmployeeFeedbackRule" ADD CONSTRAINT "FeedbackRule_automation_actor_fkey" FOREIGN KEY("automationByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT;
END IF; END $$;
ALTER TABLE "EmployeeFeedbackRule" DROP CONSTRAINT IF EXISTS "FeedbackRule_armed_check";
ALTER TABLE "EmployeeFeedbackRule" ADD CONSTRAINT "FeedbackRule_armed_check" CHECK(definition->>'automaticDelivery'<>'true' OR ("armedAt" IS NOT NULL AND "automationByEmployeeId" IS NOT NULL));
CREATE TABLE IF NOT EXISTS "EmployeeFeedbackAutomation" (
 "orgId" INT PRIMARY KEY REFERENCES "Organization"(id) ON DELETE RESTRICT,
 enabled BOOLEAN NOT NULL DEFAULT false,version INT NOT NULL DEFAULT 1,"enabledFrom" TIMESTAMP(3),"actorId" INT NOT NULL,
 CONSTRAINT "FeedbackAutomation_actor_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CHECK(version>0 AND (NOT enabled OR "enabledFrom" IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS "EmployeeFeedbackAutomationEvent" (
 "orgId" INT NOT NULL,version INT NOT NULL,"actorId" INT NOT NULL,enabled BOOLEAN NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("orgId",version),
 FOREIGN KEY("orgId") REFERENCES "EmployeeFeedbackAutomation"("orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackAutomationEvent_actor_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "EmployeeFeedbackRun" (
 "ruleId" TEXT PRIMARY KEY,"orgId" INT NOT NULL,"ruleVersion" INT NOT NULL,"automationVersion" INT NOT NULL,
 "lastWorkDate" TEXT,"lastAppliedAt" TIMESTAMP(3),"lastSourceId" TEXT,"matchCount" INT NOT NULL DEFAULT 0,"matchStartDate" TEXT,
 "lastError" TEXT,"lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FeedbackRun_rule_fkey" FOREIGN KEY("ruleId","orgId") REFERENCES "EmployeeFeedbackRule"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "EmployeeFeedbackDelivery" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"employeeId" INT NOT NULL,"ruleId" TEXT NOT NULL,"ruleVersion" INT NOT NULL,"automationVersion" INT NOT NULL,
 "occurrenceKey" TEXT NOT NULL,kind TEXT NOT NULL,subject TEXT NOT NULL,message TEXT NOT NULL,
 "periodStartDate" TEXT NOT NULL,"periodEndDate" TEXT NOT NULL,evidence JSONB NOT NULL,
 "authorizedByEmployeeId" INT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"readAt" TIMESTAMP(3),
 CONSTRAINT "FeedbackDelivery_rule_fkey" FOREIGN KEY("ruleId","orgId") REFERENCES "EmployeeFeedbackRule"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDelivery_employee_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDelivery_actor_fkey" FOREIGN KEY("authorizedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDelivery_activation_fkey" FOREIGN KEY("orgId","automationVersion") REFERENCES "EmployeeFeedbackAutomationEvent"("orgId",version) ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDelivery_kind_check" CHECK(kind IN ('WARNING','PRAISE')),
 CONSTRAINT "FeedbackDelivery_occurrence_key" UNIQUE("ruleId","ruleVersion","automationVersion","occurrenceKey")
);
CREATE INDEX IF NOT EXISTS "FeedbackDelivery_inbox_idx" ON "EmployeeFeedbackDelivery"("orgId","employeeId","createdAt" DESC,id);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeFeedbackRun_ruleId_orgId_key" ON "EmployeeFeedbackRun"("ruleId","orgId");
CREATE INDEX IF NOT EXISTS "FeedbackAutomation_enabled_idx" ON "EmployeeFeedbackAutomation"(enabled,"orgId");
CREATE OR REPLACE FUNCTION baro_feedback_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FEEDBACK_DELIVERY_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-'readAt') IS DISTINCT FROM (to_jsonb(OLD)-'readAt') OR OLD."readAt" IS NOT NULL AND NEW."readAt" IS DISTINCT FROM OLD."readAt" THEN RAISE EXCEPTION 'FEEDBACK_DELIVERY_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FeedbackDelivery_history_guard" ON "EmployeeFeedbackDelivery";
CREATE TRIGGER "FeedbackDelivery_history_guard" BEFORE UPDATE OR DELETE ON "EmployeeFeedbackDelivery" FOR EACH ROW EXECUTE FUNCTION baro_feedback_delivery_guard();
DROP TRIGGER IF EXISTS "FeedbackAutomationEvent_history_guard" ON "EmployeeFeedbackAutomationEvent";
CREATE TRIGGER "FeedbackAutomationEvent_history_guard" BEFORE UPDATE OR DELETE ON "EmployeeFeedbackAutomationEvent" FOR EACH ROW EXECUTE FUNCTION baro_feedback_history_guard();
