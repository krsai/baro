-- Explicitly assign every unassigned employee, including terminated, suspended,
-- pending, and active employees, to the Hanoi factory in the same organization.
-- Prefer the canonical HN code, then the known Hanoi names.
WITH hanoi_factories AS (
  SELECT
    factory."orgId",
    factory."id" AS "factoryId",
    ROW_NUMBER() OVER (
      PARTITION BY factory."orgId"
      ORDER BY
        CASE WHEN UPPER(TRIM(COALESCE(factory."factoryCode", ''))) = 'HN' THEN 0 ELSE 1 END,
        factory."id"
    ) AS priority
  FROM "Factory" AS factory
  WHERE UPPER(TRIM(COALESCE(factory."factoryCode", ''))) = 'HN'
     OR UPPER(TRIM(COALESCE(factory."name", ''))) = 'HANOI'
     OR TRIM(COALESCE(factory."nameKo", '')) = '하노이'
)
UPDATE "Employee" AS employee
SET "factoryId" = hanoi."factoryId"
FROM hanoi_factories AS hanoi
WHERE employee."orgId" = hanoi."orgId"
  AND employee."factoryId" IS NULL
  AND hanoi.priority = 1;
