DO $$
BEGIN
  IF to_regclass('"WorkOrder"') IS NULL THEN
    RETURN;
  END IF;

  UPDATE "WorkOrder"
  SET "customerId" = "buyerOrgId"
  WHERE "customerId" IS NULL AND "buyerOrgId" IS NOT NULL;

  UPDATE "WorkOrder"
  SET "buyerOrgId" = "customerId"
  WHERE "buyerOrgId" IS NULL AND "customerId" IS NOT NULL;

  UPDATE "WorkOrder"
  SET "customerName" = "buyerOrgName"
  WHERE ("customerName" IS NULL OR BTRIM("customerName") = '')
    AND "buyerOrgName" IS NOT NULL
    AND BTRIM("buyerOrgName") <> '';

  UPDATE "WorkOrder"
  SET "buyerOrgName" = "customerName"
  WHERE ("buyerOrgName" IS NULL OR BTRIM("buyerOrgName") = '')
    AND "customerName" IS NOT NULL
    AND BTRIM("customerName") <> '';

  IF EXISTS (
    SELECT 1
    FROM "WorkOrder"
    WHERE "customerId" IS NOT NULL
    GROUP BY "orgId", "customerId", "orderNumber"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create WorkOrder unique index: duplicate (orgId, customerId, orderNumber) rows exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_orgId_customerId_orderNumber_key"
ON "WorkOrder"("orgId", "customerId", "orderNumber");
