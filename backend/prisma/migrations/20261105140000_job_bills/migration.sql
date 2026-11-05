-- Jobs retain their identities and existing document/financial references.
CREATE TABLE "FreightBill" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('MASTER','HOUSE')),number TEXT NOT NULL CHECK(length(trim(number))>0),
 issuer TEXT NOT NULL DEFAULT '',"masterId" TEXT,"masterKind" TEXT NOT NULL DEFAULT 'MASTER' CHECK("masterKind"='MASTER'),
 "deletedAt" TIMESTAMP(3),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"jobId","orgId",kind),CHECK(kind='HOUSE' OR "masterId" IS NULL),
 FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("masterId","jobId","orgId","masterKind") REFERENCES "FreightBill"(id,"jobId","orgId",kind) ON DELETE RESTRICT,
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX "FreightBill_job_idx" ON "FreightBill"("orgId","jobId");
CREATE INDEX "FreightBill_number_idx" ON "FreightBill"("orgId",kind,number,issuer);
-- A legacy shared master becomes one explicit record per job. Never merge jobs
-- or rewrite the legacy master, job, document snapshots or operational amounts.
INSERT INTO "FreightBill"(id,"orgId","jobId",kind,number,issuer,"createdByEmployeeId","updatedByEmployeeId")
 SELECT j.id||':master',j."orgId",j.id,'MASTER',m.number,COALESCE(m.data->>'issuer',''),j."createdByEmployeeId",j."updatedByEmployeeId"
 FROM "FreightJob" j JOIN "FreightMaster" m ON m.id=j."masterId" AND m."orgId"=j."orgId";
INSERT INTO "FreightBill"(id,"orgId","jobId",kind,number,"masterId","createdByEmployeeId","updatedByEmployeeId")
 SELECT j.id||':house',j."orgId",j.id,'HOUSE',j."houseNumber",CASE WHEN j."masterId" IS NULL THEN NULL ELSE j.id||':master' END,j."createdByEmployeeId",j."updatedByEmployeeId"
 FROM "FreightJob" j WHERE j."houseStatus"='HOUSE' AND length(trim(j."houseNumber"))>0;
CREATE FUNCTION baro_job_bill_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 PERFORM 1 FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'FREIGHT_ACTOR_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW."jobId"<>OLD."jobId" OR NEW."orgId"<>OLD."orgId" OR NEW.kind<>OLD.kind OR NEW."createdByEmployeeId"<>OLD."createdByEmployeeId" OR NEW."createdAt"<>OLD."createdAt" OR OLD."deletedAt" IS NOT NULL OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'FREIGHT_INVALID_REVISION'; END IF;
 IF NEW."masterId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "FreightBill" WHERE id=NEW."masterId" AND "jobId"=NEW."jobId" AND "orgId"=NEW."orgId" AND kind='MASTER' AND "deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_SCOPE'; END IF;
 IF NEW.kind='MASTER' AND NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightBill" WHERE "masterId"=NEW.id AND "deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_HAS_HOUSES'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightBill_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightBill" FOR EACH ROW EXECUTE FUNCTION baro_job_bill_guard();
-- Foundation only: handled objects and their execution records are distinct.
CREATE TABLE "FreightTransportTarget" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('CONTAINER','CARGO')),number TEXT,description TEXT NOT NULL DEFAULT '',
 UNIQUE(id,"jobId","orgId"),
 FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE "FreightTransportTask" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,"targetId" TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('PICKUP','DELIVERY','EMPTY_RETURN','OTHER')),
 "partnerId" INTEGER REFERENCES "Organization"(id) ON DELETE RESTRICT,
 vehicle TEXT,driver TEXT,"plannedAt" TIMESTAMP(3),status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','DONE','CANCELLED')),
 FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("targetId","jobId","orgId") REFERENCES "FreightTransportTarget"(id,"jobId","orgId") ON DELETE RESTRICT
);
CREATE FUNCTION baro_job_task_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."partnerId" IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM "Organization" p WHERE p.id=NEW."partnerId" AND p.id<>NEW."orgId" AND p."isActive"
  AND (p."ownerOrgId"=NEW."orgId" OR p."dataOwnerOrgId"=NEW."orgId" OR EXISTS(
   SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id
  ))
 ) THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightTransportTask_scope" BEFORE INSERT OR UPDATE ON "FreightTransportTask" FOR EACH ROW EXECUTE FUNCTION baro_job_task_scope();
