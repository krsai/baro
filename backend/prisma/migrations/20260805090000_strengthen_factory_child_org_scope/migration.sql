CREATE UNIQUE INDEX IF NOT EXISTS "Factory_id_org_key"
ON "Factory"("id", "orgId");

UPDATE "Warehouse" warehouse
SET "orgId" = factory."orgId"
FROM "Factory" factory
WHERE factory."id" = warehouse."factoryId"
  AND warehouse."orgId" IS DISTINCT FROM factory."orgId";

UPDATE "FactoryProductionAllowanceRate" rate
SET "orgId" = factory."orgId"
FROM "Factory" factory
WHERE factory."id" = rate."factoryId"
  AND rate."orgId" IS DISTINCT FROM factory."orgId";

ALTER TABLE "Warehouse"
DROP CONSTRAINT IF EXISTS "Warehouse_factoryId_fkey";

ALTER TABLE "Warehouse"
ADD CONSTRAINT "Warehouse_factory_org_fkey"
FOREIGN KEY ("factoryId", "orgId")
REFERENCES "Factory"("id", "orgId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FactoryProductionAllowanceRate"
DROP CONSTRAINT IF EXISTS "FactoryProductionAllowanceRate_factoryId_fkey";

ALTER TABLE "FactoryProductionAllowanceRate"
ADD CONSTRAINT "FactoryProductionAllowanceRate_factory_org_fkey"
FOREIGN KEY ("factoryId", "orgId")
REFERENCES "Factory"("id", "orgId")
ON DELETE CASCADE ON UPDATE CASCADE;
