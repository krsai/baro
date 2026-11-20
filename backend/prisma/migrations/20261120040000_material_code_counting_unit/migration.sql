ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "materialUnitId" integer;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TransactionCodeBase_materialUnit_fkey' AND conrelid='"TransactionCodeBase"'::regclass) THEN
  ALTER TABLE "TransactionCodeBase" ADD CONSTRAINT "TransactionCodeBase_materialUnit_fkey" FOREIGN KEY ("materialUnitId") REFERENCES "ExpenseUnit"(id) ON DELETE RESTRICT;
 END IF;
END $$;
