ALTER TABLE "Factory"
ADD CONSTRAINT "Factory_id_orgId_key" UNIQUE ("id", "orgId");

CREATE TABLE "Warehouse" (
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

CREATE UNIQUE INDEX "Warehouse_factoryId_name_key" ON "Warehouse"("factoryId", "name");
CREATE UNIQUE INDEX "Warehouse_one_active_default_per_factory_key"
ON "Warehouse"("factoryId") WHERE "isDefault" = true AND "isActive" = true;
CREATE INDEX "Warehouse_orgId_idx" ON "Warehouse"("orgId");
CREATE INDEX "Warehouse_factoryId_isActive_idx" ON "Warehouse"("factoryId", "isActive");

ALTER TABLE "Warehouse"
ADD CONSTRAINT "Warehouse_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warehouse"
ADD CONSTRAINT "Warehouse_factoryId_orgId_fkey" FOREIGN KEY ("factoryId", "orgId") REFERENCES "Factory"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warehouse"
ADD CONSTRAINT "Warehouse_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Warehouse"
ADD CONSTRAINT "Warehouse_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Warehouse" ("orgId", "factoryId", "name", "isDefault", "isActive", "createdBy", "updatedAt")
SELECT f."orgId", f."id", '창고 1', true, true, 'SYSTEM:WAREHOUSE_BACKFILL', CURRENT_TIMESTAMP
FROM "Factory" f
WHERE NOT EXISTS (SELECT 1 FROM "Warehouse" w WHERE w."factoryId" = f."id");
