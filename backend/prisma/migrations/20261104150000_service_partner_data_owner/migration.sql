-- A service company's local partners remain in its company scope without
-- acquiring production data ownership. Do not rewrite any stored ownership.
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
DROP TRIGGER IF EXISTS "manufacturer_data_owner" ON "Organization";
CREATE TRIGGER "manufacturer_data_owner" BEFORE INSERT OR UPDATE ON "Organization"
FOR EACH ROW EXECUTE FUNCTION baro_company_partner_data_owner();
