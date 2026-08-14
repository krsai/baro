CREATE TYPE "BusinessPartnerType" AS ENUM ('PROCESS_OUTSOURCING', 'MATERIAL_SUPPLIER');

CREATE TABLE "BusinessPartner" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "type" "BusinessPartnerType" NOT NULL DEFAULT 'PROCESS_OUTSOURCING',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessPartner_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkRecord" ADD COLUMN "outsourcingPartnerId" INTEGER;

CREATE UNIQUE INDEX "BusinessPartner_orgId_type_name_key" ON "BusinessPartner"("orgId", "type", "name");
CREATE INDEX "BusinessPartner_orgId_type_isActive_idx" ON "BusinessPartner"("orgId", "type", "isActive");
CREATE INDEX "WorkRecord_orgId_outsourcingPartnerId_idx" ON "WorkRecord"("orgId", "outsourcingPartnerId");

ALTER TABLE "BusinessPartner" ADD CONSTRAINT "BusinessPartner_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_outsourcingPartnerId_fkey"
  FOREIGN KEY ("outsourcingPartnerId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
