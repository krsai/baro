ALTER TABLE "Organization"
  ADD COLUMN "salaryCurrencyCode" TEXT NOT NULL DEFAULT 'VND';

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_salaryCurrencyCode_check"
  CHECK ("salaryCurrencyCode" IN ('VND', 'USD', 'KRW'));
