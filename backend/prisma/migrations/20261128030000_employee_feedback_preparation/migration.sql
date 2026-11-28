CREATE TABLE IF NOT EXISTS "EmployeeFeedbackRule" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"employeeId" INT NOT NULL,"factoryId" INT,
 definition JSONB NOT NULL,version INT NOT NULL DEFAULT 1,"createdByEmployeeId" INT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId"),
 CONSTRAINT "FeedbackRule_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "FeedbackRule_employee_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackRule_actor_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackRule_factory_fkey" FOREIGN KEY("factoryId","orgId") REFERENCES "Factory"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackRule_preparation_check" CHECK(version>0 AND coalesce(definition->'automaticDelivery'='false'::jsonb,false))
);
CREATE TABLE IF NOT EXISTS "EmployeeFeedbackDraft" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"employeeId" INT NOT NULL,"ruleId" TEXT,
 content JSONB NOT NULL,state TEXT NOT NULL DEFAULT 'DRAFT',version INT NOT NULL DEFAULT 1,"createdByEmployeeId" INT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId"),
 CONSTRAINT "FeedbackDraft_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDraft_employee_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDraft_actor_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDraft_rule_fkey" FOREIGN KEY("ruleId","orgId") REFERENCES "EmployeeFeedbackRule"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackDraft_state_check" CHECK(version>0 AND state IN ('DRAFT','REVIEWED','DISMISSED'))
);
CREATE TABLE IF NOT EXISTS "EmployeeFeedbackEvent" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"ruleId" TEXT,"draftId" TEXT,"actorId" INT NOT NULL,
 version INT NOT NULL,action TEXT NOT NULL,snapshot JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FeedbackEvent_rule_fkey" FOREIGN KEY("ruleId","orgId") REFERENCES "EmployeeFeedbackRule"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackEvent_draft_fkey" FOREIGN KEY("draftId","orgId") REFERENCES "EmployeeFeedbackDraft"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackEvent_actor_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FeedbackEvent_subject_check" CHECK(num_nonnulls("ruleId","draftId")=1 AND version>0),
 UNIQUE("ruleId",version),UNIQUE("draftId",version)
);
CREATE INDEX IF NOT EXISTS "FeedbackRule_company_idx" ON "EmployeeFeedbackRule"("orgId","updatedAt" DESC,id);
CREATE INDEX IF NOT EXISTS "FeedbackDraft_company_idx" ON "EmployeeFeedbackDraft"("orgId","updatedAt" DESC,id);
CREATE OR REPLACE FUNCTION baro_feedback_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'FEEDBACK_HISTORY_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS "FeedbackEvent_history_guard" ON "EmployeeFeedbackEvent";
CREATE TRIGGER "FeedbackEvent_history_guard" BEFORE UPDATE OR DELETE ON "EmployeeFeedbackEvent" FOR EACH ROW EXECUTE FUNCTION baro_feedback_history_guard();
CREATE OR REPLACE FUNCTION baro_feedback_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state<>'DRAFT' THEN RAISE EXCEPTION 'FEEDBACK_FINAL_DOCUMENT'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FeedbackDraft_history_guard" ON "EmployeeFeedbackDraft";
CREATE TRIGGER "FeedbackDraft_history_guard" BEFORE UPDATE OR DELETE ON "EmployeeFeedbackDraft" FOR EACH ROW EXECUTE FUNCTION baro_feedback_draft_guard();
