-- One canonical MBL can serve several company-scoped customer jobs.
-- Keep existing bill IDs, source job IDs, amounts, original FK values and snapshots.
ALTER TABLE "FreightBill" ADD CONSTRAINT "FreightBill_id_org_kind_key" UNIQUE(id,"orgId",kind);
CREATE TABLE "FreightJobMaster" (
 "jobId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"masterBillId" TEXT NOT NULL,
 "masterKind" TEXT NOT NULL DEFAULT 'MASTER' CHECK("masterKind"='MASTER'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),"deletedAt" TIMESTAMP(3),
 "requestId" TEXT,"requestHash" TEXT,
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("jobId","masterBillId"),
 CONSTRAINT "FreightJobMaster_job_scope" FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightJobMaster_master_scope" FOREIGN KEY("masterBillId","orgId","masterKind") REFERENCES "FreightBill"(id,"orgId",kind) ON DELETE RESTRICT,
 CONSTRAINT "FreightJobMaster_creator_scope" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightJobMaster_actor_scope" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX "FreightJobMaster_master_idx" ON "FreightJobMaster"("orgId","masterBillId");
-- Backfill only existing explicit ownership/FKs; never group by BL number or name.
INSERT INTO "FreightJobMaster"("jobId","orgId","masterBillId","createdByEmployeeId","updatedByEmployeeId","createdAt","updatedAt")
 SELECT "jobId","orgId",id,"createdByEmployeeId","updatedByEmployeeId","createdAt","updatedAt" FROM "FreightBill" WHERE kind='MASTER' AND "deletedAt" IS NULL;
ALTER TABLE "FreightBill" ADD CONSTRAINT "FreightBill_masterId_orgId_masterKind_fkey" FOREIGN KEY("masterId","orgId","masterKind") REFERENCES "FreightBill"(id,"orgId",kind) ON DELETE RESTRICT;
ALTER TABLE "FreightBill" DROP CONSTRAINT "FreightBill_masterId_jobId_orgId_masterKind_fkey";
CREATE OR REPLACE FUNCTION baro_job_bill_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 PERFORM 1 FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'FREIGHT_ACTOR_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW."jobId"<>OLD."jobId" OR NEW."orgId"<>OLD."orgId" OR NEW.kind<>OLD.kind OR NEW."createdByEmployeeId"<>OLD."createdByEmployeeId" OR NEW."createdAt"<>OLD."createdAt" OR OLD."deletedAt" IS NOT NULL OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'FREIGHT_INVALID_REVISION'; END IF;
 IF NEW."masterId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "FreightBill" WHERE id=NEW."masterId" AND "orgId"=NEW."orgId" AND kind='MASTER' AND "deletedAt" IS NULL AND EXISTS(SELECT 1 FROM "FreightJobMaster" l WHERE l."masterBillId"=NEW."masterId" AND l."jobId"=NEW."jobId" AND l."orgId"=NEW."orgId" AND l."deletedAt" IS NULL)) THEN RAISE EXCEPTION 'FREIGHT_MASTER_SCOPE'; END IF;
 IF NEW.kind='MASTER' AND NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightBill" WHERE "masterId"=NEW.id AND "deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_HAS_HOUSES'; END IF;
 IF NEW.kind='MASTER' AND NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightJobMaster" WHERE "masterBillId"=NEW.id AND "orgId"=NEW."orgId" AND "deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_HAS_JOBS'; END IF;
 IF NEW.kind='MASTER' AND NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightDocument" WHERE "orgId"=NEW."orgId" AND (snapshot->'source'->'bill'->>'id'=NEW.id OR snapshot->'source'->'master'->>'id'=NEW.id)) THEN RAISE EXCEPTION 'FREIGHT_BILL_HAS_DOCUMENTS'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_shared_master_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_job "FreightJob"; source_mode TEXT; source_service TEXT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 SELECT * INTO current_job FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT FOUND OR current_job."receiptStatus"<>'ACCEPTED' OR current_job.status='CANCELLED' THEN RAISE EXCEPTION 'SHIPPING_NOT_ACCEPTED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'FREIGHT_ACTOR_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND (NEW."jobId"<>OLD."jobId" OR NEW."orgId"<>OLD."orgId" OR NEW."masterBillId"<>OLD."masterBillId" OR NEW."createdByEmployeeId"<>OLD."createdByEmployeeId" OR NEW."createdAt"<>OLD."createdAt" OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'FREIGHT_INVALID_REVISION'; END IF;
 PERFORM 1 FROM "FreightBill" WHERE id=NEW."masterBillId" AND "orgId"=NEW."orgId" AND kind='MASTER' AND "deletedAt" IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FREIGHT_MASTER_SCOPE'; END IF;
 SELECT j.mode,j.service INTO source_mode,source_service FROM "FreightBill" b JOIN "FreightJob" j ON j.id=b."jobId" AND j."orgId"=b."orgId" WHERE b.id=NEW."masterBillId";
 IF current_job.mode<>source_mode OR current_job.service<>source_service THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
 IF NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightBill" WHERE "jobId"=NEW."jobId" AND "orgId"=NEW."orgId" AND "masterId"=NEW."masterBillId" AND "deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_HAS_HOUSES'; END IF;
 IF NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "ShippingChargeDraft" WHERE "jobId"=NEW."jobId" AND "orgId"=NEW."orgId" AND "billId"=NEW."masterBillId") THEN RAISE EXCEPTION 'FREIGHT_BILL_HAS_CHARGES'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightJobMaster_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightJobMaster" FOR EACH ROW EXECUTE FUNCTION baro_shared_master_link_guard();
CREATE OR REPLACE FUNCTION baro_shared_master_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId",before,after) VALUES(gen_random_uuid()::text,NEW."orgId",'master-links',NEW."jobId"||':'||NEW."masterBillId",NEW.version,NEW."updatedByEmployeeId",CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightJobMaster_audit" AFTER INSERT OR UPDATE ON "FreightJobMaster" FOR EACH ROW EXECUTE FUNCTION baro_shared_master_link_audit();
CREATE OR REPLACE FUNCTION baro_master_initial_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='MASTER' AND NEW."deletedAt" IS NULL THEN
 INSERT INTO "FreightJobMaster"("jobId","orgId","masterBillId","createdByEmployeeId","updatedByEmployeeId") VALUES(NEW."jobId",NEW."orgId",NEW.id,NEW."createdByEmployeeId",NEW."updatedByEmployeeId");
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightBill_initial_master_link" AFTER INSERT ON "FreightBill" FOR EACH ROW EXECUTE FUNCTION baro_master_initial_link();
CREATE OR REPLACE FUNCTION baro_shared_master_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.mode<>OLD.mode OR NEW.service<>OLD.service) AND EXISTS(SELECT 1 FROM "FreightJobMaster" WHERE "jobId"=NEW.id AND "orgId"=NEW."orgId" AND "deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightJob_shared_master_guard" BEFORE UPDATE ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_shared_master_job_guard();
-- Rollback: stop shared-master writes, retain both association history and all
-- original bill/job/FK/charge/document IDs. Do not restore the old same-job FK
-- while valid cross-job HBL references exist. No reset, name merge or ownership move.
