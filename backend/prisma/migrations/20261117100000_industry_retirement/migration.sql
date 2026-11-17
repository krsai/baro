-- Archive taxonomy definitions only after their live relationships are removed.
-- Historical expense, ledger, code IDs and all monetary records remain untouched.
CREATE TABLE IF NOT EXISTS "IndustryRetirement" (
 "systemIndustryId" INTEGER PRIMARY KEY REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT,
 "actorId" INTEGER NOT NULL REFERENCES "SystemUser"(id) ON DELETE RESTRICT,
 "beforeData" JSONB NOT NULL,
 "referenceSummary" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION baro_industry_retirement_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'industry retirement audit is immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "SystemUser" WHERE id=NEW."actorId" AND "systemRole"::text='SYSTEM_ADMIN') THEN RAISE EXCEPTION 'system admin required'; END IF;
 IF jsonb_typeof(NEW."beforeData")<>'object' OR jsonb_typeof(NEW."referenceSummary")<>'object' THEN RAISE EXCEPTION 'invalid industry retirement snapshot'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "IndustryRetirement_audit_guard" ON "IndustryRetirement";
CREATE TRIGGER "IndustryRetirement_audit_guard" BEFORE INSERT OR UPDATE OR DELETE ON "IndustryRetirement" FOR EACH ROW EXECUTE FUNCTION baro_industry_retirement_audit_guard();
