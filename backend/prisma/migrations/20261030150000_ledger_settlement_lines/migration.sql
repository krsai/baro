ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "writeOffAmount" DECIMAL(24,4) NOT NULL DEFAULT 0;
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "settlementMode" TEXT NOT NULL DEFAULT 'LEGACY';
CREATE UNIQUE INDEX IF NOT EXISTS "BankLedgerEntry_id_orgId_key" ON "BankLedgerEntry"(id,"orgId");
ALTER TABLE "BankLedgerEntry" DROP CONSTRAINT IF EXISTS "BankLedgerEntry_settlement_check";
ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_settlement_check" CHECK (
 "settlementMode" IN ('LEGACY','ROWS') AND "writeOffAmount">=0 AND
 ("writeOffAmount"=0 OR ("settlementMode"='ROWS' AND "evidenceType"='INVOICE' AND direction='IN'))
);
CREATE TABLE IF NOT EXISTS "BankLedgerSettlementLine" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"entryId" TEXT NOT NULL,"clientKey" TEXT NOT NULL,
 kind TEXT NOT NULL,amount DECIMAL(24,4) NOT NULL,purpose TEXT NOT NULL,"createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("orgId","clientKey")
);
ALTER TABLE "BankLedgerSettlementLine" DROP CONSTRAINT IF EXISTS "BankLedgerSettlementLine_entry_scope_fkey";
ALTER TABLE "BankLedgerSettlementLine" ADD CONSTRAINT "BankLedgerSettlementLine_entry_scope_fkey" FOREIGN KEY("entryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT;
ALTER TABLE "BankLedgerSettlementLine" DROP CONSTRAINT IF EXISTS "BankLedgerSettlementLine_values_check";
ALTER TABLE "BankLedgerSettlementLine" ADD CONSTRAINT "BankLedgerSettlementLine_values_check" CHECK(kind IN ('FEE','WRITEOFF') AND amount>0 AND length(trim(purpose)) BETWEEN 1 AND 1000);
CREATE INDEX IF NOT EXISTS "BankLedgerSettlementLine_entryId_idx" ON "BankLedgerSettlementLine"("entryId");
-- xmin is a system column and is read separately from the composite row.
CREATE OR REPLACE FUNCTION baro_ledger_settlement_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "BankLedgerEntry"; inserted_here BOOLEAN;
BEGIN
 SELECT * INTO parent FROM "BankLedgerEntry" WHERE id=NEW."entryId" AND "orgId"=NEW."orgId" FOR UPDATE;
 SELECT xmin::text=(txid_current()%4294967296)::text INTO inserted_here FROM "BankLedgerEntry" WHERE id=NEW."entryId";
 IF parent.id IS NULL OR parent."settlementMode"<>'ROWS' OR parent."voidedAt" IS NOT NULL OR parent."evidenceType" NOT IN ('INVOICE','EXPENSE')
 OR (NEW.kind='WRITEOFF' AND parent."evidenceType"<>'INVOICE') THEN RAISE EXCEPTION 'LEDGER_INVALID_SETTLEMENT'; END IF;
 IF NOT coalesce(inserted_here,FALSE) THEN RAISE EXCEPTION 'LEDGER_ENTRY_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankLedgerSettlementLine_guard" ON "BankLedgerSettlementLine";
CREATE TRIGGER "BankLedgerSettlementLine_guard" BEFORE INSERT ON "BankLedgerSettlementLine" FOR EACH ROW EXECUTE FUNCTION baro_ledger_settlement_line_guard();
DROP TRIGGER IF EXISTS "BankLedgerSettlementLine_append_only" ON "BankLedgerSettlementLine";
CREATE TRIGGER "BankLedgerSettlementLine_append_only" BEFORE UPDATE OR DELETE ON "BankLedgerSettlementLine" FOR EACH ROW EXECUTE FUNCTION baro_evidence_append_only();
CREATE OR REPLACE FUNCTION baro_ledger_allocation_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated NUMERIC; fees NUMERIC; losses NUMERIC;
BEGIN
 IF NEW."evidenceType" IN ('INVOICE','EXPENSE') THEN
 SELECT coalesce(sum(amount),0) INTO allocated FROM "BankLedgerEvidenceAllocation" WHERE "entryId"=NEW.id;
 IF (NEW."evidenceType"='INVOICE' AND allocated<>NEW.amount+NEW."bankFee"+NEW."writeOffAmount") OR
 (NEW."evidenceType"='EXPENSE' AND allocated+NEW."bankFee"<>NEW.amount) THEN RAISE EXCEPTION 'LEDGER_ALLOCATION_MISMATCH'; END IF;
 END IF;
 IF NEW."settlementMode"='ROWS' THEN
 SELECT coalesce(sum(amount) FILTER(WHERE kind='FEE'),0),coalesce(sum(amount) FILTER(WHERE kind='WRITEOFF'),0) INTO fees,losses FROM "BankLedgerSettlementLine" WHERE "entryId"=NEW.id;
 IF fees<>NEW."bankFee" OR losses<>NEW."writeOffAmount" THEN RAISE EXCEPTION 'LEDGER_SETTLEMENT_MISMATCH'; END IF;
 END IF;
 RETURN NEW;
END $$;
