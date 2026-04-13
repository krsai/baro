-- Replace legacy CT status workflow with a single CT snapshot on AssignmentPlan
ALTER TABLE "AssignmentPlan"
  ADD COLUMN "ctSnapshot" JSONB;

UPDATE "AssignmentPlan" AS plan
SET "ctSnapshot" = COALESCE(
  card."payload" -> 'ctSnapshot',
  card."payload" -> 'ctAgreedSnapshot',
  CASE
    WHEN plan."contractedSeconds" IS NOT NULL AND plan."contractedSeconds" > 0 THEN
      jsonb_build_object(
        'updatedAt', COALESCE(plan."updatedAt", plan."createdAt"),
        'updatedBy', NULLIF(BTRIM(COALESCE(plan."ctAgreedBy", '')), ''),
        'quantity', plan."quantity",
        'totalCtSeconds', plan."contractedSeconds",
        'processes', '[]'::jsonb
      )
    ELSE NULL
  END
)
FROM "AssignmentCard" AS card
WHERE card."orgId" = plan."orgId"
  AND (
    card."cardId" = plan."cardId"
    OR card."cardId" = plan."originOrderId"
  );

UPDATE "AssignmentPlan" AS plan
SET "ctSnapshot" = jsonb_build_object(
  'updatedAt', COALESCE(plan."updatedAt", plan."createdAt"),
  'updatedBy', NULLIF(BTRIM(COALESCE(plan."ctAgreedBy", '')), ''),
  'quantity', plan."quantity",
  'totalCtSeconds', plan."contractedSeconds",
  'processes', '[]'::jsonb
)
WHERE plan."ctSnapshot" IS NULL
  AND plan."contractedSeconds" IS NOT NULL
  AND plan."contractedSeconds" > 0;

ALTER TABLE "AssignmentPlan"
  DROP COLUMN "proposalBasis",
  DROP COLUMN "proposalSeconds",
  DROP COLUMN "ctStatus",
  DROP COLUMN "ctSource",
  DROP COLUMN "ctAgreedBy",
  DROP COLUMN "ctAgreedAt",
  DROP COLUMN "ctNote";

DROP TYPE "CtStatus";
