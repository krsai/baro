CREATE TEMP TABLE "_AttrColorKeep" AS
SELECT DISTINCT ON ("code") "id", "code"
FROM "AttrColor"
WHERE TRIM(COALESCE("code", '')) <> ''
ORDER BY "code", "id";

UPDATE "WorkOrderItem" AS item
SET "colorId" = keep."id"
FROM "AttrColor" AS color
JOIN "_AttrColorKeep" AS keep ON keep."code" = color."code"
WHERE item."colorId" = color."id"
  AND color."id" <> keep."id";

UPDATE "WorkRecord" AS record
SET "colorId" = keep."id"
FROM "AttrColor" AS color
JOIN "_AttrColorKeep" AS keep ON keep."code" = color."code"
WHERE record."colorId" = color."id"
  AND color."id" <> keep."id";

UPDATE "AssignmentPlan" AS plan
SET "colorId" = keep."id"
FROM "AttrColor" AS color
JOIN "_AttrColorKeep" AS keep ON keep."code" = color."code"
WHERE plan."colorId" = color."id"
  AND color."id" <> keep."id";

DELETE FROM "AttrColor" AS color
USING "_AttrColorKeep" AS keep
WHERE color."code" = keep."code"
  AND color."id" <> keep."id";

DELETE FROM "AttrColor"
WHERE TRIM(COALESCE("code", '')) = '';

ALTER TABLE "AttrColor" DROP CONSTRAINT IF EXISTS "AttrColor_orgId_fkey";
ALTER TABLE "AttrColor" DROP CONSTRAINT IF EXISTS "AttrColor_orgId_code_key";
DROP INDEX IF EXISTS "AttrColor_orgId_idx";

ALTER TABLE "AttrColor" DROP COLUMN IF EXISTS "orgId";

DROP INDEX IF EXISTS "AttrColor_code_key";
CREATE UNIQUE INDEX "AttrColor_code_key" ON "AttrColor"("code");

DROP TABLE "_AttrColorKeep";
