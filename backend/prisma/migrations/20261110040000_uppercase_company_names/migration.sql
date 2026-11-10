-- Company/partner master names only. Original rows are retained; no financial snapshots change.
LOCK TABLE "Organization", "CompanyIdentity" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE "CompanyNameCaseAudit" (
 "organizationId" INTEGER PRIMARY KEY REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "identityId" INTEGER UNIQUE REFERENCES "CompanyIdentity"(id) ON DELETE RESTRICT,
 "beforeOrganization" JSONB NOT NULL,"beforeIdentity" JSONB,
 "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "CompanyNameCaseAudit"("organizationId","identityId","beforeOrganization","beforeIdentity")
 SELECT o.id,i.id,to_jsonb(o),to_jsonb(i) FROM "Organization" o LEFT JOIN "CompanyIdentity" i ON i."anchorEntityId"=o.id
 WHERE o.name IS DISTINCT FROM upper(o.name) OR o."nameKo" IS DISTINCT FROM upper(o."nameKo") OR o."nameVi" IS DISTINCT FROM upper(o."nameVi")
 OR i.name IS DISTINCT FROM upper(i.name) OR i."nameKo" IS DISTINCT FROM upper(i."nameKo") OR i."nameVi" IS DISTINCT FROM upper(i."nameVi");
-- During this transaction only, permit the exact audited name-case transformation.
CREATE OR REPLACE FUNCTION baro_company_identity_anchor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW)-ARRAY['name','nameKo','nameVi'] = to_jsonb(OLD)-ARRAY['name','nameKo','nameVi']
 AND NEW.name=upper(OLD.name) AND NEW."nameKo" IS NOT DISTINCT FROM upper(OLD."nameKo") AND NEW."nameVi" IS NOT DISTINCT FROM upper(OLD."nameVi")
 AND EXISTS(SELECT 1 FROM "CompanyNameCaseAudit" a WHERE a."identityId"=OLD.id AND a."beforeIdentity"=to_jsonb(OLD)) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'COMPANY_IDENTITY_IMMUTABLE';
END $$;
UPDATE "CompanyIdentity" SET name=upper(name),"nameKo"=upper("nameKo"),"nameVi"=upper("nameVi")
 WHERE name IS DISTINCT FROM upper(name) OR "nameKo" IS DISTINCT FROM upper("nameKo") OR "nameVi" IS DISTINCT FROM upper("nameVi");
CREATE OR REPLACE FUNCTION baro_company_identity_anchor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COMPANY_IDENTITY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Organization" o WHERE o.id=NEW."anchorEntityId" AND o."partyKind" IS DISTINCT FROM 'INDIVIDUAL' AND o.country=NEW.country AND regexp_replace(upper(o."businessNumber"),'[^A-Z0-9]','','g')=NEW."businessNumber" AND
 (o.code=NEW.code OR EXISTS(SELECT 1 FROM "CompanyPartnerLink" l JOIN "Organization" t ON t.id=l."targetOrgId" WHERE l."entityId"=o.id AND t.code=NEW.code AND (t.country IS NULL OR t.country=o.country) AND (NULLIF(regexp_replace(upper(t."businessNumber"),'[^A-Z0-9]','','g'),'') IS NULL OR regexp_replace(upper(t."businessNumber"),'[^A-Z0-9]','','g')=NEW."businessNumber")))) THEN RAISE EXCEPTION 'COMPANY_CONNECTION_IDENTITY_MISMATCH'; END IF;
 RETURN NEW;
END $$;
-- Keep legacy ownership exactly as archived during this name-only correction.
CREATE OR REPLACE FUNCTION baro_company_partner_data_owner() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW)-ARRAY['name','nameKo','nameVi'] = to_jsonb(OLD)-ARRAY['name','nameKo','nameVi']
 AND NEW.name=upper(OLD.name) AND NEW."nameKo" IS NOT DISTINCT FROM upper(OLD."nameKo") AND NEW."nameVi" IS NOT DISTINCT FROM upper(OLD."nameVi")
 AND EXISTS(SELECT 1 FROM "CompanyNameCaseAudit" a WHERE a."organizationId"=OLD.id AND a."beforeOrganization"=to_jsonb(OLD)) THEN RETURN NEW; END IF;
  IF NEW.type::text='MANUFACTURER' THEN
    NEW."dataOwnerOrgId":=NEW.id;
  ELSIF NEW."dataOwnerOrgId" IS NULL AND NEW."ownerOrgId" IS NOT NULL THEN
    SELECT CASE WHEN o.type::text='MANUFACTURER' THEN o.id
      WHEN EXISTS(SELECT 1 FROM "Organization" m WHERE m.id=o."dataOwnerOrgId" AND m.type::text='MANUFACTURER') THEN o."dataOwnerOrgId"
      ELSE NULL END INTO NEW."dataOwnerOrgId"
    FROM "Organization" o WHERE o.id=NEW."ownerOrgId";
  END IF;
  IF NEW."dataOwnerOrgId" IS NOT NULL AND NEW."dataOwnerOrgId"<>NEW.id
    AND NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."dataOwnerOrgId" AND type::text='MANUFACTURER') THEN
    RAISE EXCEPTION 'data owner must be a manufacturer';
  END IF;
  IF NEW."dataOwnerOrgId"=NEW.id AND NEW.type::text<>'MANUFACTURER' THEN
    RAISE EXCEPTION 'data owner must be a manufacturer';
  END IF;
  RETURN NEW;
END $$;
UPDATE "Organization" SET name=upper(name),"nameKo"=upper("nameKo"),"nameVi"=upper("nameVi")
 WHERE name IS DISTINCT FROM upper(name) OR "nameKo" IS DISTINCT FROM upper("nameKo") OR "nameVi" IS DISTINCT FROM upper("nameVi");
CREATE OR REPLACE FUNCTION baro_company_partner_data_owner() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type::text='MANUFACTURER' THEN
    NEW."dataOwnerOrgId":=NEW.id;
  ELSIF NEW."dataOwnerOrgId" IS NULL AND NEW."ownerOrgId" IS NOT NULL THEN
    SELECT CASE WHEN o.type::text='MANUFACTURER' THEN o.id
      WHEN EXISTS(SELECT 1 FROM "Organization" m WHERE m.id=o."dataOwnerOrgId" AND m.type::text='MANUFACTURER') THEN o."dataOwnerOrgId"
      ELSE NULL END INTO NEW."dataOwnerOrgId"
    FROM "Organization" o WHERE o.id=NEW."ownerOrgId";
  END IF;
  IF NEW."dataOwnerOrgId" IS NOT NULL AND NEW."dataOwnerOrgId"<>NEW.id
    AND NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."dataOwnerOrgId" AND type::text='MANUFACTURER') THEN
    RAISE EXCEPTION 'data owner must be a manufacturer';
  END IF;
  IF NEW."dataOwnerOrgId"=NEW.id AND NEW.type::text<>'MANUFACTURER' THEN
    RAISE EXCEPTION 'data owner must be a manufacturer';
  END IF;
  RETURN NEW;
END $$;
-- Validate deferred company/relationship constraints before changing table metadata.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "CompanyNameCaseAudit" a JOIN "Organization" o ON o.id=a."organizationId"
  WHERE to_jsonb(o)-ARRAY['name','nameKo','nameVi'] IS DISTINCT FROM a."beforeOrganization"-ARRAY['name','nameKo','nameVi'])
 OR EXISTS(SELECT 1 FROM "CompanyNameCaseAudit" a JOIN "CompanyIdentity" i ON i.id=a."identityId"
  WHERE to_jsonb(i)-ARRAY['name','nameKo','nameVi'] IS DISTINCT FROM a."beforeIdentity"-ARRAY['name','nameKo','nameVi'])
 THEN RAISE EXCEPTION 'COMPANY_NAME_UNRELATED_DATA_CHANGED'; END IF;
END $$;
CREATE FUNCTION baro_uppercase_company_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.name=upper(NEW.name); NEW."nameKo"=upper(NEW."nameKo"); NEW."nameVi"=upper(NEW."nameVi"); RETURN NEW; END $$;
CREATE TRIGGER "Organization_name_uppercase" BEFORE INSERT OR UPDATE OF name,"nameKo","nameVi" ON "Organization" FOR EACH ROW EXECUTE FUNCTION baro_uppercase_company_name();
CREATE TRIGGER "CompanyIdentity_name_uppercase" BEFORE INSERT ON "CompanyIdentity" FOR EACH ROW EXECUTE FUNCTION baro_uppercase_company_name();
CREATE FUNCTION baro_company_name_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'COMPANY_NAME_AUDIT_IMMUTABLE'; END $$;
CREATE TRIGGER "CompanyNameCaseAudit_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "CompanyNameCaseAudit" FOR EACH ROW EXECUTE FUNCTION baro_company_name_audit_guard();
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_name_uppercase_check" CHECK(name=upper(name) AND "nameKo" IS NOT DISTINCT FROM upper("nameKo") AND "nameVi" IS NOT DISTINCT FROM upper("nameVi"));
ALTER TABLE "CompanyIdentity" ADD CONSTRAINT "CompanyIdentity_name_uppercase_check" CHECK(name=upper(name) AND "nameKo" IS NOT DISTINCT FROM upper("nameKo") AND "nameVi" IS NOT DISTINCT FROM upper("nameVi"));
