ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "purposeCodeId" INTEGER;
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "revisesEntryId" TEXT;
ALTER TABLE "BankLedgerSettlementLine" ADD COLUMN IF NOT EXISTS "purposeCodeId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionCode_id_ownerOrgId_key" ON "TransactionCode"(id,"ownerOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "BankLedgerEntry_revisesEntryId_key" ON "BankLedgerEntry"("revisesEntryId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerEntry_purpose_scope_fkey') THEN ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_purpose_scope_fkey" FOREIGN KEY("purposeCodeId","orgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerSettlementLine_purpose_scope_fkey') THEN ALTER TABLE "BankLedgerSettlementLine" ADD CONSTRAINT "BankLedgerSettlementLine_purpose_scope_fkey" FOREIGN KEY("purposeCodeId","orgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerEntry_revision_scope_fkey') THEN ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_revision_scope_fkey" FOREIGN KEY("revisesEntryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT; END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_ledger_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."revisesEntryId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" source_entry WHERE source_entry.id=NEW."revisesEntryId" AND source_entry."orgId"=NEW."orgId" AND source_entry."voidedAt" IS NOT NULL AND source_entry.id<>NEW.id) THEN RAISE EXCEPTION 'LEDGER_ENTRY_CHANGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankLedgerEntry_revision_guard" ON "BankLedgerEntry";
CREATE TRIGGER "BankLedgerEntry_revision_guard" BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_revision_guard();
