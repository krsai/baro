-- CreateTable
CREATE TABLE "AssignmentCard" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "cardId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentCard_orgId_cardId_key" ON "AssignmentCard"("orgId", "cardId");

-- CreateIndex
CREATE INDEX "AssignmentCard_orgId_sortOrder_id_idx" ON "AssignmentCard"("orgId", "sortOrder", "id");

-- AddForeignKey
ALTER TABLE "AssignmentCard"
ADD CONSTRAINT "AssignmentCard_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill existing cards stored in AssignmentBoardState.cards
INSERT INTO "AssignmentCard" (
    "orgId",
    "cardId",
    "sortOrder",
    "payload",
    "createdAt",
    "updatedAt"
)
SELECT
    s."orgId",
    elem ->> 'id' AS "cardId",
    GREATEST((ordinality::int) - 1, 0) AS "sortOrder",
    elem AS "payload",
    s."createdAt",
    s."updatedAt"
FROM "AssignmentBoardState" s
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s."cards", '[]'::jsonb)) WITH ORDINALITY AS arr(elem, ordinality)
WHERE jsonb_typeof(elem) = 'object'
  AND COALESCE(elem ->> 'id', '') <> ''
ON CONFLICT ("orgId", "cardId") DO UPDATE
SET
    "payload" = EXCLUDED."payload",
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = EXCLUDED."updatedAt";