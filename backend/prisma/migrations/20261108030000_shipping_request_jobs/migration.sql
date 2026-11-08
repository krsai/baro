-- One FreightJob exists from submission. Receipt never copies or renumbers it.
-- Existing jobs, documents, exchange history and all financial values stay intact.
ALTER TABLE "FreightJob" ADD COLUMN IF NOT EXISTS "receiptStatus" TEXT NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE "FreightJob" ADD COLUMN IF NOT EXISTS "requesterOrgId" INTEGER;
ALTER TABLE "FreightJob" ADD COLUMN IF NOT EXISTS "requestCreatedByOrgId" INTEGER;
ALTER TABLE "FreightJob" ADD COLUMN IF NOT EXISTS "requestCreatedByEmployeeId" INTEGER;
ALTER TABLE "FreightJob" ADD COLUMN IF NOT EXISTS "requestSnapshot" JSONB;
ALTER TABLE "FreightJob" ADD COLUMN IF NOT EXISTS "sharedSnapshot" JSONB;
ALTER TABLE "FreightJob" ALTER COLUMN "createdByEmployeeId" DROP NOT NULL;
ALTER TABLE "FreightJob" ALTER COLUMN "updatedByEmployeeId" DROP NOT NULL;
ALTER TABLE "FreightJob" ADD CONSTRAINT "FreightJob_receipt_check" CHECK("receiptStatus" IN ('PENDING','ACCEPTED'));
ALTER TABLE "FreightJob" ADD CONSTRAINT "FreightJob_requester_fkey" FOREIGN KEY("requesterOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
ALTER TABLE "FreightJob" ADD CONSTRAINT "FreightJob_request_actor_fkey" FOREIGN KEY("requestCreatedByEmployeeId","requestCreatedByOrgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT;
CREATE INDEX "FreightJob_requester_idx" ON "FreightJob"("requesterOrgId","createdAt");
CREATE TABLE "ShippingRequestEvent"(
 id TEXT PRIMARY KEY,"jobId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"actorOrgId" INTEGER NOT NULL,"actorId" INTEGER NOT NULL,
 version INTEGER NOT NULL,action TEXT NOT NULL,snapshot JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("jobId",version),FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("actorId","actorOrgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX "ShippingRequestEvent_orgId_jobId_idx" ON "ShippingRequestEvent"("orgId","jobId");

CREATE FUNCTION baro_shipping_keys() RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$
 SELECT ARRAY['origin','destination','etd','eta','plannedDate','vessel','voyage','shipmentType','incoterms','incotermsPlace','pickupAddress','shipper','consignee','notify','cargo','marks','quantity','unit','weightKg','cbm','containerType','containerCount','dangerousGoodsDetails','deliveryDate','recipient','pickupRequired','dangerousGoods','workScope'];
$$;
CREATE FUNCTION baro_shipping_projection(mode TEXT,status TEXT,data JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT jsonb_build_object('mode',mode,'status',status,'data',COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(data) WHERE key=ANY(baro_shipping_keys())),'{}'::jsonb));
$$;
CREATE FUNCTION baro_shipping_customer_org(forwarder INTEGER,customer INTEGER) RETURNS INTEGER LANGUAGE plpgsql STABLE AS $$
DECLARE targets INTEGER[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=customer AND p."isActive" AND p.id<>forwarder AND (p."ownerOrgId"=forwarder OR p."dataOwnerOrgId"=forwarder OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=forwarder AND r."brandOrgId"=p.id))) THEN RETURN NULL; END IF;
 SELECT array_agg(DISTINCT id) INTO targets FROM (
 SELECT "targetOrgId" id FROM "CompanyPartnerLink" WHERE "orgId"=forwarder AND "entityId"=customer
 UNION SELECT c."anchorEntityId" FROM "CompanyIdentityLink" l JOIN "CompanyIdentity" c ON c.id=l."identityId" WHERE l."orgId"=forwarder AND l."entityId"=customer) t;
 IF COALESCE(cardinality(targets),0)>1 THEN RAISE EXCEPTION 'SHIPPING_CUSTOMER_AMBIGUOUS'; END IF;
 RETURN COALESCE(targets[1],customer);
END $$;

CREATE OR REPLACE FUNCTION baro_shipping_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor INTEGER; actor_org INTEGER; actor_id INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 actor_org:=COALESCE(NULLIF(current_setting('baro.shipping_actor_org',true),'')::integer,NEW."orgId");
 actor_id:=COALESCE(NULLIF(current_setting('baro.shipping_actor_id',true),'')::integer,NEW."updatedByEmployeeId");
 IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND type::text='SERVICE' AND "isActive") THEN RAISE EXCEPTION 'SHIPPING_OWNER_REQUIRED'; END IF;
 IF TG_OP='INSERT' AND NEW."requesterOrgId" IS NULL THEN
  NEW."requesterOrgId":=baro_shipping_customer_org(NEW."orgId",NEW."customerId");
  NEW."requestCreatedByOrgId":=NEW."orgId";NEW."requestCreatedByEmployeeId":=NEW."createdByEmployeeId";
  NEW."requestSnapshot":=baro_shipping_projection(NEW.mode,NEW.status,NEW.data);
 END IF;
 IF TG_OP='INSERT' AND actor_org=NEW."orgId" AND (NEW."receiptStatus"<>'ACCEPTED' OR NEW."requesterOrgId" IS DISTINCT FROM baro_shipping_customer_org(NEW."orgId",NEW."customerId") OR NEW."requestCreatedByOrgId" IS DISTINCT FROM NEW."orgId" OR NEW."requestCreatedByEmployeeId" IS DISTINCT FROM NEW."createdByEmployeeId") THEN RAISE EXCEPTION 'SHIPPING_ACTOR_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND OLD."requesterOrgId" IS NULL AND actor_org=NEW."orgId" THEN
 NEW."requesterOrgId":=baro_shipping_customer_org(NEW."orgId",NEW."customerId");NEW."requestCreatedByOrgId":=OLD."orgId";NEW."requestCreatedByEmployeeId":=OLD."createdByEmployeeId";NEW."requestSnapshot":=baro_shipping_projection(OLD.mode,OLD.status,OLD.data);
 END IF;
 IF TG_OP='UPDATE' AND ((NEW.id,NEW."orgId",NEW."clientKey",NEW."createdAt",NEW."createdByEmployeeId") IS DISTINCT FROM (OLD.id,OLD."orgId",OLD."clientKey",OLD."createdAt",OLD."createdByEmployeeId") OR OLD."requesterOrgId" IS NOT NULL AND (NEW."requesterOrgId",NEW."requestCreatedByOrgId",NEW."requestCreatedByEmployeeId") IS DISTINCT FROM (OLD."requesterOrgId",OLD."requestCreatedByOrgId",OLD."requestCreatedByEmployeeId")) THEN RAISE EXCEPTION 'SHIPPING_IDENTITY_IMMUTABLE'; END IF;
 IF NEW."receiptStatus"='PENDING' AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'SHIPPING_NOT_ACCEPTED'; END IF;
 IF TG_OP='UPDATE' AND OLD."requesterOrgId" IS NOT NULL AND baro_shipping_customer_org(NEW."orgId",NEW."customerId") IS DISTINCT FROM OLD."requesterOrgId" THEN RAISE EXCEPTION 'SHIPPING_CUSTOMER_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND actor_org=NEW."orgId" AND NEW."receiptStatus"='PENDING' THEN NEW."requestSnapshot":=baro_shipping_projection(NEW.mode,'DRAFT',NEW.data); END IF;
 IF TG_OP='UPDATE' AND OLD."receiptStatus"='ACCEPTED' AND NEW."receiptStatus"<>'ACCEPTED' THEN RAISE EXCEPTION 'SHIPPING_RECEIPT_IMMUTABLE'; END IF;
 IF actor_org<>NEW."orgId" THEN
  IF actor_org IS DISTINCT FROM NEW."requesterOrgId" OR NEW."receiptStatus"<>'PENDING' OR NEW.status<>'DRAFT'
   OR NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=actor_org AND "isActive" AND type::text='MANUFACTURER' AND "ownerOrgId" IS NULL)
   OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor_id AND "orgId"=actor_org AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR'))
   OR baro_shipping_customer_org(NEW."orgId",NEW."customerId") IS DISTINCT FROM actor_org
   OR NEW."masterId" IS NOT NULL OR NEW."houseStatus"<>'NONE' OR NEW."houseNumber" IS NOT NULL
   THEN RAISE EXCEPTION 'SHIPPING_REQUEST_SCOPE'; END IF;
  IF TG_OP='INSERT' AND (NEW."createdByEmployeeId" IS NOT NULL OR NEW."updatedByEmployeeId" IS NOT NULL OR NEW."requestCreatedByOrgId"<>actor_org OR NEW."requestCreatedByEmployeeId"<>actor_id) THEN RAISE EXCEPTION 'SHIPPING_ACTOR_REQUIRED'; END IF;
  IF TG_OP='UPDATE' AND (OLD."receiptStatus"<>'PENDING' OR NEW.version<>OLD.version+1 OR NEW."customerId"<>OLD."customerId" OR NEW."updatedByEmployeeId" IS DISTINCT FROM OLD."updatedByEmployeeId" OR NEW."sharedSnapshot" IS DISTINCT FROM OLD."sharedSnapshot" OR (NEW.data-baro_shipping_keys()) IS DISTINCT FROM (OLD.data-baro_shipping_keys())) THEN RAISE EXCEPTION 'SHIPPING_REQUEST_SCOPE'; END IF;
  IF NEW."requestSnapshot" IS DISTINCT FROM baro_shipping_projection(NEW.mode,'DRAFT',NEW.data) THEN RAISE EXCEPTION 'SHIPPING_PUBLIC_FIELDS_REQUIRED'; END IF;
  RETURN NEW;
 END IF;
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
DROP TRIGGER "FreightJob_guard" ON "FreightJob";
CREATE TRIGGER "FreightJob_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_shipping_job_guard();

CREATE FUNCTION baro_shipping_event_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FreightJob" j JOIN "Employee" e ON e.id=NEW."actorId" AND e."orgId"=NEW."actorOrgId" AND e.status::text='ACTIVE'
 WHERE j.id=NEW."jobId" AND j."orgId"=NEW."orgId" AND j.version=NEW.version AND NEW."actorOrgId" IN(j."orgId",j."requesterOrgId")) THEN RAISE EXCEPTION 'SHIPPING_ACTOR_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ShippingRequestEvent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingRequestEvent" FOR EACH ROW EXECUTE FUNCTION baro_shipping_event_guard();
CREATE FUNCTION baro_shipping_job_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE actor_org INTEGER; actor_id INTEGER;
BEGIN
 IF NEW."requesterOrgId" IS NULL THEN RETURN NEW; END IF;
 actor_org:=COALESCE(NULLIF(current_setting('baro.shipping_actor_org',true),'')::integer,NEW."orgId");
 actor_id:=COALESCE(NULLIF(current_setting('baro.shipping_actor_id',true),'')::integer,NEW."updatedByEmployeeId");
 INSERT INTO "ShippingRequestEvent"(id,"jobId","orgId","actorOrgId","actorId",version,action,snapshot)
 VALUES(NEW.id||':'||NEW.version,NEW.id,NEW."orgId",actor_org,actor_id,NEW.version,
 CASE WHEN TG_OP='INSERT' THEN 'CREATED' WHEN NEW."receiptStatus" IS DISTINCT FROM OLD."receiptStatus" THEN 'ACCEPTED' WHEN NEW."sharedSnapshot" IS DISTINCT FROM OLD."sharedSnapshot" THEN 'PUBLISHED' ELSE 'UPDATED' END,
 jsonb_build_object('receiptStatus',NEW."receiptStatus",'request',NEW."requestSnapshot",'shared',NEW."sharedSnapshot"));
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightJob_shipping_event" AFTER INSERT OR UPDATE ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_shipping_job_event();
CREATE FUNCTION baro_shipping_pending_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."jobId" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" AND "receiptStatus"='PENDING') THEN RAISE EXCEPTION 'SHIPPING_NOT_ACCEPTED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightBill_shipping_pending" BEFORE INSERT OR UPDATE ON "FreightBill" FOR EACH ROW EXECUTE FUNCTION baro_shipping_pending_guard();
CREATE TRIGGER "FreightPackage_shipping_pending" BEFORE INSERT OR UPDATE ON "FreightPackage" FOR EACH ROW EXECUTE FUNCTION baro_shipping_pending_guard();
CREATE TRIGGER "FreightDocument_shipping_pending" BEFORE INSERT ON "FreightDocument" FOR EACH ROW EXECUTE FUNCTION baro_shipping_pending_guard();

-- Private preparation material only: no expense, invoice or ledger posting.
CREATE TABLE "ShippingChargeDraft"(
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN('PURCHASE','SALES')),
 description TEXT NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 500),"currencyCode" TEXT NOT NULL REFERENCES "Currency"(code),
 amount NUMERIC(24,4) NOT NULL CHECK(amount>=0),version INTEGER NOT NULL DEFAULT 1,
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"orgId","jobId"),FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX "ShippingChargeDraft_orgId_jobId_idx" ON "ShippingChargeDraft"("orgId","jobId");
CREATE FUNCTION baro_shipping_charge_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FreightJob" j JOIN "Employee" e ON e."orgId"=j."orgId" AND e.id=NEW."updatedByEmployeeId" AND e.status::text='ACTIVE' AND e."orgRole"::text IN('ADMIN','ACCOUNTANT','OPERATOR') WHERE j.id=NEW."jobId" AND j."orgId"=NEW."orgId" AND j."receiptStatus"='ACCEPTED' AND j.status<>'CANCELLED') THEN RAISE EXCEPTION 'SHIPPING_CHARGE_SCOPE'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.id,NEW."orgId",NEW."jobId",NEW."createdByEmployeeId",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."orgId",OLD."jobId",OLD."createdByEmployeeId",OLD."createdAt") OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'SHIPPING_CHANGED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ShippingChargeDraft_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingChargeDraft" FOR EACH ROW EXECUTE FUNCTION baro_shipping_charge_guard();

ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_shipping_scope_key" UNIQUE(id,"orgId","jobId");
CREATE TABLE "ShippingDocumentShare"(
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,"documentId" TEXT NOT NULL,snapshot JSONB NOT NULL,"createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("jobId","documentId"),FOREIGN KEY("documentId","orgId","jobId") REFERENCES "FreightDocument"(id,"orgId","jobId") ON DELETE RESTRICT,
 FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE FUNCTION baro_shipping_document_share_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FreightJob" j JOIN "Employee" e ON e.id=NEW."createdByEmployeeId" AND e."orgId"=j."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text IN('ADMIN','OPERATOR','ACCOUNTANT') WHERE j.id=NEW."jobId" AND j."orgId"=NEW."orgId" AND j."receiptStatus"='ACCEPTED' AND j."requesterOrgId" IS NOT NULL) THEN RAISE EXCEPTION 'SHIPPING_REQUEST_SCOPE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ShippingDocumentShare_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingDocumentShare" FOR EACH ROW EXECUTE FUNCTION baro_shipping_document_share_guard();
