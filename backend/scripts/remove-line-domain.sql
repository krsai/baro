-- Replace the retired Line domain with canonical Factory ownership.
-- Run before prisma db push. Every change is atomic;
-- ambiguous ownership aborts the transaction instead of guessing a factory.
BEGIN;

DO $migration$
BEGIN
  IF to_regclass('"Line"') IS NULL THEN
    IF to_regclass('"LineAssignment"') IS NOT NULL THEN
      RAISE EXCEPTION 'Line is absent but LineAssignment remains; review incomplete migration';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name IN ('Employee', 'AssignmentPlan', 'WorkRecord', 'OutsourcedWorkRecord') AND column_name = 'lineId') THEN
      RAISE EXCEPTION 'Line is absent but lineId columns remain; review incomplete migration';
    END IF;
    RETURN;
  END IF;

  LOCK TABLE "Line", "Factory", "Employee", "AssignmentPlan", "WorkLog", "WorkRecord", "OutsourcedWorkRecord" IN ACCESS EXCLUSIVE MODE;
  IF to_regclass('"LineAssignment"') IS NOT NULL THEN
    LOCK TABLE "LineAssignment" IN ACCESS EXCLUSIVE MODE;
  END IF;

  ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "factoryId" integer;

  IF EXISTS (SELECT 1 FROM "Line" l LEFT JOIN "Factory" f ON f.id = l."factoryId"
    WHERE f.id IS NULL OR f."orgId" <> l."orgId") THEN
    RAISE EXCEPTION 'Line has invalid factory/org ownership';
  END IF;

  -- ID joins only. Multiple former lines in one factory are valid and collapse
  -- into the same factory scope; no one-line-per-factory prerequisite remains.
  IF EXISTS (SELECT 1 FROM "AssignmentPlan" p LEFT JOIN "Line" l ON l.id = p."lineId"
    WHERE l.id IS NULL OR l."orgId" <> p."orgId"
      OR (p."factoryId" IS NOT NULL AND p."factoryId" <> l."factoryId")) THEN
    RAISE EXCEPTION 'AssignmentPlan factory conflicts with its original line';
  END IF;
  UPDATE "AssignmentPlan" p SET "factoryId" = l."factoryId"
    FROM "Line" l WHERE l.id = p."lineId" AND p."factoryId" IS NULL;

  IF EXISTS (SELECT 1 FROM "Employee" e JOIN "Line" l ON l.id = e."lineId"
    WHERE e."orgId" <> l."orgId" OR (e."factoryId" IS NOT NULL AND e."factoryId" <> l."factoryId")) THEN
    RAISE EXCEPTION 'Employee current factory conflicts with its original line';
  END IF;
  UPDATE "Employee" e SET "factoryId" = l."factoryId"
    FROM "Line" l WHERE l.id = e."lineId" AND e."factoryId" IS NULL;

  -- A cross-factory employment history needs an explicit historical ownership
  -- model before it can be removed. Do not silently discard that distinction.
  IF to_regclass('"LineAssignment"') IS NOT NULL AND EXISTS (
    SELECT 1 FROM "LineAssignment" a
      JOIN "Line" l ON l.id = a."lineId" JOIN "Employee" e ON e.id = a."employeeId"
    WHERE e."orgId" <> l."orgId" OR e."factoryId" IS DISTINCT FROM l."factoryId"
  ) THEN
    RAISE EXCEPTION 'Historical staff assignments span factories; review before removal';
  END IF;

  CREATE TEMP TABLE factory_scope_evidence (
    log_id integer, org_id integer, factory_id integer
  ) ON COMMIT DROP;
  INSERT INTO factory_scope_evidence SELECT id, "orgId", "factoryId" FROM "WorkLog" WHERE "factoryId" IS NOT NULL;
  INSERT INTO factory_scope_evidence
    SELECT r."workLogId", l."orgId", l."factoryId" FROM "WorkRecord" r JOIN "Line" l ON l.id = r."lineId"
    UNION ALL SELECT r."workLogId", l."orgId", l."factoryId" FROM "OutsourcedWorkRecord" r JOIN "Line" l ON l.id = r."lineId"
    UNION ALL SELECT r."workLogId", p."orgId", p."factoryId" FROM "WorkRecord" r JOIN "AssignmentPlan" p ON p.id = r."assignmentPlanId"
    UNION ALL SELECT r."workLogId", p."orgId", p."factoryId" FROM "OutsourcedWorkRecord" r JOIN "AssignmentPlan" p ON p.id = r."assignmentPlanId";
  INSERT INTO factory_scope_evidence
    SELECT w.id, l."orgId", l."factoryId" FROM "WorkLog" w JOIN "Line" l
    ON l.id::text = w.records->>'lineId' WHERE jsonb_typeof(w.records) = 'object';

  IF EXISTS (SELECT 1 FROM factory_scope_evidence e JOIN "WorkLog" w ON w.id = e.log_id
    LEFT JOIN "Factory" f ON f.id = e.factory_id
    WHERE e.org_id <> w."orgId" OR f.id IS NULL OR f."orgId" <> w."orgId")
    OR EXISTS (SELECT log_id FROM factory_scope_evidence GROUP BY log_id HAVING count(DISTINCT factory_id) <> 1) THEN
    RAISE EXCEPTION 'WorkLog factory evidence is ambiguous or crosses organizations';
  END IF;
  UPDATE "WorkLog" w SET "factoryId" = e.factory_id
    FROM (SELECT log_id, min(factory_id) AS factory_id FROM factory_scope_evidence GROUP BY log_id) e
    WHERE w.id = e.log_id AND w."factoryId" IS NULL;
  IF EXISTS (SELECT 1 FROM "WorkLog" w WHERE w."factoryId" IS NULL AND
    (EXISTS (SELECT 1 FROM "WorkRecord" r WHERE r."workLogId" = w.id)
      OR EXISTS (SELECT 1 FROM "OutsourcedWorkRecord" r WHERE r."workLogId" = w.id))) THEN
    RAISE EXCEPTION 'Work records have no provable factory';
  END IF;
  IF EXISTS (SELECT 1 FROM "WorkRecord" r JOIN "WorkLog" w ON w.id = r."workLogId" WHERE r."orgId" <> w."orgId")
    OR EXISTS (SELECT 1 FROM "OutsourcedWorkRecord" r JOIN "WorkLog" w ON w.id = r."workLogId" WHERE r."orgId" <> w."orgId") THEN
    RAISE EXCEPTION 'Work record organization differs from WorkLog';
  END IF;

  -- Only remove retired header metadata. Production rows and frozen payroll /
  -- CT / ST snapshots are never regenerated, repriced, or rewritten here.
  UPDATE "WorkLog" SET records = records - 'lineId' - 'lineName'
    WHERE jsonb_typeof(records) = 'object' AND (records ? 'lineId' OR records ? 'lineName');

  -- The board JSON is a deprecated mirror; canonical AssignmentPlan owns scope.
  IF to_regclass('"AssignmentBoardState"') IS NOT NULL THEN
    UPDATE "AssignmentBoardState" b SET assignments = (
      SELECT COALESCE(jsonb_agg((item - 'lineId' - 'lineName') ||
        CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('factoryId', p."factoryId") ELSE '{}'::jsonb END ORDER BY ordinal), '[]'::jsonb)
      FROM jsonb_array_elements(b.assignments) WITH ORDINALITY AS entry(item, ordinal)
      LEFT JOIN "AssignmentPlan" p ON p."orgId" = b."orgId" AND p."externalId" = COALESCE(item->>'id', item->>'externalId')
    ) WHERE jsonb_typeof(b.assignments) = 'array';
  END IF;

  ALTER TABLE "AssignmentPlan" ALTER COLUMN "factoryId" SET NOT NULL;
  CREATE INDEX IF NOT EXISTS "AssignmentPlan_orgId_factoryId_idx" ON "AssignmentPlan"("orgId", "factoryId");
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"AssignmentPlan"'::regclass AND conname = 'AssignmentPlan_factory_org_fkey') THEN
    ALTER TABLE "AssignmentPlan" ADD CONSTRAINT "AssignmentPlan_factory_org_fkey"
      FOREIGN KEY ("factoryId", "orgId") REFERENCES "Factory"(id, "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- Do not use CASCADE: an unexpected dependent table must stop deployment.
  ALTER TABLE "Employee" DROP COLUMN "lineId";
  ALTER TABLE "AssignmentPlan" DROP COLUMN "lineId";
  ALTER TABLE "WorkRecord" DROP COLUMN "lineId";
  ALTER TABLE "OutsourcedWorkRecord" DROP COLUMN "lineId";
  DROP TABLE IF EXISTS "LineAssignment";
  DROP TABLE "Line";
END
$migration$;
COMMIT;
