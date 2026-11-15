-- Preserve original registrations and make self-managed defaults explicit.
-- Existing business rows and snapshots are not rewritten or auto-claimed.
CREATE TABLE IF NOT EXISTS "CompanyProfileDefault" (
 "entityId" INTEGER PRIMARY KEY REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "registrationOwnerOrgId" INTEGER REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "registrationData" JSONB NOT NULL, data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 "updatedByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CompanyProfileDefault_actor_fkey" FOREIGN KEY("updatedByEmployeeId","entityId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
ALTER TABLE "PartnerContact" ADD COLUMN IF NOT EXISTS base JSONB, ADD COLUMN IF NOT EXISTS mode TEXT;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PartnerContact_mode_check') THEN ALTER TABLE "PartnerContact" ADD CONSTRAINT "PartnerContact_mode_check" CHECK(mode IS NULL OR mode IN('LOCAL','DEFAULT')); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='CompanyProfileDefault_values_check') THEN ALTER TABLE "CompanyProfileDefault" ADD CONSTRAINT "CompanyProfileDefault_values_check" CHECK(revision>0 AND jsonb_typeof(data)='object' AND jsonb_typeof("registrationData")='object'); END IF;
END $$;
