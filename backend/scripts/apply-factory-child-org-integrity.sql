CREATE UNIQUE INDEX IF NOT EXISTS "Factory_id_org_key"
  ON "Factory"("id", "orgId");

DO $$
BEGIN
  IF to_regclass('"Warehouse"') IS NOT NULL THEN
    UPDATE "Warehouse" warehouse
    SET "orgId" = factory."orgId"
    FROM "Factory" factory
    WHERE factory."id" = warehouse."factoryId"
      AND warehouse."orgId" IS DISTINCT FROM factory."orgId";

    ALTER TABLE "Warehouse"
      DROP CONSTRAINT IF EXISTS "Warehouse_factoryId_fkey";

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = '"Warehouse"'::regclass
        AND conname = 'Warehouse_factory_org_fkey'
    ) THEN
      ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_factory_org_fkey"
        FOREIGN KEY ("factoryId", "orgId")
        REFERENCES "Factory"("id", "orgId")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF to_regclass('"FactoryProductionAllowanceRate"') IS NOT NULL THEN
    UPDATE "FactoryProductionAllowanceRate" rate
    SET "orgId" = factory."orgId"
    FROM "Factory" factory
    WHERE factory."id" = rate."factoryId"
      AND rate."orgId" IS DISTINCT FROM factory."orgId";

    ALTER TABLE "FactoryProductionAllowanceRate"
      DROP CONSTRAINT IF EXISTS "FactoryProductionAllowanceRate_factoryId_fkey";

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = '"FactoryProductionAllowanceRate"'::regclass
        AND conname = 'FactoryProductionAllowanceRate_factory_org_fkey'
    ) THEN
      ALTER TABLE "FactoryProductionAllowanceRate"
        ADD CONSTRAINT "FactoryProductionAllowanceRate_factory_org_fkey"
        FOREIGN KEY ("factoryId", "orgId")
        REFERENCES "Factory"("id", "orgId")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
