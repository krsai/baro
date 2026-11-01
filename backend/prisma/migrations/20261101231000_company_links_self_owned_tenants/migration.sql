-- Older independent subscribers own their own data explicitly. Keep that FK.
-- A party owned by a different company is still not a SaaS subscriber candidate.
CREATE OR REPLACE FUNCTION baro_company_partner_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COMPANY_CONNECTION_IMMUTABLE'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND "ownerOrgId" IS NULL AND ("dataOwnerOrgId" IS NULL OR "dataOwnerOrgId"=id) AND "isActive" AND type::text IN ('MANUFACTURER','BRAND','SERVICE'))
 OR NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."targetOrgId" AND "ownerOrgId" IS NULL AND ("dataOwnerOrgId" IS NULL OR "dataOwnerOrgId"=id) AND "isActive" AND type::text IN ('MANUFACTURER','BRAND','SERVICE'))
 OR NOT EXISTS (SELECT 1 FROM "Employee" WHERE "orgId"=NEW."targetOrgId" AND status::text='ACTIVE') THEN RAISE EXCEPTION 'COMPANY_CONNECTION_TENANT_SCOPE'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_ACTOR'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."entityId" AND "ownerOrgId"=NEW."orgId" AND type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'))
 AND NOT EXISTS (SELECT 1 FROM "OrgRelationship" WHERE ("manufacturerOrgId"=NEW."orgId" AND "brandOrgId"=NEW."entityId") OR ("brandOrgId"=NEW."orgId" AND "manufacturerOrgId"=NEW."entityId")) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_PARTNER_SCOPE'; END IF;
 RETURN NEW;
END $$;
