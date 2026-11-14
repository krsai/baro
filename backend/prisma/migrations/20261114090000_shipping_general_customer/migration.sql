-- Only an explicit general-customer SR save creates a local collection partner.
-- Do not seed, match by name, relink, or rewrite existing organizations/jobs/snapshots.
CREATE TABLE IF NOT EXISTS "ShippingGeneralCustomer" (
 "orgId" INTEGER PRIMARY KEY,"customerId" INTEGER NOT NULL,"createdByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingGeneralCustomer_customer_key" ON "ShippingGeneralCustomer"("customerId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingGeneralCustomer_org_fkey') THEN
  ALTER TABLE "ShippingGeneralCustomer" ADD CONSTRAINT "ShippingGeneralCustomer_org_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingGeneralCustomer_customer_fkey') THEN
  ALTER TABLE "ShippingGeneralCustomer" ADD CONSTRAINT "ShippingGeneralCustomer_customer_fkey" FOREIGN KEY("customerId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingGeneralCustomer_actor_fkey') THEN
  ALTER TABLE "ShippingGeneralCustomer" ADD CONSTRAINT "ShippingGeneralCustomer_actor_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_shipping_general_customer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_GENERAL_CUSTOMER_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Organization" o JOIN "Organization" p ON p.id=NEW."customerId"
  JOIN "Employee" e ON e.id=NEW."createdByEmployeeId" AND e."orgId"=o.id
  WHERE o.id=NEW."orgId" AND o.type::text='SERVICE' AND o."isActive" AND p.id<>o.id
  AND p."ownerOrgId"=o.id AND p."partyKind"='INDIVIDUAL' AND p."isActive"
  AND e.status::text='ACTIVE' AND e."orgRole"::text IN('ADMIN','OPERATOR','ACCOUNTANT')
  AND NOT EXISTS(SELECT 1 FROM "Employee" WHERE "orgId"=p.id)
  AND NOT EXISTS(SELECT 1 FROM "CompanyPartnerLink" WHERE "entityId"=p.id OR "targetOrgId"=p.id)) THEN
  RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingGeneralCustomer_guard" ON "ShippingGeneralCustomer";
CREATE TRIGGER "ShippingGeneralCustomer_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingGeneralCustomer" FOR EACH ROW EXECUTE FUNCTION baro_shipping_general_customer_guard();
CREATE OR REPLACE FUNCTION baro_shipping_general_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field TEXT;
BEGIN
 FOR field IN SELECT unnest(ARRAY['shipperId','consigneeId','notifyId']) LOOP
  IF EXISTS(SELECT 1 FROM "ShippingGeneralCustomer" WHERE "orgId"=NEW."orgId" AND "customerId"::text=NEW.data->>field) THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM "ShippingGeneralCustomer" WHERE "orgId"=NEW."orgId" AND "customerId"=NEW."customerId") THEN
  IF NEW.service<>'EXPRESS' OR NEW.mode<>'AIR' OR NEW.data->'generalCustomer' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'SHIPPING_GENERAL_CUSTOMER_INVALID'; END IF;
  FOR field IN SELECT unnest(ARRAY['actualRequesterName','actualRequesterPhone']) LOOP
   IF jsonb_typeof(NEW.data->field) IS DISTINCT FROM 'string' OR length(trim(NEW.data->>field))=0 OR length(NEW.data->>field)>(CASE WHEN field='actualRequesterName' THEN 200 ELSE 80 END) THEN RAISE EXCEPTION 'SHIPPING_REQUESTER_REQUIRED'; END IF;
  END LOOP;
  IF NEW.data->>'customerRole' IS NOT NULL THEN RAISE EXCEPTION 'FREIGHT_CUSTOMER_ROLE'; END IF;
  FOR field IN SELECT unnest(ARRAY['shipper','consignee']) LOOP
   IF length(trim(COALESCE(NEW.data->(field||'Party')->>'name','')))=0 THEN RAISE EXCEPTION 'FREIGHT_REQUIRED'; END IF;
  END LOOP;
  FOR field IN SELECT unnest(ARRAY['shipperId','consigneeId','notifyId']) LOOP
   IF NEW.data->>field=NEW."customerId"::text THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
  END LOOP;
 ELSIF NEW.data->'generalCustomer'='true'::jsonb THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightJob_general_customer_guard" ON "FreightJob";
CREATE TRIGGER "FreightJob_general_customer_guard" BEFORE INSERT OR UPDATE ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_shipping_general_job_guard();
CREATE OR REPLACE FUNCTION baro_shipping_general_partner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='Organization' THEN
  IF EXISTS(SELECT 1 FROM "ShippingGeneralCustomer" WHERE "customerId"=NEW.id) AND
   (NEW."ownerOrgId",NEW."dataOwnerOrgId",NEW."partyKind") IS DISTINCT FROM (OLD."ownerOrgId",OLD."dataOwnerOrgId",OLD."partyKind") THEN RAISE EXCEPTION 'SHIPPING_GENERAL_CUSTOMER_IMMUTABLE'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM "ShippingGeneralCustomer" WHERE "customerId" IN(NEW."entityId",NEW."targetOrgId")) THEN RAISE EXCEPTION 'SHIPPING_GENERAL_CUSTOMER_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Organization_shipping_general_guard" ON "Organization";
CREATE TRIGGER "Organization_shipping_general_guard" BEFORE UPDATE ON "Organization" FOR EACH ROW EXECUTE FUNCTION baro_shipping_general_partner_guard();
DROP TRIGGER IF EXISTS "CompanyPartnerLink_shipping_general_guard" ON "CompanyPartnerLink";
CREATE TRIGGER "CompanyPartnerLink_shipping_general_guard" BEFORE INSERT OR UPDATE ON "CompanyPartnerLink" FOR EACH ROW EXECUTE FUNCTION baro_shipping_general_partner_guard();
-- Reapply without changing data. Rollback: stop general-customer writes, deploy a
-- compatible application, retain mapping/partners, original FK, contact data and audit.
