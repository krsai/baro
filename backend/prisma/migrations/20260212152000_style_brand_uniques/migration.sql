UPDATE "Style"
SET "styleCode" = "name"
WHERE "styleCode" IS NULL OR BTRIM("styleCode") = '';

ALTER TABLE "Style"
ALTER COLUMN "styleCode" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Style_orgId_customer_name_key"
ON "Style"("orgId", "customer", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "Style_orgId_customer_styleCode_key"
ON "Style"("orgId", "customer", "styleCode");
