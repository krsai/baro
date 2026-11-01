CREATE TABLE IF NOT EXISTS "CompanyPartnerLink" (
 "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "entityId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "targetOrgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "createdByEmployeeId" INTEGER NOT NULL,
 "matchMethod" TEXT NOT NULL CHECK ("matchMethod" IN ('SELECTED','BUSINESS_NUMBER')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CompanyPartnerLink_pkey" PRIMARY KEY ("orgId","entityId"),
 CONSTRAINT "CompanyPartnerLink_actor_scope_fkey" FOREIGN KEY ("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "CompanyPartnerLink_distinct_companies" CHECK ("orgId"<>"targetOrgId")
);
CREATE INDEX IF NOT EXISTS "CompanyPartnerLink_targetOrgId_idx" ON "CompanyPartnerLink"("targetOrgId");
CREATE INDEX IF NOT EXISTS "Organization_business_number_lookup_idx" ON "Organization" ((regexp_replace(upper("businessNumber"),'[^A-Z0-9]','','g'))) WHERE "ownerOrgId" IS NULL;
CREATE INDEX IF NOT EXISTS "Organization_company_name_lookup_idx" ON "Organization" (lower(name)) WHERE "ownerOrgId" IS NULL;
CREATE INDEX IF NOT EXISTS "Organization_company_nameKo_lookup_idx" ON "Organization" (lower("nameKo")) WHERE "ownerOrgId" IS NULL;
CREATE INDEX IF NOT EXISTS "Organization_company_nameVi_lookup_idx" ON "Organization" (lower("nameVi")) WHERE "ownerOrgId" IS NULL;
CREATE OR REPLACE FUNCTION baro_company_partner_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COMPANY_CONNECTION_IMMUTABLE'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND "ownerOrgId" IS NULL AND "dataOwnerOrgId" IS NULL AND "isActive" AND type::text IN ('MANUFACTURER','BRAND','SERVICE'))
 OR NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."targetOrgId" AND "ownerOrgId" IS NULL AND "dataOwnerOrgId" IS NULL AND "isActive" AND type::text IN ('MANUFACTURER','BRAND','SERVICE'))
 OR NOT EXISTS (SELECT 1 FROM "Employee" WHERE "orgId"=NEW."targetOrgId" AND status::text='ACTIVE') THEN RAISE EXCEPTION 'COMPANY_CONNECTION_TENANT_SCOPE'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_ACTOR'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."entityId" AND "ownerOrgId"=NEW."orgId" AND type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'))
 AND NOT EXISTS (SELECT 1 FROM "OrgRelationship" WHERE ("manufacturerOrgId"=NEW."orgId" AND "brandOrgId"=NEW."entityId") OR ("brandOrgId"=NEW."orgId" AND "manufacturerOrgId"=NEW."entityId")) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_PARTNER_SCOPE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "CompanyPartnerLink_scope_guard" ON "CompanyPartnerLink";
CREATE TRIGGER "CompanyPartnerLink_scope_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CompanyPartnerLink" FOR EACH ROW EXECUTE FUNCTION baro_company_partner_link_guard();
