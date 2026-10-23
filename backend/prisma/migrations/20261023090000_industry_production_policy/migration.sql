CREATE TABLE IF NOT EXISTS "IndustryProductionPolicy" (
  "orgId" INTEGER NOT NULL,
  "systemIndustryId" INTEGER NOT NULL,
  "productionLinkRequired" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndustryProductionPolicy_pkey" PRIMARY KEY ("orgId", "systemIndustryId"),
  CONSTRAINT "IndustryProductionPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  CONSTRAINT "IndustryProductionPolicy_systemIndustryId_fkey" FOREIGN KEY ("systemIndustryId") REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT
);
-- No backfill: absent policies preserve the existing code configuration.
