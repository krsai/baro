-- Finished-goods shipment records are independent of production, stock and billing.
CREATE TABLE "OrderShippingPolicy" (
 "orgId" INTEGER NOT NULL,"workOrderId" INTEGER PRIMARY KEY,excluded BOOLEAN NOT NULL DEFAULT false,
 reason TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,"updatedByEmployeeId" INTEGER NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("workOrderId","orgId") REFERENCES "WorkOrder"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY ("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CHECK(version>0 AND (NOT excluded OR length(trim(reason)) BETWEEN 1 AND 1000))
);
CREATE TABLE "OrderShippingPolicyEvent" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"workOrderId" INTEGER NOT NULL,"clientKey" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,snapshot JSONB NOT NULL,"actorId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("orgId","clientKey"),
 FOREIGN KEY ("workOrderId","orgId") REFERENCES "WorkOrder"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY ("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE "OrderShipment" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"workOrderId" INTEGER NOT NULL,"clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 "shipmentDate" TEXT NOT NULL,remark TEXT NOT NULL DEFAULT '',lines JSONB NOT NULL,
 "createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "cancelledAt" TIMESTAMP(3),"cancelledByEmployeeId" INTEGER,"cancellationReason" TEXT,version INTEGER NOT NULL DEFAULT 1,
 UNIQUE("orgId","clientKey"),
 FOREIGN KEY ("workOrderId","orgId") REFERENCES "WorkOrder"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY ("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY ("cancelledByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 2000),
 CHECK(("cancelledAt" IS NULL AND "cancelledByEmployeeId" IS NULL AND "cancellationReason" IS NULL AND version=1) OR ("cancelledAt" IS NOT NULL AND "cancelledByEmployeeId" IS NOT NULL AND length(trim("cancellationReason")) BETWEEN 1 AND 1000 AND version=2))
);
CREATE INDEX "OrderShipment_order_idx" ON "OrderShipment"("orgId","workOrderId","cancelledAt");
CREATE OR REPLACE FUNCTION baro_order_shipping_actor(company INTEGER,actor INTEGER) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE o.id=company AND o.type='MANUFACTURER' AND o."isActive" AND o."ownerOrgId" IS NULL AND e.id=actor AND e.status='ACTIVE' AND e."orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT'))
$$;
CREATE OR REPLACE FUNCTION baro_order_shipment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cell JSONB; item "WorkOrderItem"%ROWTYPE; used BIGINT; ordered BIGINT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 PERFORM id FROM "WorkOrder" WHERE id=NEW."workOrderId" AND "orgId"=NEW."orgId" AND COALESCE("sellerOrgId","orgId")=NEW."orgId" FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SHIPPING_ORDER_SCOPE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['cancelledAt','cancelledByEmployeeId','cancellationReason','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['cancelledAt','cancelledByEmployeeId','cancellationReason','version']) OR OLD."cancelledAt" IS NOT NULL OR NEW."cancelledAt" IS NULL OR NEW.version<>OLD.version+1 OR NOT baro_order_shipping_actor(NEW."orgId",NEW."cancelledByEmployeeId") THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF;
 IF NOT baro_order_shipping_actor(NEW."orgId",NEW."createdByEmployeeId") OR NEW."cancelledAt" IS NOT NULL OR EXISTS(SELECT 1 FROM "OrderShippingPolicy" WHERE "workOrderId"=NEW."workOrderId" AND excluded) THEN RAISE EXCEPTION 'SHIPPING_EXCLUDED_OR_DENIED'; END IF;
 IF NEW."shipmentDate"!~'^\d{4}-\d{2}-\d{2}$' OR to_char(NEW."shipmentDate"::date,'YYYY-MM-DD')<>NEW."shipmentDate" THEN RAISE EXCEPTION 'SHIPPING_INVALID_DATE'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.lines))<>(SELECT count(DISTINCT (c->>'itemId',c->>'size')) FROM jsonb_array_elements(NEW.lines) c) THEN RAISE EXCEPTION 'SHIPPING_INVALID_LINES'; END IF;
 FOR cell IN SELECT * FROM jsonb_array_elements(NEW.lines) LOOP
  IF NOT COALESCE(cell->>'itemId'~'^[1-9][0-9]*$',false) OR NOT COALESCE(cell->>'quantity'~'^[1-9][0-9]*$',false) OR COALESCE(length(cell->>'size'),0) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'SHIPPING_INVALID_LINES'; END IF;
  SELECT * INTO item FROM "WorkOrderItem" WHERE id=(cell->>'itemId')::integer AND "workOrderId"=NEW."workOrderId";
  IF NOT FOUND OR jsonb_typeof(item."sizeQuantities"->(cell->>'size')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'SHIPPING_INVALID_LINES'; END IF;
  ordered:=(item."sizeQuantities"->>(cell->>'size'))::bigint;
  SELECT COALESCE(sum((c->>'quantity')::bigint),0) INTO used FROM "OrderShipment" s CROSS JOIN LATERAL jsonb_array_elements(s.lines) c WHERE s."workOrderId"=NEW."workOrderId" AND s."orgId"=NEW."orgId" AND s."cancelledAt" IS NULL AND c->>'itemId'=cell->>'itemId' AND c->>'size'=cell->>'size';
  IF used+(cell->>'quantity')::bigint>ordered THEN RAISE EXCEPTION 'SHIPPING_EXCEEDS_ORDER'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER "OrderShipment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OrderShipment" FOR EACH ROW EXECUTE FUNCTION baro_order_shipment_guard();
CREATE OR REPLACE FUNCTION baro_order_shipping_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cell JSONB; used BIGINT;
BEGIN
 PERFORM id FROM "WorkOrder" WHERE id=OLD."workOrderId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "OrderShipment" s CROSS JOIN LATERAL jsonb_array_elements(s.lines) c WHERE s."workOrderId"=OLD."workOrderId" AND s."cancelledAt" IS NULL AND c->>'itemId'=OLD.id::text) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_ORDER_ITEM_IN_USE'; END IF;
 IF ROW(NEW."workOrderId",NEW."styleId",NEW."colorId",NEW.gender) IS DISTINCT FROM ROW(OLD."workOrderId",OLD."styleId",OLD."colorId",OLD.gender) THEN RAISE EXCEPTION 'SHIPPING_ORDER_ITEM_IN_USE'; END IF;
 FOR cell IN SELECT c FROM "OrderShipment" s CROSS JOIN LATERAL jsonb_array_elements(s.lines) c WHERE s."workOrderId"=OLD."workOrderId" AND s."cancelledAt" IS NULL AND c->>'itemId'=OLD.id::text LOOP
  SELECT sum((c->>'quantity')::bigint) INTO used FROM "OrderShipment" s CROSS JOIN LATERAL jsonb_array_elements(s.lines) c WHERE s."workOrderId"=OLD."workOrderId" AND s."cancelledAt" IS NULL AND c->>'itemId'=OLD.id::text AND c->>'size'=cell->>'size';
  IF COALESCE((NEW."sizeQuantities"->>(cell->>'size'))::bigint,0)<used THEN RAISE EXCEPTION 'SHIPPING_EXCEEDS_ORDER'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER "WorkOrderItem_shipping_guard" BEFORE UPDATE OR DELETE ON "WorkOrderItem" FOR EACH ROW EXECUTE FUNCTION baro_order_shipping_item_guard();
CREATE OR REPLACE FUNCTION baro_order_shipping_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT baro_order_shipping_actor(NEW."orgId",NEW."actorId") THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "OrderShippingPolicyEvent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OrderShippingPolicyEvent" FOR EACH ROW EXECUTE FUNCTION baro_order_shipping_event_guard();
CREATE OR REPLACE FUNCTION baro_order_shipping_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 PERFORM id FROM "WorkOrder" WHERE id=NEW."workOrderId" AND "orgId"=NEW."orgId" AND COALESCE("sellerOrgId","orgId")=NEW."orgId" FOR UPDATE;
 IF NOT FOUND OR NOT baro_order_shipping_actor(NEW."orgId",NEW."updatedByEmployeeId") THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
 IF TG_OP='UPDATE' AND (NEW."orgId"<>OLD."orgId" OR NEW."workOrderId"<>OLD."workOrderId" OR NEW.version<>OLD.version+1) OR TG_OP='INSERT' AND NEW.version<>COALESCE((SELECT version+1 FROM "OrderShippingPolicy" WHERE "workOrderId"=NEW."workOrderId"),1) THEN RAISE EXCEPTION 'SHIPPING_CHANGED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "OrderShippingPolicy_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OrderShippingPolicy" FOR EACH ROW EXECUTE FUNCTION baro_order_shipping_policy_guard();
CREATE OR REPLACE FUNCTION baro_order_shipping_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OrderShippingPolicyEvent" e WHERE e."workOrderId"=NEW."workOrderId" AND e."orgId"=NEW."orgId" AND e."actorId"=NEW."updatedByEmployeeId" AND (e.snapshot->>'version')::integer=NEW.version AND (e.snapshot->>'excluded')::boolean=NEW.excluded AND e.snapshot->>'reason'=NEW.reason) THEN RAISE EXCEPTION 'SHIPPING_POLICY_AUDIT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "OrderShippingPolicy_audit_guard" AFTER INSERT OR UPDATE ON "OrderShippingPolicy" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_order_shipping_policy_audit();
