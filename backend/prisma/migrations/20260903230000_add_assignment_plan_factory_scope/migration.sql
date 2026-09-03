ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "factoryId" INTEGER;

UPDATE "AssignmentPlan" AS plan
SET "factoryId" = line."factoryId"
FROM "Line" AS line
WHERE plan."lineId" = line."id"
  AND plan."factoryId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT "factoryId"
    FROM "Line"
    GROUP BY "factoryId"
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Line removal requires exactly one legacy Line per factory; resolve factory line counts before deployment.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "AssignmentPlan" AS plan
    LEFT JOIN "Line" AS line ON line."id" = plan."lineId"
    WHERE plan."factoryId" IS NULL
       OR line."id" IS NULL
       OR line."orgId" <> plan."orgId"
       OR line."factoryId" <> plan."factoryId"
  ) THEN
    RAISE EXCEPTION 'AssignmentPlan factory backfill is ambiguous or inconsistent; resolve invalid line/org/factory rows before deployment.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AssignmentPlan_orgId_factoryId_idx"
  ON "AssignmentPlan"("orgId", "factoryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AssignmentPlan_factory_org_fkey'
  ) THEN
    ALTER TABLE "AssignmentPlan"
      ADD CONSTRAINT "AssignmentPlan_factory_org_fkey"
      FOREIGN KEY ("factoryId", "orgId")
      REFERENCES "Factory"("id", "orgId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
