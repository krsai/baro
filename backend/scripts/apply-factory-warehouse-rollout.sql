ALTER TABLE "Factory"
  ADD COLUMN IF NOT EXISTS "productionAllowanceUpdatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "factoryId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "createdByEmployeeId" INTEGER,
  "updatedByEmployeeId" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Warehouse"
  ADD COLUMN IF NOT EXISTS "createdByEmployeeId" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedByEmployeeId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_factoryId_name_key"
  ON "Warehouse"("factoryId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_one_active_default_per_factory_key"
  ON "Warehouse"("factoryId") WHERE "isDefault" = true AND "isActive" = true;
CREATE INDEX IF NOT EXISTS "Warehouse_orgId_idx" ON "Warehouse"("orgId");
CREATE INDEX IF NOT EXISTS "Warehouse_factoryId_isActive_idx"
  ON "Warehouse"("factoryId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Warehouse_orgId_fkey') THEN
    ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Warehouse_factoryId_fkey') THEN
    ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_factoryId_fkey"
      FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Warehouse_createdByEmployeeId_fkey') THEN
    ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_createdByEmployeeId_fkey"
      FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Warehouse_updatedByEmployeeId_fkey') THEN
    ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_updatedByEmployeeId_fkey"
      FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "Warehouse" (
  "orgId", "factoryId", "name", "isDefault", "isActive", "createdBy", "updatedAt"
)
SELECT
  factory."orgId", factory."id", '기본 창고', true, true,
  'SYSTEM:WAREHOUSE_BACKFILL', CURRENT_TIMESTAMP
FROM "Factory" factory
WHERE NOT EXISTS (
  SELECT 1 FROM "Warehouse" warehouse WHERE warehouse."factoryId" = factory."id"
);
