-- Order target settings only: every active ADMIN grade; no required reason.
CREATE OR REPLACE FUNCTION baro_order_target_admin(organization_id integer,actor_id integer) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" LEFT JOIN "SystemSetting" p ON p.key='ROLE_ACCESS_POLICY' WHERE e.id=actor_id AND e."orgId"=organization_id AND e.status::text='ACTIVE' AND e."orgRole"::text='ADMIN' AND o.type::text='MANUFACTURER' AND o."isActive" AND o."ownerOrgId" IS NULL AND CASE WHEN jsonb_typeof(p.value->(o.type::text)->(e."orgRole"::text))='array' THEN (p.value->(o.type::text)->(e."orgRole"::text)) ? 'ORDER' ELSE true END);
$$;
CREATE OR REPLACE FUNCTION baro_order_invoice_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_id integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'TARGET_HISTORY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='OrderInvoicePolicyEvent' THEN
  actor_id:=NEW."actorId";
  IF TG_OP<>'INSERT' OR NOT EXISTS(SELECT 1 FROM "OrderInvoicePolicy" p WHERE p."workOrderId"=NEW."workOrderId" AND p."orgId"=NEW."orgId" AND p.revision=NEW.revision AND p.excluded=NEW.excluded AND p."updatedByEmployeeId"=NEW."actorId") OR length(trim(NEW.reason)) NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'TARGET_CHANGED'; END IF;
 ELSE
  actor_id:=NEW."updatedByEmployeeId";
  PERFORM id FROM "WorkOrder" WHERE id=NEW."workOrderId" AND "sellerOrgId"=NEW."orgId" FOR UPDATE;
  IF NOT FOUND OR NEW.revision<1 OR (TG_OP='INSERT' AND NEW.revision<>1) OR (TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR NEW."orgId"<>OLD."orgId" OR NEW."workOrderId"<>OLD."workOrderId")) THEN RAISE EXCEPTION 'TARGET_CHANGED'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" LEFT JOIN "SystemSetting" p ON p.key='ROLE_ACCESS_POLICY' WHERE e.id=actor_id AND e."orgId"=NEW."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text='ADMIN' AND o.type::text='MANUFACTURER' AND o."isActive" AND o."ownerOrgId" IS NULL AND CASE WHEN jsonb_typeof(p.value->(o.type::text)->(e."orgRole"::text))='array' THEN (p.value->(o.type::text)->(e."orgRole"::text)) ? 'ORDER' ELSE true END) THEN RAISE EXCEPTION 'TARGET_ACCESS_DENIED'; END IF;
 -- Touch only management metadata so a concurrent Serializable issuer retries;
 -- the order's business updatedAt and all commercial fields stay unchanged.
 IF TG_TABLE_NAME='OrderInvoicePolicy' THEN UPDATE "WorkOrder" SET "invoiceTargetRevision"=NEW.revision WHERE id=NEW."workOrderId"; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_order_shipping_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT baro_order_target_admin(NEW."orgId",NEW."actorId") THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_order_shipping_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 PERFORM id FROM "WorkOrder" WHERE id=NEW."workOrderId" AND "orgId"=NEW."orgId" AND COALESCE("sellerOrgId","orgId")=NEW."orgId" FOR UPDATE;
 IF NOT FOUND OR NOT baro_order_target_admin(NEW."orgId",NEW."updatedByEmployeeId") THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
 IF TG_OP='UPDATE' AND (NEW."orgId"<>OLD."orgId" OR NEW."workOrderId"<>OLD."workOrderId" OR NEW.version<>OLD.version+1) OR TG_OP='INSERT' AND NEW.version<>COALESCE((SELECT version+1 FROM "OrderShippingPolicy" WHERE "workOrderId"=NEW."workOrderId"),1) THEN RAISE EXCEPTION 'SHIPPING_CHANGED'; END IF;
 RETURN NEW;
END $$;

ALTER TABLE "OrderShippingPolicy" DROP CONSTRAINT IF EXISTS "OrderShippingPolicy_check";
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='OrderShippingPolicy_target_check') THEN ALTER TABLE "OrderShippingPolicy" ADD CONSTRAINT "OrderShippingPolicy_target_check" CHECK(version>0 AND length(reason)<=1000); END IF; END $$;
