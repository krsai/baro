-- No historical partner is inferred to be an individual or corporation.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "partyKind" TEXT;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Organization_party_kind_check' AND conrelid='"Organization"'::regclass) THEN
  ALTER TABLE "Organization" ADD CONSTRAINT "Organization_party_kind_check" CHECK("partyKind" IS NULL OR "partyKind" IN ('INDIVIDUAL','CORPORATE'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Organization_corporate_profile_check' AND conrelid='"Organization"'::regclass) THEN
  ALTER TABLE "Organization" ADD CONSTRAINT "Organization_corporate_profile_check" CHECK("partyKind" IS DISTINCT FROM 'CORPORATE' OR (code IS NOT NULL AND code ~ '^[A-Z0-9]{4}$' AND length(trim(COALESCE("businessNumber",'')))>0));
 END IF;
END $$;
