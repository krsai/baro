-- A subscriber and its local partner represent one company. The subscriber
-- owns the public code; local historical identifiers and business FKs stay intact.
CREATE OR REPLACE FUNCTION baro_partner_has_company_link(entity_id INTEGER)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "CompanyPartnerLink" WHERE "entityId"=entity_id)
$$;
ALTER TABLE "Organization" DROP CONSTRAINT IF EXISTS "Organization_corporate_profile_check";
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_corporate_profile_check"
 CHECK("partyKind" IS DISTINCT FROM 'CORPORATE' OR length(trim(COALESCE("businessNumber",'')))>0);
CREATE OR REPLACE FUNCTION baro_partner_corporate_code_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "Organization" o WHERE o.id=NEW.id AND o."partyKind"='CORPORATE'
  AND (o.code IS NULL OR o.code !~ '^[A-Z0-9]{4}$') AND NOT baro_partner_has_company_link(o.id)) THEN
  RAISE EXCEPTION 'CORPORATE_PARTNER_CODE_INVALID';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Organization_linked_corporate_code_guard" ON "Organization";
CREATE CONSTRAINT TRIGGER "Organization_linked_corporate_code_guard"
 AFTER INSERT OR UPDATE ON "Organization" DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION baro_partner_corporate_code_guard();
