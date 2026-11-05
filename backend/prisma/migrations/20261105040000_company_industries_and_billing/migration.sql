-- Self classification is the company's own public industry profile. Other
-- (orgId,entityId) rows remain private, company-local partner classifications.
CREATE OR REPLACE FUNCTION baro_partner_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."orgId"=NEW."entityId" THEN
  IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND "ownerOrgId" IS NULL AND "isActive" AND type::text IN ('MANUFACTURER','BRAND','SERVICE')) OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text='ADMIN') THEN RAISE EXCEPTION 'COMPANY_INDUSTRY_ADMIN_REQUIRED'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "Organization" e WHERE e.id=NEW."entityId" AND e."ownerOrgId"=NEW."orgId" AND e.type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER') UNION ALL SELECT 1 FROM "OrgRelationship" r WHERE (r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=NEW."entityId") OR (r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=NEW."entityId")) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_SCOPE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_ACTOR'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW."orgId"<>OLD."orgId" OR NEW."entityId"<>OLD."entityId" OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_REVISION'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE "TransactionCode" ADD COLUMN IF NOT EXISTS "canBill" BOOLEAN NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION baro_company_billing_code_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT NEW."canBill" THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."canBill" AND NEW."ownerOrgId"=OLD."ownerOrgId" AND NEW."baseId" IS NOT DISTINCT FROM OLD."baseId" THEN RETURN NEW; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "TransactionCodeBase" b JOIN "AccountingCodeIndustry" l ON l."baseId"=b.id JOIN "PartnerClassificationIndustry" i ON i."systemIndustryId"=l."systemIndustryId" AND i."orgId"=NEW."ownerOrgId" AND i."entityId"=NEW."ownerOrgId" JOIN "SettingServiceDefault" s ON s.id=i."systemIndustryId" WHERE b.id=NEW."baseId" AND b."isActive" AND s."isActive" AND b."cashDirection" IN ('IN','BOTH') AND NEW."isActive") THEN RAISE EXCEPTION 'COMPANY_BILLING_CODE_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TransactionCode_company_billing_guard" BEFORE INSERT OR UPDATE ON "TransactionCode" FOR EACH ROW EXECUTE FUNCTION baro_company_billing_code_guard();
