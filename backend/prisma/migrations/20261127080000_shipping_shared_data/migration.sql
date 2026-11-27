-- Current same-company SR revisions may follow common business edits. Existing
-- printed/shared copies and foreign-owned SRs remain protected.
CREATE OR REPLACE FUNCTION baro_shipping_shared_fields_v1() RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$ SELECT ARRAY['shipper','consignee','notify','vessel','voyage','etd','eta','origin','destination','placeOfReceipt','placeOfDelivery','cargo','marks','quantity','unit','weightKg','cbm','cbmFormula','freightTerms','incoterms','billTo','containers']::text[] $$;

CREATE OR REPLACE FUNCTION baro_shipping_shared_snapshot_allowed(old_request JSONB,new_request JSONB,new_data JSONB) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$
 SELECT COALESCE(jsonb_typeof(new_request->'data')='object' AND (new_request-'data')=(old_request-'data') AND NOT EXISTS(
  SELECT 1 FROM jsonb_each(COALESCE(old_request->'data','{}'::jsonb)||COALESCE(new_request->'data','{}'::jsonb)) AS field
  WHERE old_request->'data'->field.key IS DISTINCT FROM new_request->'data'->field.key AND (
   NOT field.key=ANY(baro_shipping_shared_fields_v1()||ARRAY['plannedDate','routeLocations','routeLocationDetails','originPortCode','destinationPortCode','workScope','shipperParty','consigneeParty','notifyParty','notifySameAsConsignee']) OR
   new_request->'data'->field.key IS DISTINCT FROM CASE WHEN field.key IN ('shipperParty','consigneeParty','notifyParty') THEN (SELECT jsonb_object_agg(k,v) FROM jsonb_each(new_data->field.key) AS p(k,v) WHERE k IN ('name','address','contactName','phone','email')) ELSE new_data->field.key END
  )
 ),false);
$$;
CREATE OR REPLACE FUNCTION baro_shipping_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor INTEGER; actor_org INTEGER; actor_id INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN IF baro_shipping_delete_allowed(OLD.id) THEN RETURN OLD; END IF; RAISE EXCEPTION 'SHIPPING_DELETE_BLOCKED'; END IF;
 actor_org:=COALESCE(NULLIF(current_setting('baro.shipping_actor_org',true),'')::integer,NEW."orgId");
 actor_id:=COALESCE(NULLIF(current_setting('baro.shipping_actor_id',true),'')::integer,NEW."updatedByEmployeeId");
 IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND type::text='SERVICE' AND "isActive") THEN RAISE EXCEPTION 'SHIPPING_OWNER_REQUIRED'; END IF;
 IF TG_OP='INSERT' AND NEW."requesterOrgId" IS NULL THEN
  NEW."requesterOrgId":=baro_shipping_customer_org(NEW."orgId",NEW."customerId");
  NEW."requestCreatedByOrgId":=NEW."orgId";NEW."requestCreatedByEmployeeId":=NEW."createdByEmployeeId";
  NEW."requestSnapshot":=baro_shipping_projection(NEW.mode,NEW.status,NEW.data);
 END IF;
 IF TG_OP='INSERT' AND actor_org=NEW."orgId" AND (NEW."receiptStatus"<>'ACCEPTED' OR NEW."requesterOrgId" IS DISTINCT FROM baro_shipping_customer_org(NEW."orgId",NEW."customerId") OR NEW."requestCreatedByOrgId" IS DISTINCT FROM NEW."orgId" OR NEW."requestCreatedByEmployeeId" IS DISTINCT FROM NEW."createdByEmployeeId") THEN RAISE EXCEPTION 'SHIPPING_ACTOR_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND OLD."requesterOrgId" IS NULL AND OLD."requestCreatedByOrgId" IS NULL AND actor_org=NEW."orgId" AND NEW."receiptStatus"<>'REJECTED' THEN
 NEW."requesterOrgId":=baro_shipping_customer_org(OLD."orgId",OLD."customerId");NEW."requestCreatedByOrgId":=OLD."orgId";NEW."requestCreatedByEmployeeId":=OLD."createdByEmployeeId";NEW."requestSnapshot":=baro_shipping_projection(OLD.mode,OLD.status,OLD.data);
 END IF;
 IF TG_OP='UPDATE' AND ((NEW.id,NEW."orgId",NEW."clientKey",NEW."createdAt",NEW."createdByEmployeeId") IS DISTINCT FROM (OLD.id,OLD."orgId",OLD."clientKey",OLD."createdAt",OLD."createdByEmployeeId") OR (OLD."requesterOrgId" IS NOT NULL OR OLD."requestCreatedByOrgId" IS NOT NULL) AND (NEW."requesterOrgId",NEW."requestCreatedByOrgId",NEW."requestCreatedByEmployeeId") IS DISTINCT FROM (OLD."requesterOrgId",OLD."requestCreatedByOrgId",OLD."requestCreatedByEmployeeId")) THEN RAISE EXCEPTION 'SHIPPING_IDENTITY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND OLD."receiptStatus"='ACCEPTED' AND COALESCE(OLD."requestCreatedByOrgId",OLD."orgId")=OLD."orgId" AND NEW."requestSnapshot" IS DISTINCT FROM OLD."requestSnapshot" AND NOT baro_shipping_shared_snapshot_allowed(OLD."requestSnapshot",NEW."requestSnapshot",NEW.data) THEN RAISE EXCEPTION 'SHIPPING_PUBLIC_FIELDS_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND NEW."customerId" IS DISTINCT FROM OLD."customerId" AND (actor_org<>OLD."orgId" OR NOT baro_shipping_customer_change_allowed(OLD.id,NEW."customerId",NEW."updatedByEmployeeId") OR NEW.version<>OLD.version+1 OR (NEW."requestSnapshot" IS DISTINCT FROM OLD."requestSnapshot" AND COALESCE(OLD."requestCreatedByOrgId",OLD."orgId")<>OLD."orgId") OR NEW."sharedSnapshot" IS DISTINCT FROM OLD."sharedSnapshot") THEN RAISE EXCEPTION 'SHIPPING_CUSTOMER_IMMUTABLE'; END IF;
 IF NEW."receiptStatus"='PENDING' AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'SHIPPING_NOT_ACCEPTED'; END IF;
 IF TG_OP='UPDATE' AND OLD."receiptStatus"<>'ACCEPTED' AND OLD."requesterOrgId" IS NOT NULL AND baro_shipping_customer_org(NEW."orgId",NEW."customerId") IS DISTINCT FROM OLD."requesterOrgId" THEN RAISE EXCEPTION 'SHIPPING_CUSTOMER_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND actor_org=NEW."orgId" AND NEW."receiptStatus"='PENDING' THEN NEW."requestSnapshot":=baro_shipping_projection(NEW.mode,'DRAFT',NEW.data); END IF;
 IF TG_OP='UPDATE' AND NEW."receiptStatus"='REJECTED' THEN
 IF actor_org<>OLD."orgId" OR OLD."receiptStatus"<>'ACCEPTED' OR OLD.status<>'DRAFT' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['receiptStatus','updatedByEmployeeId','updatedAt','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['receiptStatus','updatedByEmployeeId','updatedAt','version']) OR baro_shipping_has_dependents(OLD.id) THEN RAISE EXCEPTION 'SHIPPING_REJECT_BLOCKED'; END IF;
 ELSIF TG_OP='UPDATE' AND OLD."receiptStatus" IN ('ACCEPTED','REJECTED') AND NEW."receiptStatus"<>OLD."receiptStatus" THEN RAISE EXCEPTION 'SHIPPING_RECEIPT_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND OLD."receiptStatus"='REJECTED' THEN RAISE EXCEPTION 'SHIPPING_REJECT_BLOCKED'; END IF;
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
-- Rollback: disable shared edits in the application; retain current values, history and guards. No data backfill or snapshot rewrite.

CREATE OR REPLACE FUNCTION baro_shipping_operation_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."receiptStatus"='ACCEPTED' AND COALESCE(OLD."requestCreatedByOrgId",OLD."orgId")<>OLD."orgId" THEN NEW."requestSnapshot":=OLD."requestSnapshot"; END IF;
 RETURN NEW;
END $$;
