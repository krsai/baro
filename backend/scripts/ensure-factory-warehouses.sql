-- Idempotent runtime backfill for deployments that synchronize Prisma with
-- `db push` instead of applying the migration directory.
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_one_active_default_per_factory_key"
ON "Warehouse"("factoryId") WHERE "isDefault" = true AND "isActive" = true;

INSERT INTO "Warehouse" (
  "orgId",
  "factoryId",
  "name",
  "isDefault",
  "isActive",
  "createdBy",
  "updatedAt"
)
SELECT
  factory."orgId",
  factory."id",
  '창고 1',
  true,
  true,
  'SYSTEM:WAREHOUSE_BACKFILL',
  CURRENT_TIMESTAMP
FROM "Factory" factory
WHERE NOT EXISTS (
  SELECT 1
  FROM "Warehouse" warehouse
  WHERE warehouse."factoryId" = factory."id"
);
