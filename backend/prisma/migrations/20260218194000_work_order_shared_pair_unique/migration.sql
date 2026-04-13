DO $$
BEGIN
  IF to_regclass('"WorkOrder"') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WorkOrder"
    WHERE "buyerOrgId" IS NOT NULL
      AND "sellerOrgId" IS NOT NULL
      AND BTRIM(COALESCE("orderNumber", '')) <> ''
    GROUP BY "buyerOrgId", "sellerOrgId", "orderNumber"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create WorkOrder unique index: duplicate (buyerOrgId, sellerOrgId, orderNumber) rows exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'WorkOrder_buyerOrgId_sellerOrgId_orderNumber_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX "WorkOrder_buyerOrgId_sellerOrgId_orderNumber_key" ON "WorkOrder"("buyerOrgId", "sellerOrgId", "orderNumber")';
  END IF;
END $$;
