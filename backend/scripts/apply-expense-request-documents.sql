-- Expense documents group existing cost rows without replacing production/accounting facts.
CREATE TABLE IF NOT EXISTS "ExpenseRequest" (
  id SERIAL PRIMARY KEY,
  "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
  "partnerOrgId" INTEGER NOT NULL,
  "createdByEmployeeId" INTEGER NOT NULL,
  "requestDate" TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  currency TEXT NOT NULL CHECK (currency IN ('VND','USD','KRW')),
  "clientKey" TEXT NOT NULL,
  "submissionHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseRequest_partnerOrgId_orgId_fkey" FOREIGN KEY ("partnerOrgId","orgId") REFERENCES "Organization"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ExpenseRequest_createdByEmployeeId_orgId_fkey" FOREIGN KEY ("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_orgId_clientKey_key" ON "ExpenseRequest"("orgId","clientKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_id_orgId_partnerOrgId_currency_key" ON "ExpenseRequest"(id,"orgId","partnerOrgId",currency);
CREATE INDEX IF NOT EXISTS "ExpenseRequest_orgId_requestDate_idx" ON "ExpenseRequest"("orgId","requestDate");
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "expenseRequestId" INTEGER;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "expenseRequestLine" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTransactionCost_expenseRequestId_expenseRequestLine_key" ON "PartnerTransactionCost"("expenseRequestId","expenseRequestLine");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PartnerTransactionCost_expense_request_fkey') THEN
    ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "PartnerTransactionCost_expense_request_fkey"
    FOREIGN KEY ("expenseRequestId","orgId","partnerOrgId",currency) REFERENCES "ExpenseRequest"(id,"orgId","partnerOrgId",currency) ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ExpenseRequestLine_pair_check') THEN
    ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "ExpenseRequestLine_pair_check"
    CHECK (("expenseRequestId" IS NULL AND "expenseRequestLine" IS NULL) OR ("expenseRequestId" IS NOT NULL AND "expenseRequestLine" IS NOT NULL AND "expenseRequestLine" > 0));
  END IF;
END $$;
