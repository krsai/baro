-- Operational forwarding data. Financial records remain in their existing ledgers.
CREATE TABLE "FreightMaster" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"number" TEXT NOT NULL,"mode" TEXT NOT NULL CHECK (mode IN ('SEA','AIR','ROAD')),
 "data" JSONB NOT NULL,"version" INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId"),UNIQUE("orgId","clientKey"),
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE "FreightDispatch" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"number" TEXT NOT NULL,
 "masterId" TEXT,"data" JSONB NOT NULL,"version" INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId"),UNIQUE("orgId","clientKey"),UNIQUE("orgId","number"),
 FOREIGN KEY("masterId","orgId") REFERENCES "FreightMaster"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE "FreightJob" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"number" TEXT NOT NULL,
 "customerId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "masterId" TEXT,"mode" TEXT NOT NULL CHECK(mode IN ('SEA','AIR','ROAD')),
 "service" TEXT NOT NULL CHECK(service IN ('GENERAL','EXPRESS')),
 "houseStatus" TEXT NOT NULL CHECK("houseStatus" IN ('NONE','HOUSE','UNKNOWN')),
 "houseNumber" TEXT,"status" TEXT NOT NULL CHECK(status IN ('DRAFT','BOOKED','IN_TRANSIT','ARRIVED','DELIVERED','CANCELLED')),
 "data" JSONB NOT NULL,"version" INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId"),UNIQUE("orgId","clientKey"),UNIQUE("orgId","number"),
 CHECK(("houseStatus"='HOUSE' AND length(trim("houseNumber"))>0) OR ("houseStatus"<>'HOUSE' AND "houseNumber" IS NULL)),
 FOREIGN KEY("masterId","orgId") REFERENCES "FreightMaster"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX "FreightJob_org_created_idx" ON "FreightJob"("orgId","createdAt",id);
CREATE INDEX "FreightJob_master_idx" ON "FreightJob"("masterId","orgId");
CREATE TABLE "FreightPackage" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,"dispatchId" TEXT,
 "label" TEXT NOT NULL,"quantity" INTEGER NOT NULL CHECK(quantity>0),
 "weightKg" NUMERIC(20,4) NOT NULL CHECK("weightKg">=0),"cbm" NUMERIC(20,6) NOT NULL CHECK(cbm>=0),
 "version" INTEGER NOT NULL DEFAULT 1,"createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 UNIQUE(id,"orgId"),UNIQUE("jobId","label"),
 FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("dispatchId","orgId") REFERENCES "FreightDispatch"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX "FreightPackage_dispatch_idx" ON "FreightPackage"("dispatchId","orgId");
CREATE TABLE "FreightAudit" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"entity" TEXT NOT NULL,"sourceId" TEXT NOT NULL,
 "version" INTEGER NOT NULL,"actorId" INTEGER NOT NULL,"before" JSONB,"after" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("orgId","entity","sourceId","version"),
 FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE "FreightDocument" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT,"dispatchId" TEXT,
 "clientKey" TEXT NOT NULL,"kind" TEXT NOT NULL CHECK(kind IN ('AN','DO','POD','MANIFEST','HOUSE_DRAFT')),
 "number" TEXT NOT NULL,"sourceVersion" INTEGER NOT NULL,"snapshot" JSONB NOT NULL,
 "createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("orgId","clientKey"),CHECK(("jobId" IS NULL)<>("dispatchId" IS NULL)),
 FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("dispatchId","orgId") REFERENCES "FreightDispatch"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE OR REPLACE FUNCTION baro_freight_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('FreightAudit','FreightDocument') THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='FreightAudit' THEN actor:=NEW."actorId";
 ELSIF TG_TABLE_NAME='FreightDocument' THEN actor:=NEW."createdByEmployeeId";
 ELSE actor:=NEW."updatedByEmployeeId"; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'FREIGHT_ACTOR_REQUIRED'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW."orgId"<>OLD."orgId" OR NEW."createdByEmployeeId"<>OLD."createdByEmployeeId" OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'FREIGHT_INVALID_REVISION'; END IF;
  IF TG_TABLE_NAME IN ('FreightJob','FreightMaster','FreightDispatch') THEN
   IF NEW."clientKey"<>OLD."clientKey" OR NEW."createdAt"<>OLD."createdAt" THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='FreightJob' THEN
  IF NOT EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=NEW."customerId" AND p.id<>NEW."orgId" AND p."isActive" AND (p."ownerOrgId"=NEW."orgId" OR p."dataOwnerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id))) THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
  IF NEW."masterId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "FreightMaster" WHERE id=NEW."masterId" AND "orgId"=NEW."orgId" AND mode=NEW.mode) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
  IF TG_OP='UPDATE' THEN
   IF EXISTS(SELECT 1 FROM "FreightPackage" p JOIN "FreightDispatch" d ON d.id=p."dispatchId" AND d."orgId"=p."orgId" JOIN "FreightMaster" m ON m.id=d."masterId" AND m."orgId"=d."orgId" WHERE p."jobId"=NEW.id AND p."orgId"=NEW."orgId" AND m.mode<>NEW.mode) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='FreightPackage' THEN
  IF EXISTS(SELECT 1 FROM "FreightDispatch" d JOIN "FreightMaster" m ON m.id=d."masterId" AND m."orgId"=d."orgId" JOIN "FreightJob" j ON j.id=NEW."jobId" AND j."orgId"=d."orgId" WHERE d.id=NEW."dispatchId" AND d."orgId"=NEW."orgId" AND m.mode<>j.mode) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
 END IF;
 IF TG_TABLE_NAME='FreightDispatch' THEN
  IF EXISTS(SELECT 1 FROM "FreightMaster" m JOIN "FreightPackage" p ON p."dispatchId"=NEW.id AND p."orgId"=m."orgId" JOIN "FreightJob" j ON j.id=p."jobId" AND j."orgId"=p."orgId" WHERE m.id=NEW."masterId" AND m."orgId"=NEW."orgId" AND j.mode<>m.mode) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
 END IF;
 IF TG_TABLE_NAME='FreightMaster' AND TG_OP='UPDATE' THEN
  IF NEW.mode<>OLD.mode AND EXISTS(SELECT 1 FROM "FreightJob" WHERE "masterId"=NEW.id AND mode<>NEW.mode) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
  IF EXISTS(SELECT 1 FROM "FreightDispatch" d JOIN "FreightPackage" p ON p."dispatchId"=d.id AND p."orgId"=d."orgId" JOIN "FreightJob" j ON j.id=p."jobId" AND j."orgId"=p."orgId" WHERE d."masterId"=NEW.id AND d."orgId"=NEW."orgId" AND j.mode<>NEW.mode) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightJob_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_freight_guard();
CREATE TRIGGER "FreightMaster_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightMaster" FOR EACH ROW EXECUTE FUNCTION baro_freight_guard();
CREATE TRIGGER "FreightDispatch_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightDispatch" FOR EACH ROW EXECUTE FUNCTION baro_freight_guard();
CREATE TRIGGER "FreightPackage_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightPackage" FOR EACH ROW EXECUTE FUNCTION baro_freight_guard();
CREATE TRIGGER "FreightAudit_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightAudit" FOR EACH ROW EXECUTE FUNCTION baro_freight_guard();
CREATE TRIGGER "FreightDocument_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightDocument" FOR EACH ROW EXECUTE FUNCTION baro_freight_guard();
