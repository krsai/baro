WITH manual_plans AS (
  SELECT
    plan."id" AS "assignmentPlanId",
    plan."orgId",
    plan."styleId",
    plan."assignmentQuantity",
    plan."closedAt",
    process_row.value AS process
  FROM "AssignmentPlan" plan
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(plan."assignmentCtSnapshot"->'processes') = 'array'
        THEN plan."assignmentCtSnapshot"->'processes'
      ELSE '[]'::jsonb
    END
  ) AS process_row(value)
  WHERE plan."isCompleted" = true
    AND plan."completionReason" IN ('MANUAL_PROGRESS_ADJUSTMENT', 'RECORD_OMISSION')
    AND plan."assignmentQuantity" > 0
),
required_processes AS (
  SELECT DISTINCT
    "assignmentPlanId",
    "orgId",
    "styleId",
    "assignmentQuantity",
    "closedAt",
    NULLIF(process->>'styleProcessId', '')::integer AS "styleProcessId"
  FROM manual_plans
  WHERE (process->>'styleProcessId') ~ '^[0-9]+$'
),
recorded_quantities AS (
  SELECT
    record."assignmentPlanId",
    record."styleProcessId",
    SUM(record."quantity") AS "recordedQuantity"
  FROM "WorkRecord" record
  WHERE record."assignmentPlanId" IS NOT NULL
    AND record."styleProcessId" IS NOT NULL
  GROUP BY record."assignmentPlanId", record."styleProcessId"
),
incomplete_processes AS (
  SELECT
    required.*
  FROM required_processes required
  LEFT JOIN recorded_quantities recorded
    ON recorded."assignmentPlanId" = required."assignmentPlanId"
   AND recorded."styleProcessId" = required."styleProcessId"
  WHERE COALESCE(recorded."recordedQuantity", 0) < required."assignmentQuantity"
),
eligible_plans AS (
  SELECT
    "assignmentPlanId",
    MIN("orgId") AS "orgId",
    MIN("styleId") AS "styleId",
    MIN("styleProcessId") AS "styleProcessId",
    MIN("closedAt") AS "approvedAt"
  FROM incomplete_processes
  GROUP BY "assignmentPlanId"
  HAVING COUNT(DISTINCT "styleProcessId") = 1
)
UPDATE "StyleProcess" process
SET
  "atStFallbackApproved" = true,
  "atStFallbackSourceAssignmentPlanId" = eligible."assignmentPlanId",
  "atStFallbackApprovedAt" = COALESCE(eligible."approvedAt", NOW())
FROM eligible_plans eligible
WHERE process."id" = eligible."styleProcessId"
  AND process."orgId" = eligible."orgId"
  AND process."styleId" = eligible."styleId"
  AND process."atStFallbackApproved" = false;
