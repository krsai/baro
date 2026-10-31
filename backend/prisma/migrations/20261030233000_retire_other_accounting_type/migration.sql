-- Retire the catch-all classification; preserve all IDs, amounts and document history.
UPDATE "ExpenseType" SET "isActive"=false WHERE code='OTHER';
UPDATE "TransactionCodeBase" b SET "isActive"=false
FROM "ExpenseType" t WHERE b."expenseTypeId"=t.id AND t.code='OTHER';
UPDATE "SettingTransactionCodeDefault" c SET "isActive"=false,"isEnabled"=false
FROM "TransactionCodeBase" b JOIN "ExpenseType" t ON t.id=b."expenseTypeId"
WHERE c."baseId"=b.id AND t.code='OTHER';
UPDATE "TransactionCode" c SET "isActive"=false
FROM "TransactionCodeBase" b JOIN "ExpenseType" t ON t.id=b."expenseTypeId"
WHERE c."baseId"=b.id AND t.code='OTHER';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ExpenseType_other_retired') THEN
 ALTER TABLE "ExpenseType" ADD CONSTRAINT "ExpenseType_other_retired" CHECK (code<>'OTHER' OR NOT "isActive");
 END IF;
END $$;
