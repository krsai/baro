-- Weekday full-attendance backfill for the three specified BARO office employees.
WITH target_organization AS (
  SELECT employee."orgId" FROM "Employee" AS employee
  WHERE employee."employeeNo" = '0001'
    AND LOWER(TRIM(COALESCE(employee."email", ''))) = 'baro.garment@gmail.com'
  LIMIT 1
),
target_employees AS (
  SELECT employee."id" AS "workerId", employee."orgId", employee."factoryId",
    GREATEST(employee."joinedAt"::date, DATE '2026-04-01') AS "startDate"
  FROM "Employee" AS employee
  INNER JOIN target_organization AS organization ON organization."orgId" = employee."orgId"
  WHERE employee."employeeNo" IN ('0001', '0020', '0024')
    AND employee."joinedAt" IS NOT NULL AND employee."factoryId" IS NOT NULL
),
attendance_rows AS (
  SELECT employee."orgId", employee."factoryId", employee."workerId", work_date::date AS "workDate"
  FROM target_employees AS employee
  CROSS JOIN LATERAL generate_series(employee."startDate"::timestamp, DATE '2026-08-31'::timestamp, INTERVAL '1 day') AS work_date
  WHERE EXTRACT(ISODOW FROM work_date)::integer BETWEEN 1 AND 5
)
INSERT INTO "AttendanceEntry" (
  "orgId", "factoryId", "workerId", "workDate", "clockIn", "clockOut",
  "workedSeconds", "note", "createdBy", "createdAt", "updatedAt"
)
SELECT row."orgId", row."factoryId", row."workerId", TO_CHAR(row."workDate", 'YYYY-MM-DD'),
  '08:00', '17:00', 28800, 'Office weekday full-attendance backfill through 2026-08-31',
  'system@baro.local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM attendance_rows AS row
ON CONFLICT ("orgId", "factoryId", "workerId", "workDate") DO UPDATE SET
  "clockIn" = EXCLUDED."clockIn", "clockOut" = EXCLUDED."clockOut",
  "workedSeconds" = EXCLUDED."workedSeconds", "note" = EXCLUDED."note", "updatedAt" = CURRENT_TIMESTAMP;
