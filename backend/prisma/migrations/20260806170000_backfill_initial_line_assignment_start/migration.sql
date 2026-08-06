-- Restore initial active line assignments to the managed employment start.
-- Workers with prior move history are intentionally excluded.
WITH "EligibleInitialAssignments" AS (
  SELECT
    la."id",
    GREATEST(
      CASE
        WHEN f."managementStartDate" ~ '^\d{4}-\d{2}-\d{2}$'
          THEN f."managementStartDate"::date
        ELSE DATE '2026-04-01'
      END,
      e."joinedAt"::date
    ) AS "desiredStartDate"
  FROM "LineAssignment" la
  JOIN "Employee" e ON e."id" = la."employeeId"
  JOIN "Line" l ON l."id" = la."lineId"
  JOIN "Factory" f ON f."id" = l."factoryId"
  WHERE e."status" = 'ACTIVE'
    AND e."orgRole" = 'WORKER'
    AND e."joinedAt" IS NOT NULL
    AND la."endAt" IS NULL
    AND (
      SELECT COUNT(*)
      FROM "LineAssignment" history
      WHERE history."employeeId" = la."employeeId"
    ) = 1
)
UPDATE "LineAssignment" la
SET "startAt" = eligible."desiredStartDate"::timestamp + INTERVAL '12 hours'
FROM "EligibleInitialAssignments" eligible
WHERE la."id" = eligible."id"
  AND la."startAt" > eligible."desiredStartDate"::timestamp + INTERVAL '12 hours';
