-- CreateTable
CREATE TABLE "OrganizationHoliday" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "holidayDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationHoliday_orgId_holidayDate_key" ON "OrganizationHoliday"("orgId", "holidayDate");

-- CreateIndex
CREATE INDEX "OrganizationHoliday_orgId_holidayDate_idx" ON "OrganizationHoliday"("orgId", "holidayDate");

-- AddForeignKey
ALTER TABLE "OrganizationHoliday" ADD CONSTRAINT "OrganizationHoliday_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
