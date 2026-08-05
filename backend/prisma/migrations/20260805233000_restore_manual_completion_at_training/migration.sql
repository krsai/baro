UPDATE "AssignmentPlan"
SET
  "atTrainingExcluded" = false,
  "atTrainingExclusionReason" = NULL
WHERE "completionReason" IN ('MANUAL_PROGRESS_ADJUSTMENT', 'RECORD_OMISSION')
  AND (
    "atTrainingExcluded" = true
    OR "atTrainingExclusionReason" IS NOT NULL
  );
