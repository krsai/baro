ALTER TABLE "SettingServiceDefault" ADD COLUMN IF NOT EXISTS "expenseTypeId" INTEGER;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='SettingServiceDefault_expenseTypeId_fkey') THEN
  ALTER TABLE "SettingServiceDefault" ADD CONSTRAINT "SettingServiceDefault_expenseTypeId_fkey" FOREIGN KEY("expenseTypeId") REFERENCES "ExpenseType"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;
-- Only existing FK evidence with one distinct parent is sufficient. Ambiguous
-- or unused historical masters remain unclassified for explicit administrator review.
UPDATE "SettingServiceDefault" s SET "expenseTypeId"=b.parent
FROM (SELECT "serviceTypeId",min("expenseTypeId") parent FROM "TransactionCodeBase" GROUP BY "serviceTypeId" HAVING count(DISTINCT "expenseTypeId")=1) b
WHERE s.id=b."serviceTypeId" AND s."expenseTypeId" IS NULL;
