-- READY_TO_COMPLETE was an intermediate state between work-record completion and
-- production completion. The workflow now has only IN_PROGRESS, REVIEW_REQUIRED,
-- and PRODUCTION_COMPLETED, so existing rows are finalized without losing their
-- recorded completion date or quantity.
UPDATE "AssignmentPlan"
SET
  "scheduleStatus" = 'PRODUCTION_COMPLETED',
  "isCompleted" = TRUE,
  "productionCompletedAt" = COALESCE(
    "productionCompletedAt",
    "completedAt",
    "closedAt",
    "updatedAt",
    CURRENT_TIMESTAMP
  ),
  "completedAt" = COALESCE(
    "completedAt",
    "productionCompletedAt",
    "closedAt",
    "updatedAt",
    CURRENT_TIMESTAMP
  ),
  "closedAt" = COALESCE(
    "closedAt",
    "productionCompletedAt",
    "completedAt",
    "updatedAt",
    CURRENT_TIMESTAMP
  ),
  "finalQuantity" = COALESCE("finalQuantity", "closedQty", "assignmentQuantity", 0),
  "closedQty" = COALESCE("closedQty", "finalQuantity", "assignmentQuantity", 0),
  "closedBy" = COALESCE("closedBy", 'system:ready-to-completed-migration'),
  "closeMode" = COALESCE(
    "closeMode",
    (CASE
      WHEN COALESCE("closedQty", "finalQuantity", "assignmentQuantity", 0) < COALESCE("assignmentQuantity", 0)
        THEN 'SHORT'
      WHEN COALESCE("closedQty", "finalQuantity", "assignmentQuantity", 0) > COALESCE("assignmentQuantity", 0)
        THEN 'OVER'
      ELSE 'FULL'
    END)::"AssignmentCloseMode"
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "scheduleStatus" = 'READY_TO_COMPLETE';
