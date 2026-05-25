-- Migration: cleanup legacy ctSnapshot field names
-- 구 이름: totalAgreedSeconds / totalAgreedPerPieceSeconds / agreedAt / agreedBy / agreedSeconds / agreedPerPieceSeconds / requestedSeconds / proposedSeconds / ctAgreedSnapshot
-- 신 이름: totalCtSeconds / totalCtPerPieceSeconds / updatedAt / updatedBy / ctSeconds / ctPerPieceSeconds / ctSnapshot

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AssignmentPlan.ctSnapshot: 최상위 키 rename
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "AssignmentPlan"
SET "ctSnapshot" = (
  "ctSnapshot"::jsonb
  - 'totalAgreedSeconds'
  - 'totalAgreedPerPieceSeconds'
  - 'agreedAt'
  - 'agreedBy'
  || CASE WHEN "ctSnapshot"::jsonb ? 'totalAgreedSeconds' AND NOT "ctSnapshot"::jsonb ? 'totalCtSeconds'
          THEN jsonb_build_object('totalCtSeconds', "ctSnapshot"::jsonb -> 'totalAgreedSeconds')
          ELSE '{}'::jsonb END
  || CASE WHEN "ctSnapshot"::jsonb ? 'totalAgreedPerPieceSeconds' AND NOT "ctSnapshot"::jsonb ? 'totalCtPerPieceSeconds'
          THEN jsonb_build_object('totalCtPerPieceSeconds', "ctSnapshot"::jsonb -> 'totalAgreedPerPieceSeconds')
          ELSE '{}'::jsonb END
  || CASE WHEN "ctSnapshot"::jsonb ? 'agreedAt' AND NOT "ctSnapshot"::jsonb ? 'updatedAt'
          THEN jsonb_build_object('updatedAt', "ctSnapshot"::jsonb -> 'agreedAt')
          ELSE '{}'::jsonb END
  || CASE WHEN "ctSnapshot"::jsonb ? 'agreedBy' AND NOT "ctSnapshot"::jsonb ? 'updatedBy'
          THEN jsonb_build_object('updatedBy', "ctSnapshot"::jsonb -> 'agreedBy')
          ELSE '{}'::jsonb END
)
WHERE "ctSnapshot" IS NOT NULL
  AND (
    "ctSnapshot"::jsonb ? 'totalAgreedSeconds'
    OR "ctSnapshot"::jsonb ? 'totalAgreedPerPieceSeconds'
    OR "ctSnapshot"::jsonb ? 'agreedAt'
    OR "ctSnapshot"::jsonb ? 'agreedBy'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AssignmentPlan.ctSnapshot.processes[]: 공정 행 키 rename
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "AssignmentPlan"
SET "ctSnapshot" = jsonb_set(
  "ctSnapshot"::jsonb,
  '{processes}',
  (
    SELECT jsonb_agg(
      elem
      - 'agreedSeconds'
      - 'agreedPerPieceSeconds'
      - 'requestedSeconds'
      - 'proposedSeconds'
      || CASE WHEN (elem ? 'agreedSeconds' OR elem ? 'requestedSeconds' OR elem ? 'proposedSeconds')
                   AND NOT elem ? 'ctSeconds'
              THEN jsonb_build_object('ctSeconds',
                COALESCE(elem -> 'agreedSeconds', elem -> 'requestedSeconds', elem -> 'proposedSeconds'))
              ELSE '{}'::jsonb END
      || CASE WHEN elem ? 'agreedPerPieceSeconds' AND NOT elem ? 'ctPerPieceSeconds'
              THEN jsonb_build_object('ctPerPieceSeconds', elem -> 'agreedPerPieceSeconds')
              ELSE '{}'::jsonb END
    )
    FROM jsonb_array_elements("ctSnapshot"::jsonb -> 'processes') elem
  )
)
WHERE "ctSnapshot" IS NOT NULL
  AND jsonb_typeof("ctSnapshot"::jsonb -> 'processes') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("ctSnapshot"::jsonb -> 'processes') elem
    WHERE elem ? 'agreedSeconds'
      OR elem ? 'agreedPerPieceSeconds'
      OR elem ? 'requestedSeconds'
      OR elem ? 'proposedSeconds'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AssignmentBoardState.assignments: ctAgreedSnapshot → ctSnapshot
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'ctAgreedSnapshot' AND NOT elem ? 'ctSnapshot' THEN
        elem - 'ctAgreedSnapshot'
        || jsonb_build_object('ctSnapshot', elem -> 'ctAgreedSnapshot')
      WHEN elem ? 'ctAgreedSnapshot' THEN
        elem - 'ctAgreedSnapshot'
      ELSE elem
    END
  )
  FROM jsonb_array_elements("assignments"::jsonb) elem
)
WHERE "assignments" IS NOT NULL
  AND jsonb_typeof("assignments"::jsonb) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("assignments"::jsonb) elem
    WHERE elem ? 'ctAgreedSnapshot'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AssignmentBoardState.assignments[].ctSnapshot: 최상위 키 rename
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'ctSnapshot' AND (
        (elem -> 'ctSnapshot') ? 'totalAgreedSeconds'
        OR (elem -> 'ctSnapshot') ? 'totalAgreedPerPieceSeconds'
        OR (elem -> 'ctSnapshot') ? 'agreedAt'
        OR (elem -> 'ctSnapshot') ? 'agreedBy'
      ) THEN
        jsonb_set(
          elem,
          '{ctSnapshot}',
          (elem -> 'ctSnapshot')
          - 'totalAgreedSeconds'
          - 'totalAgreedPerPieceSeconds'
          - 'agreedAt'
          - 'agreedBy'
          || CASE WHEN (elem -> 'ctSnapshot') ? 'totalAgreedSeconds' AND NOT (elem -> 'ctSnapshot') ? 'totalCtSeconds'
                  THEN jsonb_build_object('totalCtSeconds', (elem -> 'ctSnapshot') -> 'totalAgreedSeconds')
                  ELSE '{}'::jsonb END
          || CASE WHEN (elem -> 'ctSnapshot') ? 'totalAgreedPerPieceSeconds' AND NOT (elem -> 'ctSnapshot') ? 'totalCtPerPieceSeconds'
                  THEN jsonb_build_object('totalCtPerPieceSeconds', (elem -> 'ctSnapshot') -> 'totalAgreedPerPieceSeconds')
                  ELSE '{}'::jsonb END
          || CASE WHEN (elem -> 'ctSnapshot') ? 'agreedAt' AND NOT (elem -> 'ctSnapshot') ? 'updatedAt'
                  THEN jsonb_build_object('updatedAt', (elem -> 'ctSnapshot') -> 'agreedAt')
                  ELSE '{}'::jsonb END
          || CASE WHEN (elem -> 'ctSnapshot') ? 'agreedBy' AND NOT (elem -> 'ctSnapshot') ? 'updatedBy'
                  THEN jsonb_build_object('updatedBy', (elem -> 'ctSnapshot') -> 'agreedBy')
                  ELSE '{}'::jsonb END
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements("assignments"::jsonb) elem
)
WHERE "assignments" IS NOT NULL
  AND jsonb_typeof("assignments"::jsonb) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("assignments"::jsonb) elem
    WHERE elem ? 'ctSnapshot' AND (
      (elem -> 'ctSnapshot') ? 'totalAgreedSeconds'
      OR (elem -> 'ctSnapshot') ? 'totalAgreedPerPieceSeconds'
      OR (elem -> 'ctSnapshot') ? 'agreedAt'
      OR (elem -> 'ctSnapshot') ? 'agreedBy'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. AssignmentCard.payload: ctAgreedSnapshot 제거 (stripLegacyAssignmentCardPayload가 신규 저장 시 이미 제거하지만 구 DB 레코드 정리)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "AssignmentCard"
SET "payload" = "payload"::jsonb - 'ctAgreedSnapshot'
WHERE "payload" IS NOT NULL
  AND "payload"::jsonb ? 'ctAgreedSnapshot';
