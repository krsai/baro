-- Explicit configuration only; do not infer directions from names or rewrite history.
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "cashDirection" TEXT NOT NULL DEFAULT 'BOTH';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='TransactionCodeBase_cashDirection_check') THEN
  ALTER TABLE "TransactionCodeBase" ADD CONSTRAINT "TransactionCodeBase_cashDirection_check" CHECK ("cashDirection" IN ('IN','OUT','BOTH'));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_accounting_cash_direction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_id integer; company_id integer; required_direction text; allowed_direction text;
BEGIN
 IF TG_TABLE_NAME='PartnerTransactionCost' THEN
  IF TG_OP='UPDATE' AND NEW."transactionCodeId" IS NOT DISTINCT FROM OLD."transactionCodeId" THEN RETURN NEW; END IF;
  selected_id:=NEW."transactionCodeId"; company_id:=NEW."orgId"; required_direction:='OUT';
 ELSE
  selected_id:=NEW."accountingCodeId"; company_id:=NEW."orgId";
  IF TG_TABLE_NAME='BankLedgerEntry' THEN required_direction:=NEW.direction::text; ELSE required_direction:='OUT'; END IF;
 END IF;
 IF selected_id IS NULL THEN RETURN NEW; END IF;
 SELECT b."cashDirection" INTO allowed_direction FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId"
 WHERE c.id=selected_id AND c."ownerOrgId"=company_id FOR SHARE OF b;
 IF allowed_direction IS NOT NULL AND allowed_direction NOT IN ('BOTH',required_direction) THEN
  RAISE EXCEPTION 'ACCOUNTING_CODE_DIRECTION_MISMATCH';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankLedgerEntry_cash_direction_guard" ON "BankLedgerEntry";
CREATE TRIGGER "BankLedgerEntry_cash_direction_guard" BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_accounting_cash_direction_guard();
DROP TRIGGER IF EXISTS "BankLedgerSettlementLine_cash_direction_guard" ON "BankLedgerSettlementLine";
CREATE TRIGGER "BankLedgerSettlementLine_cash_direction_guard" BEFORE INSERT ON "BankLedgerSettlementLine" FOR EACH ROW EXECUTE FUNCTION baro_accounting_cash_direction_guard();
DROP TRIGGER IF EXISTS "PartnerTransactionCost_cash_direction_guard" ON "PartnerTransactionCost";
CREATE TRIGGER "PartnerTransactionCost_cash_direction_guard" BEFORE INSERT OR UPDATE OF "transactionCodeId" ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_accounting_cash_direction_guard();
