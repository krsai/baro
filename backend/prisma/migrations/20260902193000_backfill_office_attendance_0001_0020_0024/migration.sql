-- One-time attendance backfill requested for the three BARO office employees.
-- Existing attendance is authoritative and is never overwritten.
WITH target_organization AS (
  SELECT employee."orgId"
  FROM "Employee" AS employee
  WHERE LOWER(TRIM(COALESCE(employee."email", ''))) = 'baro.garment@gmail.com'
    AND employee."employeeNo" = '0001'
  LIMIT 1
),
office_policy AS (
  SELECT
    organization."orgId",
    COALESCE(policy."workWeekdays", '[1,2,3,4,5]'::jsonb) AS "workWeekdays",
    COALESCE(policy."standardClockIn", '08:00') AS "clockIn",
    COALESCE(policy."standardClockOut", '17:00') AS "clockOut",
    COALESCE(policy."breakMinutes", 60) AS "breakMinutes"
  FROM target_organization AS organization
  LEFT JOIN "EmployeePayTypePolicy" AS policy
    ON policy."orgId" = organization."orgId"
   AND policy."payType" = 'GENERAL'
),
target_employees AS (
  SELECT
    employee."id" AS "workerId",
    employee."orgId",
    employee."factoryId",
    GREATEST(employee."joinedAt"::date, DATE '2026-04-01') AS "startDate"
  FROM "Employee" AS employee
  INNER JOIN target_organization AS organization
    ON organization."orgId" = employee."orgId"
  WHERE employee."employeeNo" IN ('0001', '0020', '0024')
    AND employee."joinedAt" IS NOT NULL
    AND employee."factoryId" IS NOT NULL
),
attendance_rows AS (
  SELECT
    employee."orgId",
    employee."factoryId",
    employee."workerId",
    work_date::date,
    policy."clockIn",
    policy."clockOut",
    GREATEST(
      0,
      (
        CASE
          WHEN policy."clockOut"::time >= policy."clockIn"::time
            THEN EXTRACT(EPOCH FROM (policy."clockOut"::time - policy."clockIn"::time))
          ELSE 86400
            - EXTRACT(EPOCH FROM policy."clockIn"::time)
            + EXTRACT(EPOCH FROM policy."clockOut"::time)
        END
        - policy."breakMinutes" * 60
      )::integer
    ) AS "workedSeconds"
  FROM target_employees AS employee
  INNER JOIN office_policy AS policy
    ON policy."orgId" = employee."orgId"
  CROSS JOIN LATERAL generate_series(
    employee."startDate"::timestamp,
    DATE '2026-09-02'::timestamp,
    INTERVAL '1 day'
  ) AS work_date
  WHERE EXTRACT(ISODOW FROM work_date)::integer IN (
    SELECT weekday.value::integer
    FROM jsonb_array_elements_text(policy."workWeekdays") AS weekday(value)
  )
    AND NOT EXISTS (
      SELECT 1
      FROM "OrganizationHoliday" AS holiday
      WHERE holiday."orgId" = employee."orgId"
        AND holiday."holidayDate" = TO_CHAR(work_date, 'YYYY-MM-DD')
    )
)
INSERT INTO "AttendanceEntry" (
  "orgId", "factoryId", "workerId", "workDate", "clockIn", "clockOut",
  "workedSeconds", "note", "createdBy", "createdAt", "updatedAt"
)
SELECT
  row."orgId",
  row."factoryId",
  row."workerId",
  TO_CHAR(row.work_date, 'YYYY-MM-DD'),
  row."clockIn",
  row."clockOut",
  row."workedSeconds",
  'Office attendance backfill through 2026-09-02',
  'system@baro.local',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM attendance_rows AS row
ON CONFLICT ("orgId", "factoryId", "workerId", "workDate") DO NOTHING;
