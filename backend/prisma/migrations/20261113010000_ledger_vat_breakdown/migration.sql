-- Add optional tax snapshots. Historical cash and allocations remain unchanged.
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS subtotal DECIMAL(24,4), ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2), ADD COLUMN IF NOT EXISTS "vatAmount" DECIMAL(24,4);
ALTER TABLE "BankLedgerEvidenceAllocation" ADD COLUMN IF NOT EXISTS subtotal DECIMAL(24,4), ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2), ADD COLUMN IF NOT EXISTS "vatAmount" DECIMAL(24,4);
CREATE OR REPLACE FUNCTION baro_ledger_vat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE currency TEXT; suffix TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.subtotal,NEW."vatRate",NEW."vatAmount") IS DISTINCT FROM (OLD.subtotal,OLD."vatRate",OLD."vatAmount") THEN RAISE EXCEPTION 'LEDGER_TAX_IMMUTABLE'; END IF;
  RETURN NEW; -- Keep historical tax snapshots independent of later settings.
 END IF;
 IF num_nonnulls(NEW.subtotal,NEW."vatRate",NEW."vatAmount")=0 THEN RETURN NEW; END IF;
 IF num_nonnulls(NEW.subtotal,NEW."vatRate",NEW."vatAmount")<>3 OR NEW.subtotal<=0 OR NEW."vatRate"<0 OR NEW."vatRate">100 OR NEW."vatAmount"<0 OR NEW.amount<>NEW.subtotal+NEW."vatAmount" THEN RAISE EXCEPTION 'LEDGER_INVALID_VAT'; END IF;
 IF TG_TABLE_NAME='BankLedgerEntry' THEN
  SELECT a."currencyCode",t.suffix INTO currency,suffix FROM "BankLedgerAccount" a LEFT JOIN "TransactionCode" c ON c.id=NEW."accountingCodeId" AND c."ownerOrgId"=NEW."orgId" LEFT JOIN "TaxTreatment" t ON t.id=c."taxTreatmentId" WHERE a.id=NEW."accountId" AND a."orgId"=NEW."orgId";
 ELSE
  SELECT a."currencyCode",t.suffix INTO currency,suffix FROM "BankLedgerEntry" e JOIN "BankLedgerAccount" a ON a.id=e."accountId" AND a."orgId"=e."orgId" JOIN "PartnerTransactionCost" p ON p.id=NEW."expenseItemId" AND p."orgId"=NEW."orgId" JOIN "TransactionCode" c ON c.id=p."transactionCodeId" AND c."ownerOrgId"=NEW."orgId" JOIN "TaxTreatment" t ON t.id=c."taxTreatmentId" WHERE e.id=NEW."entryId" AND e."orgId"=NEW."orgId";
 END IF;
 IF currency IS NULL OR suffix IS NULL OR (suffix<>'V' AND NEW."vatRate"<>0) OR NEW.subtotal<>round(NEW.subtotal,CASE WHEN currency='USD' THEN 2 ELSE 0 END) OR NEW."vatAmount"<>round(NEW.subtotal*NEW."vatRate"/100,CASE WHEN currency='USD' THEN 2 ELSE 0 END) THEN RAISE EXCEPTION 'LEDGER_INVALID_VAT'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Ledger_vat_guard" ON "BankLedgerEntry";
CREATE TRIGGER "Ledger_vat_guard" BEFORE INSERT OR UPDATE ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_vat_guard();
DROP TRIGGER IF EXISTS "LedgerAllocation_vat_guard" ON "BankLedgerEvidenceAllocation";
CREATE TRIGGER "LedgerAllocation_vat_guard" BEFORE INSERT OR UPDATE ON "BankLedgerEvidenceAllocation" FOR EACH ROW EXECUTE FUNCTION baro_ledger_vat_guard();
-- Compatible rollback: stop accepting new tax snapshots, retain these nullable
-- columns/triggers and all snapshots; never drop populated financial history.
