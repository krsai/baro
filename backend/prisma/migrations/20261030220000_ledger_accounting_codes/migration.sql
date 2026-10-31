-- Preserve all historical purpose text, balances, code identities and document links.
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "accountingCodeId" INTEGER;
ALTER TABLE "BankLedgerSettlementLine" ADD COLUMN IF NOT EXISTS "accountingCodeId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionCode_id_ownerOrgId_key" ON "TransactionCode"(id,"ownerOrgId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerEntry_accounting_code_scope_fkey') THEN
 ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_accounting_code_scope_fkey" FOREIGN KEY("accountingCodeId","orgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerSettlementLine_accounting_code_scope_fkey') THEN
 ALTER TABLE "BankLedgerSettlementLine" ADD CONSTRAINT "BankLedgerSettlementLine_accounting_code_scope_fkey" FOREIGN KEY("accountingCodeId","orgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_ledger_accounting_code_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."accountingCodeId" IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId"
 JOIN "ExpenseType" category ON category.id=b."expenseTypeId"
 JOIN "TaxTreatment" tax ON tax.id=c."taxTreatmentId"
 WHERE c.id=NEW."accountingCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."isActive" AND b."isActive" AND category."isActive"
 AND EXISTS(SELECT 1 FROM "SettingTransactionCodeDefault" variant WHERE variant."baseId"=b.id AND variant."taxTreatmentId"=tax.id AND variant."isActive" AND variant."isEnabled")) THEN RAISE EXCEPTION 'LEDGER_ACCOUNTING_CODE_INVALID'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankLedgerEntry_accounting_code_guard" ON "BankLedgerEntry";
CREATE TRIGGER "BankLedgerEntry_accounting_code_guard" BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_accounting_code_guard();
DROP TRIGGER IF EXISTS "BankLedgerSettlementLine_accounting_code_guard" ON "BankLedgerSettlementLine";
CREATE TRIGGER "BankLedgerSettlementLine_accounting_code_guard" BEFORE INSERT ON "BankLedgerSettlementLine" FOR EACH ROW EXECUTE FUNCTION baro_ledger_accounting_code_guard();
