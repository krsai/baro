-- Classification is independent of technical organization types and existing
-- production/customer/cost FKs. No historical assignment is backfilled or changed.
CREATE TABLE IF NOT EXISTS "PartnerClassification" (
  "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
  "entityId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  "updatedByEmployeeId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerClassification_pkey" PRIMARY KEY("orgId","entityId"),
  CONSTRAINT "PartnerClassification_actor_scope_fkey" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "PartnerClassificationIndustry" (
  "orgId" INTEGER NOT NULL,
  "entityId" INTEGER NOT NULL,
  "systemIndustryId" INTEGER NOT NULL REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT,
  CONSTRAINT "PartnerClassificationIndustry_pkey" PRIMARY KEY("orgId","entityId","systemIndustryId"),
  CONSTRAINT "PartnerClassificationIndustry_scope_fkey" FOREIGN KEY("orgId","entityId") REFERENCES "PartnerClassification"("orgId","entityId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PartnerClassificationIndustry_systemIndustryId_idx" ON "PartnerClassificationIndustry"("systemIndustryId");
CREATE OR REPLACE FUNCTION baro_partner_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."orgId"=NEW."entityId" OR NOT EXISTS(
    SELECT 1 FROM "Organization" e WHERE e.id=NEW."entityId" AND e."ownerOrgId"=NEW."orgId" AND e.type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER')
    UNION ALL SELECT 1 FROM "OrgRelationship" r WHERE (r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=NEW."entityId") OR (r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=NEW."entityId")
  ) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_SCOPE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_ACTOR'; END IF;
  IF TG_OP='UPDATE' AND (NEW."orgId"<>OLD."orgId" OR NEW."entityId"<>OLD."entityId" OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_REVISION'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PartnerClassification_scope_guard" ON "PartnerClassification";
CREATE TRIGGER "PartnerClassification_scope_guard" BEFORE INSERT OR UPDATE ON "PartnerClassification" FOR EACH ROW EXECUTE FUNCTION baro_partner_classification_guard();
CREATE OR REPLACE FUNCTION baro_partner_classification_industry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM "SettingServiceDefault" s WHERE s.id=NEW."systemIndustryId" AND s.code<>'GENERAL' AND s."partnerRoleId" IS NOT NULL) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_INDUSTRY'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PartnerClassificationIndustry_guard" ON "PartnerClassificationIndustry";
CREATE TRIGGER "PartnerClassificationIndustry_guard" BEFORE INSERT OR UPDATE ON "PartnerClassificationIndustry" FOR EACH ROW EXECUTE FUNCTION baro_partner_classification_industry_guard();
CREATE OR REPLACE FUNCTION baro_partner_classification_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE company_id INTEGER; entity_id INTEGER;
BEGIN
  company_id:=COALESCE(NEW."orgId",OLD."orgId");entity_id:=COALESCE(NEW."entityId",OLD."entityId");
  IF EXISTS(SELECT 1 FROM "PartnerClassification" WHERE "orgId"=company_id AND "entityId"=entity_id)
    AND NOT EXISTS(SELECT 1 FROM "PartnerClassificationIndustry" WHERE "orgId"=company_id AND "entityId"=entity_id)
    THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_REQUIRED'; END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS "PartnerClassification_required" ON "PartnerClassification";
CREATE CONSTRAINT TRIGGER "PartnerClassification_required" AFTER INSERT OR UPDATE ON "PartnerClassification" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_partner_classification_required();
DROP TRIGGER IF EXISTS "PartnerClassificationIndustry_required" ON "PartnerClassificationIndustry";
CREATE CONSTRAINT TRIGGER "PartnerClassificationIndustry_required" AFTER INSERT OR UPDATE OR DELETE ON "PartnerClassificationIndustry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_partner_classification_required();
