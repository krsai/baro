ALTER TABLE "Organization" ADD COLUMN "salaryCurrencyId" INTEGER;

UPDATE "Organization" organization
SET "salaryCurrencyId" = currency.id
FROM "Currency" currency
WHERE currency.code = COALESCE(organization."salaryCurrencyCode", 'VND');

ALTER TABLE "Organization" DROP CONSTRAINT IF EXISTS "Organization_salaryCurrencyCode_check";
ALTER TABLE "Organization" DROP COLUMN "salaryCurrencyCode";

CREATE INDEX "Organization_salaryCurrencyId_idx" ON "Organization"("salaryCurrencyId");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_salaryCurrency_fkey"
  FOREIGN KEY ("salaryCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT;
