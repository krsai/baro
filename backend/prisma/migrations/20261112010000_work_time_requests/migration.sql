CREATE TABLE IF NOT EXISTS "WorkTimeRequest" (
    "id" TEXT NOT NULL,
    "orgId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "drafterId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "requestedMinutes" INTEGER,
    "approvedMinutes" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "policy" JSONB NOT NULL,
    "clientKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "cancelsRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "WorkTimeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkTimeDay" (
    "id" TEXT NOT NULL,
    "orgId" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "portion" DECIMAL(3,2) NOT NULL,

    CONSTRAINT "WorkTimeDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkTimeStep" (
    "id" TEXT NOT NULL,
    "orgId" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "WorkTimeStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkTimeDecision" (
    "id" TEXT NOT NULL,
    "orgId" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTimeDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkTimeRequest_orgId_startDate_idx" ON "WorkTimeRequest"("orgId", "startDate");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTimeRequest_id_orgId_key" ON "WorkTimeRequest"("id", "orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTimeRequest_orgId_clientKey_key" ON "WorkTimeRequest"("orgId", "clientKey");

CREATE INDEX IF NOT EXISTS "WorkTimeDay_orgId_workDate_idx" ON "WorkTimeDay"("orgId", "workDate");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTimeDay_requestId_workDate_key" ON "WorkTimeDay"("requestId", "workDate");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTimeStep_requestId_position_key" ON "WorkTimeStep"("requestId", "position");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTimeStep_requestId_employeeId_key" ON "WorkTimeStep"("requestId", "employeeId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTimeDecision_requestId_position_key" ON "WorkTimeDecision"("requestId", "position");

DO $fk$ BEGIN ALTER TABLE "WorkTimeRequest" ADD CONSTRAINT "WorkTimeRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeRequest" ADD CONSTRAINT "WorkTimeRequest_employee_fkey" FOREIGN KEY ("employeeId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeRequest" ADD CONSTRAINT "WorkTimeRequest_drafter_fkey" FOREIGN KEY ("drafterId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeRequest" ADD CONSTRAINT "WorkTimeRequest_original_fkey" FOREIGN KEY ("cancelsRequestId", "orgId") REFERENCES "WorkTimeRequest"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeDay" ADD CONSTRAINT "WorkTimeDay_request_fkey" FOREIGN KEY ("requestId", "orgId") REFERENCES "WorkTimeRequest"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeStep" ADD CONSTRAINT "WorkTimeStep_request_fkey" FOREIGN KEY ("requestId", "orgId") REFERENCES "WorkTimeRequest"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeStep" ADD CONSTRAINT "WorkTimeStep_employee_fkey" FOREIGN KEY ("employeeId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeDecision" ADD CONSTRAINT "WorkTimeDecision_request_fkey" FOREIGN KEY ("requestId", "orgId") REFERENCES "WorkTimeRequest"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

DO $fk$ BEGIN ALTER TABLE "WorkTimeDecision" ADD CONSTRAINT "WorkTimeDecision_actor_fkey" FOREIGN KEY ("actorId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $fk$;

-- Original punches, leave history and frozen payroll are deliberately untouched.
DO $checks$ BEGIN
 ALTER TABLE "WorkTimeRequest" ADD CONSTRAINT "WorkTimeRequest_values_check" CHECK (
  kind IN ('OVERTIME','SPECIAL','ANNUAL','ANNUAL_AM','ANNUAL_PM','PAID','UNPAID') AND
  status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','CANCELLED') AND revision>=0 AND
  "startDate" ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' AND "endDate">="startDate" AND
  left("startDate",4)=left("endDate",4) AND length(trim(reason)) BETWEEN 1 AND 1000 AND
  ("requestedMinutes" IS NULL OR "requestedMinutes" BETWEEN 1 AND 1440) AND
  ("approvedMinutes" IS NULL OR "approvedMinutes" BETWEEN 1 AND "requestedMinutes"));
 EXCEPTION WHEN duplicate_object THEN NULL; END $checks$;
DO $checks$ BEGIN
 ALTER TABLE "WorkTimeDay" ADD CONSTRAINT "WorkTimeDay_values_check" CHECK(portion IN (0,0.5,1));
 EXCEPTION WHEN duplicate_object THEN NULL; END $checks$;

CREATE OR REPLACE FUNCTION baro_work_time_guard() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE r "WorkTimeRequest"; p "WorkTimeStep"; a integer; n integer;
BEGIN
 IF TG_OP='DELETE' OR (TG_TABLE_NAME<>'WorkTimeRequest' AND TG_OP='UPDATE') THEN RAISE EXCEPTION 'WORK_TIME_HISTORY_IMMUTABLE'; END IF;
 a=nullif(current_setting('baro.work_time_actor',true),'')::integer;
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" JOIN "SystemSetting" s ON s.key='ROLE_ACCESS_POLICY' WHERE e.id=a AND e."orgId"=NEW."orgId" AND e.status='ACTIVE' AND o."isActive" AND o.type::text IN('MANUFACTURER','SERVICE') AND s.value->(o.type::text)->(e."orgRole"::text) ? 'WORK_TIME') THEN RAISE EXCEPTION 'WORK_TIME_ACCESS_DENIED'; END IF;
 IF TG_TABLE_NAME='WorkTimeRequest' THEN
  IF TG_OP='INSERT' THEN
   IF a<>NEW."drafterId" OR NEW.status<>'PENDING' OR NEW.revision<>0 OR NEW."approvedMinutes" IS NOT NULL OR NEW."decidedAt" IS NOT NULL THEN RAISE EXCEPTION 'WORK_TIME_INVALID_STATE'; END IF;
   IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."drafterId" AND "orgId"=NEW."orgId" AND status='ACTIVE') THEN RAISE EXCEPTION 'WORK_TIME_ACTIVE_DRAFTER_REQUIRED'; END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['status','revision','approvedMinutes','decidedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','revision','approvedMinutes','decidedAt']) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'WORK_TIME_HISTORY_IMMUTABLE'; END IF;
   IF OLD.status='APPROVED' AND NEW.status='CANCELLED' THEN
    IF NOT EXISTS(SELECT 1 FROM "WorkTimeRequest" WHERE "cancelsRequestId"=OLD.id AND "orgId"=OLD."orgId" AND status='APPROVED') THEN RAISE EXCEPTION 'WORK_TIME_CANCELLATION_APPROVAL_REQUIRED'; END IF;
   ELSIF OLD.status='PENDING' AND NEW.status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN') THEN
    IF NEW.status='WITHDRAWN' THEN
     IF a<>OLD."drafterId" THEN RAISE EXCEPTION 'WORK_TIME_ACCESS_DENIED'; END IF;
    ELSE
     SELECT count(*) INTO n FROM "WorkTimeDecision" WHERE "requestId"=OLD.id;
     IF n<>NEW.revision OR NOT EXISTS(SELECT 1 FROM "WorkTimeDecision" WHERE "requestId"=OLD.id AND position=n AND "actorId"=a) THEN RAISE EXCEPTION 'WORK_TIME_APPROVAL_ORDER'; END IF;
    END IF;
   ELSE RAISE EXCEPTION 'WORK_TIME_INVALID_STATE'; END IF;
  END IF;
 ELSE
  SELECT * INTO r FROM "WorkTimeRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
  IF NOT FOUND OR r.status<>'PENDING' THEN RAISE EXCEPTION 'WORK_TIME_SOURCE_CHANGED'; END IF;
  IF TG_TABLE_NAME='WorkTimeDay' THEN
   IF a<>r."drafterId" THEN RAISE EXCEPTION 'WORK_TIME_ACCESS_DENIED'; END IF;
   IF r."cancelsRequestId" IS NOT NULL OR NEW."workDate"<r."startDate" OR NEW."workDate">r."endDate" OR NEW.portion<>(CASE WHEN r.kind IN ('OVERTIME','SPECIAL') THEN 0 WHEN r.kind IN ('ANNUAL_AM','ANNUAL_PM') THEN 0.5 ELSE 1 END) THEN RAISE EXCEPTION 'WORK_TIME_INVALID_DAY'; END IF;
  ELSIF TG_TABLE_NAME='WorkTimeStep' THEN
   IF a<>r."drafterId" THEN RAISE EXCEPTION 'WORK_TIME_ACCESS_DENIED'; END IF;
   IF NEW.position<1 OR NEW."employeeId" IN(r."employeeId",r."drafterId") OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."employeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole"::text=NEW.role AND NEW.role IN('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'WORK_TIME_INVALID_APPROVER'; END IF;
  ELSE
   IF a<>NEW."actorId" THEN RAISE EXCEPTION 'WORK_TIME_ACCESS_DENIED'; END IF;
   SELECT * INTO p FROM "WorkTimeStep" WHERE "requestId"=r.id AND position=NEW.position;
   SELECT count(*) INTO n FROM "WorkTimeDecision" WHERE "requestId"=r.id;
   IF p."employeeId" IS NULL OR p."employeeId"<>NEW."actorId" OR NEW.position<>n+1 OR NEW."actorId" IN(r."employeeId",r."drafterId") OR EXISTS(SELECT 1 FROM "WorkTimeDecision" WHERE "requestId"=r.id AND decision='REJECTED') OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."actorId" AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole"::text=p.role) OR NEW.decision NOT IN('APPROVED','REJECTED') OR NEW.decision='REJECTED' AND coalesce(length(trim(NEW.reason)),0)=0 THEN RAISE EXCEPTION 'WORK_TIME_APPROVAL_ORDER'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $body$;
DO $triggers$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['WorkTimeRequest','WorkTimeDay','WorkTimeStep','WorkTimeDecision'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I',t||'_guard',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION baro_work_time_guard()',t||'_guard',t);
 END LOOP;
END $triggers$;

CREATE OR REPLACE FUNCTION baro_work_time_consistency() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE r "WorkTimeRequest"; steps integer; decisions integer; rejected integer;
BEGIN
 IF TG_TABLE_NAME='WorkTimeRequest' THEN SELECT * INTO r FROM "WorkTimeRequest" WHERE id=NEW.id;
 ELSE SELECT * INTO r FROM "WorkTimeRequest" WHERE id=NEW."requestId"; END IF;
 SELECT count(*) INTO steps FROM "WorkTimeStep" WHERE "requestId"=r.id;
 SELECT count(*),count(*) FILTER(WHERE decision='REJECTED') INTO decisions,rejected FROM "WorkTimeDecision" WHERE "requestId"=r.id;
 IF coalesce((SELECT jsonb_agg("employeeId" ORDER BY position) FROM "WorkTimeStep" WHERE "requestId"=r.id),'[]'::jsonb) IS DISTINCT FROM r.policy->'approverIds' OR coalesce((SELECT jsonb_agg(jsonb_build_object('workDate',"workDate",'portion',portion) ORDER BY "workDate") FROM "WorkTimeDay" WHERE "requestId"=r.id),'[]'::jsonb) IS DISTINCT FROM r.policy->'requestedDays' THEN RAISE EXCEPTION 'WORK_TIME_INCOMPLETE_APPROVAL'; END IF;
 IF steps=0 OR (r."cancelsRequestId" IS NULL AND NOT EXISTS(SELECT 1 FROM "WorkTimeDay" WHERE "requestId"=r.id)) OR (r.status='APPROVED' AND (decisions<>steps OR rejected<>0 OR (r.kind IN('OVERTIME','SPECIAL') AND r."cancelsRequestId" IS NULL AND r."approvedMinutes" IS NULL))) OR (r.status='REJECTED' AND rejected<>1) OR (r.status='PENDING' AND (decisions>=steps OR rejected<>0)) THEN RAISE EXCEPTION 'WORK_TIME_INCOMPLETE_APPROVAL'; END IF;
 RETURN NEW;
END; $body$;
DROP TRIGGER IF EXISTS "WorkTimeRequest_consistency" ON "WorkTimeRequest";
CREATE CONSTRAINT TRIGGER "WorkTimeRequest_consistency" AFTER INSERT OR UPDATE ON "WorkTimeRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_work_time_consistency();
DROP TRIGGER IF EXISTS "WorkTimeDay_consistency" ON "WorkTimeDay";
CREATE CONSTRAINT TRIGGER "WorkTimeDay_consistency" AFTER INSERT ON "WorkTimeDay" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_work_time_consistency();
DROP TRIGGER IF EXISTS "WorkTimeStep_consistency" ON "WorkTimeStep";
CREATE CONSTRAINT TRIGGER "WorkTimeStep_consistency" AFTER INSERT ON "WorkTimeStep" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_work_time_consistency();

CREATE OR REPLACE FUNCTION baro_work_time_policy_history() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 IF OLD.key ~ '^WORK_TIME_POLICY:[0-9]+:REV:[0-9]+$' THEN RAISE EXCEPTION 'WORK_TIME_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $body$;
DROP TRIGGER IF EXISTS "WorkTimePolicy_history" ON "SystemSetting";
CREATE TRIGGER "WorkTimePolicy_history" BEFORE UPDATE OR DELETE ON "SystemSetting" FOR EACH ROW EXECUTE FUNCTION baro_work_time_policy_history();

-- Expand only the new, independently gated request feature; preserve a migration backup.
INSERT INTO "SystemSetting"(key,value,"updatedAt") SELECT 'WORK_TIME_ROLE_POLICY_BACKUP:20261112',value,CURRENT_TIMESTAMP FROM "SystemSetting" WHERE key='ROLE_ACCESS_POLICY' ON CONFLICT(key) DO NOTHING;
DO $policy$ DECLARE v jsonb; org text; role text; BEGIN
 SELECT value INTO v FROM "SystemSetting" WHERE key='ROLE_ACCESS_POLICY' FOR UPDATE;
 IF v IS NOT NULL THEN
  FOREACH org IN ARRAY ARRAY['MANUFACTURER','SERVICE'] LOOP
   IF v->org IS NOT NULL THEN
    FOREACH role IN ARRAY ARRAY['ADMIN','OPERATOR','ACCOUNTANT','WORKER'] LOOP
     IF jsonb_typeof(v->org->role)='array' AND NOT (v->org->role ? 'WORK_TIME') THEN v=jsonb_set(v,ARRAY[org,role],(v->org->role)||'"WORK_TIME"'::jsonb); END IF;
    END LOOP;
   END IF;
  END LOOP;
  v=jsonb_set(v,ARRAY['__schemaVersion'],'17'::jsonb);
  UPDATE "SystemSetting" SET value=v,"updatedAt"=CURRENT_TIMESTAMP WHERE key='ROLE_ACCESS_POLICY';
 END IF;
END $policy$;
