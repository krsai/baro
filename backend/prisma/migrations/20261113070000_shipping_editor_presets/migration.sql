-- Additive customer-scoped address book; never rewrites existing jobs/snapshots.
CREATE TABLE IF NOT EXISTS "ShippingPreset" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"customerId" INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('PARTY','LOCATION')),label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 200),data JSONB NOT NULL,"partyId" INTEGER,
 version INTEGER NOT NULL DEFAULT 1,"deletedAt" TIMESTAMP(3),
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ShippingPreset_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ShippingPreset_customer_fkey" FOREIGN KEY("customerId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ShippingPreset_party_fkey" FOREIGN KEY("partyId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "ShippingPreset_creator_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "ShippingPreset_actor_fkey" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ShippingPreset_customer_idx" ON "ShippingPreset"("orgId","customerId",kind);
-- Prisma's empty-schema fixture may already have the table. Register the same
-- real FKs there as on upgrades; retries preserve every preset and audit row.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPreset_org_fkey') THEN ALTER TABLE "ShippingPreset" ADD CONSTRAINT "ShippingPreset_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPreset_customer_fkey') THEN ALTER TABLE "ShippingPreset" ADD CONSTRAINT "ShippingPreset_customer_fkey" FOREIGN KEY("customerId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPreset_party_fkey') THEN ALTER TABLE "ShippingPreset" ADD CONSTRAINT "ShippingPreset_party_fkey" FOREIGN KEY("partyId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPreset_creator_fkey') THEN ALTER TABLE "ShippingPreset" ADD CONSTRAINT "ShippingPreset_creator_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPreset_actor_fkey') THEN ALTER TABLE "ShippingPreset" ADD CONSTRAINT "ShippingPreset_actor_fkey" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT; END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_shipping_preset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE e.id=NEW."updatedByEmployeeId" AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT') AND o."isActive" AND o.type::text IN ('SERVICE','MANUFACTURER','BRAND')) THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Organization" o WHERE o.id=NEW."orgId" AND ((o.type::text IN ('MANUFACTURER','BRAND') AND NEW."customerId"=o.id) OR (o.type::text='SERVICE' AND NEW."customerId"<>o.id AND EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=NEW."customerId" AND p."isActive" AND (p."ownerOrgId"=o.id OR p."dataOwnerOrgId"=o.id OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=o.id AND r."brandOrgId"=p.id)))))) THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
 IF NEW."partyId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=NEW."partyId" AND p."isActive" AND (p.id=NEW."orgId" OR p."ownerOrgId"=NEW."orgId" OR p."dataOwnerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id))) THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.id,NEW."orgId",NEW."customerId",NEW.kind,NEW."createdByEmployeeId",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."orgId",OLD."customerId",OLD.kind,OLD."createdByEmployeeId",OLD."createdAt") OR NEW.version<>OLD.version+1 OR OLD."deletedAt" IS NOT NULL) THEN RAISE EXCEPTION 'SHIPPING_CHANGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingPreset_guard" ON "ShippingPreset";
CREATE TRIGGER "ShippingPreset_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingPreset" FOR EACH ROW EXECUTE FUNCTION baro_shipping_preset_guard();

CREATE OR REPLACE FUNCTION baro_shipping_keys() RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$
 SELECT ARRAY['origin','destination','etd','eta','plannedDate','vessel','voyage','shipmentType','incoterms','incotermsPlace','pickupAddress','shipper','consignee','notify','cargo','marks','quantity','unit','weightKg','cbm','containerType','containerCount','dangerousGoodsDetails','deliveryDate','recipient','pickupRequired','dangerousGoods','workScope','transportService','customerRole','notifySameAsConsignee','shipperParty','consigneeParty','notifyParty','cargoSchemaVersion','containers','packages','outOfGauge','oogDetails'];
$$;
-- Old party JSON was not part of the shared projection. Do not retroactively
-- expose it; the new form explicitly opts into its document/contact snapshot.
CREATE OR REPLACE FUNCTION baro_shipping_projection(mode TEXT,status TEXT,data JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT jsonb_build_object('mode',mode,'status',status,'data',COALESCE((SELECT jsonb_object_agg(key,
 CASE WHEN key IN ('shipperParty','consigneeParty','notifyParty') THEN (SELECT jsonb_object_agg(p.key,p.value) FROM jsonb_each(value) p WHERE p.key IN ('name','address','contactName','phone','email')) ELSE value END)
 FROM jsonb_each(data) WHERE key=ANY(baro_shipping_keys()) AND (data->'cargoSchemaVersion'='1'::jsonb OR key NOT IN ('shipperParty','consigneeParty','notifyParty'))),'{}'::jsonb));
$$;

-- Preserve all receipt, ownership, revision and privacy checks; permit brand requesters.
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
   OR NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=actor_org AND "isActive" AND type::text IN ('MANUFACTURER','BRAND') AND "ownerOrgId" IS NULL)
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
