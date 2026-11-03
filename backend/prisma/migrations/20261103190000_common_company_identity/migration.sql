CREATE TABLE IF NOT EXISTS "CompanyIdentity" (
 id SERIAL PRIMARY KEY,"anchorEntityId" INTEGER NOT NULL UNIQUE REFERENCES "Organization"(id) ON DELETE RESTRICT,
 code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,"nameKo" TEXT,"nameVi" TEXT,country TEXT NOT NULL,"businessNumber" TEXT NOT NULL,address TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CompanyIdentity_number_check" CHECK(length("businessNumber")>0 AND "businessNumber"=regexp_replace(upper("businessNumber"),'[^A-Z0-9]','','g'))
);
CREATE INDEX IF NOT EXISTS "CompanyIdentity_country_businessNumber_idx" ON "CompanyIdentity"(country,"businessNumber");
CREATE OR REPLACE FUNCTION baro_company_identity_anchor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COMPANY_IDENTITY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Organization" o WHERE o.id=NEW."anchorEntityId" AND o."partyKind" IS DISTINCT FROM 'INDIVIDUAL' AND o.country=NEW.country AND regexp_replace(upper(o."businessNumber"),'[^A-Z0-9]','','g')=NEW."businessNumber" AND
 (o.code=NEW.code OR EXISTS(SELECT 1 FROM "CompanyPartnerLink" l JOIN "Organization" t ON t.id=l."targetOrgId" WHERE l."entityId"=o.id AND t.code=NEW.code AND (t.country IS NULL OR t.country=o.country) AND (NULLIF(regexp_replace(upper(t."businessNumber"),'[^A-Z0-9]','','g'),'') IS NULL OR regexp_replace(upper(t."businessNumber"),'[^A-Z0-9]','','g')=NEW."businessNumber")))) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_IDENTITY_MISMATCH'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "CompanyIdentity_anchor_guard" ON "CompanyIdentity";
CREATE TRIGGER "CompanyIdentity_anchor_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CompanyIdentity" FOR EACH ROW EXECUTE FUNCTION baro_company_identity_anchor_guard();
-- Preserve previously confirmed subscriber identities and their official codes.
-- No local relationship, business FK or original code is rewritten.
INSERT INTO "CompanyIdentity"("anchorEntityId",code,name,"nameKo","nameVi",country,"businessNumber",address)
 SELECT DISTINCT ON(t.code) o.id,t.code,t.name,t."nameKo",t."nameVi",o.country,regexp_replace(upper(o."businessNumber"),'[^A-Z0-9]','','g'),COALESCE(t.address,o.address)
 FROM "CompanyPartnerLink" l JOIN "Organization" o ON o.id=l."entityId" JOIN "Organization" t ON t.id=l."targetOrgId"
 WHERE o."partyKind" IS DISTINCT FROM 'INDIVIDUAL' AND t.code IS NOT NULL AND o.country IS NOT NULL AND length(regexp_replace(upper(o."businessNumber"),'[^A-Z0-9]','','g'))>0
 AND (t.country IS NULL OR t.country=o.country) AND (NULLIF(regexp_replace(upper(t."businessNumber"),'[^A-Z0-9]','','g'),'') IS NULL OR regexp_replace(upper(t."businessNumber"),'[^A-Z0-9]','','g')=regexp_replace(upper(o."businessNumber"),'[^A-Z0-9]','','g'))
 ORDER BY t.code,o.id ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS "Organization_common_number_lookup_idx" ON "Organization" (country,(regexp_replace(upper("businessNumber"),'[^A-Z0-9]','','g'))) WHERE "partyKind" IS DISTINCT FROM 'INDIVIDUAL';
CREATE TABLE IF NOT EXISTS "CompanyIdentityLink" (
 "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "entityId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "identityId" INTEGER NOT NULL REFERENCES "CompanyIdentity"(id) ON DELETE RESTRICT,
 "createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("orgId","entityId"),
 CONSTRAINT "CompanyIdentityLink_actor_scope_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "CompanyIdentityLink_identityId_idx" ON "CompanyIdentityLink"("identityId");
CREATE OR REPLACE FUNCTION baro_company_identity_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE local_country TEXT; local_number TEXT; canonical_country TEXT; canonical_number TEXT;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COMPANY_CONNECTION_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND "ownerOrgId" IS NULL AND ("dataOwnerOrgId" IS NULL OR "dataOwnerOrgId"=id) AND "isActive" AND type::text IN ('MANUFACTURER','BRAND','SERVICE')) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_TENANT_SCOPE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_ACTOR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."entityId" AND ("ownerOrgId"=NEW."orgId" OR "dataOwnerOrgId"=NEW."orgId" OR id=NEW."orgId"))
 AND NOT EXISTS(SELECT 1 FROM "OrgRelationship" WHERE ("manufacturerOrgId"=NEW."orgId" AND "brandOrgId"=NEW."entityId") OR ("brandOrgId"=NEW."orgId" AND "manufacturerOrgId"=NEW."entityId")) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_PARTNER_SCOPE'; END IF;
 SELECT country,regexp_replace(upper("businessNumber"),'[^A-Z0-9]','','g') INTO local_country,local_number FROM "Organization" WHERE id=NEW."entityId";
 SELECT country,"businessNumber" INTO canonical_country,canonical_number FROM "CompanyIdentity" WHERE id=NEW."identityId";
 IF local_country IS DISTINCT FROM canonical_country OR local_number IS DISTINCT FROM canonical_number THEN RAISE EXCEPTION 'COMPANY_CONNECTION_IDENTITY_MISMATCH'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "CompanyIdentityLink_scope_guard" ON "CompanyIdentityLink";
CREATE TRIGGER "CompanyIdentityLink_scope_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CompanyIdentityLink" FOR EACH ROW EXECUTE FUNCTION baro_company_identity_link_guard();
CREATE OR REPLACE FUNCTION baro_partner_has_company_link(entity_id INTEGER) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "CompanyPartnerLink" WHERE "entityId"=entity_id) OR EXISTS(SELECT 1 FROM "CompanyIdentityLink" WHERE "entityId"=entity_id)
$$;
CREATE OR REPLACE FUNCTION baro_common_identity_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "CompanyIdentityLink" l JOIN "CompanyIdentity" c ON c.id=l."identityId" JOIN "Organization" o ON o.id=l."entityId"
  WHERE o.id=NEW.id AND (o.country IS DISTINCT FROM c.country OR regexp_replace(upper(o."businessNumber"),'[^A-Z0-9]','','g') IS DISTINCT FROM c."businessNumber")) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_IDENTITY_MISMATCH'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Organization_common_identity_guard" ON "Organization";
CREATE CONSTRAINT TRIGGER "Organization_common_identity_guard" AFTER INSERT OR UPDATE ON "Organization" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_common_identity_profile_guard();
