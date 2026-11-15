-- Company-local overrides. No historical rows or document snapshots are rewritten.
CREATE TABLE IF NOT EXISTS "PartnerContact" (
 "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "entityId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 data JSONB NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1,
 "updatedByEmployeeId" INTEGER NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("orgId","entityId"),
 CONSTRAINT "PartnerContact_actor_fkey" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "PartnerContact_scope_check" CHECK("orgId"<>"entityId" AND revision>0 AND jsonb_typeof(data)='object')
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PartnerContact_scope_check') THEN
  ALTER TABLE "PartnerContact" ADD CONSTRAINT "PartnerContact_scope_check" CHECK("orgId"<>"entityId" AND revision>0 AND jsonb_typeof(data)='object');
 END IF;
END $$;
