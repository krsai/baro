-- Existing registered holidays are paid unless explicitly changed by a company user.
CREATE TABLE IF NOT EXISTS "OrganizationHoliday" (
 "id" SERIAL PRIMARY KEY,"orgId" INTEGER NOT NULL REFERENCES "Organization"(id),"holidayDate" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
 "createdByEmployeeId" INTEGER REFERENCES "Employee"(id),"updatedByEmployeeId" INTEGER REFERENCES "Employee"(id),
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("orgId","holidayDate")
);
ALTER TABLE "OrganizationHoliday" ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "OrganizationHoliday" ADD COLUMN IF NOT EXISTS "createdByEmployeeId" INTEGER REFERENCES "Employee"(id);
ALTER TABLE "OrganizationHoliday" ADD COLUMN IF NOT EXISTS "updatedByEmployeeId" INTEGER REFERENCES "Employee"(id);
