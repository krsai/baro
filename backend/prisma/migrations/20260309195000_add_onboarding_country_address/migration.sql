-- AlterTable
ALTER TABLE "OnboardingRequest"
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'KR',
ADD COLUMN "companyAddress" TEXT NOT NULL DEFAULT '';
