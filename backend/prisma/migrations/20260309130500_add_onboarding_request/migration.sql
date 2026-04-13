CREATE TYPE "OnboardingRequestType" AS ENUM ('REGISTER_ORG');

CREATE TYPE "OnboardingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "OnboardingRequest" (
  "id" SERIAL NOT NULL,
  "requesterEmail" TEXT NOT NULL,
  "requestType" "OnboardingRequestType" NOT NULL DEFAULT 'REGISTER_ORG',
  "organizationNameEn" TEXT NOT NULL,
  "businessNumber" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "status" "OnboardingRequestStatus" NOT NULL DEFAULT 'PENDING',
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "organizationId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnboardingRequest_status_idx" ON "OnboardingRequest"("status");
CREATE INDEX "OnboardingRequest_requesterEmail_idx" ON "OnboardingRequest"("requesterEmail");
CREATE INDEX "OnboardingRequest_requesterEmail_status_idx" ON "OnboardingRequest"("requesterEmail", "status");

ALTER TABLE "OnboardingRequest"
ADD CONSTRAINT "OnboardingRequest_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
