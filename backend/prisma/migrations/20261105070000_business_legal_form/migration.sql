-- Business registration form is independent of individual/corporate payee identity.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "businessLegalForm" TEXT;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_business_legal_form_check"
 CHECK("businessLegalForm" IS NULL OR "businessLegalForm" IN ('CORPORATION','SOLE_PROPRIETOR'));
