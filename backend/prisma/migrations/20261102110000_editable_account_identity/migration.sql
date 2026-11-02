-- Account metadata is editable. Historical ledger currencies and entry FKs remain intact.
ALTER TABLE "BankLedgerAccount" DROP CONSTRAINT IF EXISTS "BankLedgerAccount_entityAccountId_orgId_key";
DROP INDEX IF EXISTS "BankLedgerAccount_entityAccountId_orgId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "BankLedgerAccount_entityAccountId_orgId_currencyCode_key" ON "BankLedgerAccount"("entityAccountId","orgId","currencyCode");
CREATE OR REPLACE FUNCTION baro_business_account_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."orgId",NEW."entityId") IS DISTINCT FROM (OLD."orgId",OLD."entityId") AND EXISTS(SELECT 1 FROM "BankLedgerAccount" WHERE "entityAccountId"=OLD.id) THEN RAISE EXCEPTION 'LEDGER_ACCOUNT_IDENTITY_LOCKED'; END IF;
 PERFORM id FROM "BankLedgerAccount" WHERE "entityAccountId"=OLD.id FOR UPDATE;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_ledger_account_master_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE historical_match BOOLEAN := false;
BEGIN
 IF TG_OP='UPDATE' THEN
  historical_match := NEW."currencyCode"=OLD."currencyCode";
  IF (NEW."orgId",NEW."entityAccountId",NEW."openingDate",NEW."openingBalance") IS DISTINCT FROM (OLD."orgId",OLD."entityAccountId",OLD."openingDate",OLD."openingBalance") THEN RAISE EXCEPTION 'LEDGER_OPENING_LOCKED'; END IF;
  IF NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode" AND (OLD."entityAccountId" IS NULL OR OLD."openingBalance"<>0 OR EXISTS(SELECT 1 FROM "BankLedgerEntry" e WHERE e."accountId"=OLD.id)) THEN RAISE EXCEPTION 'LEDGER_ACCOUNT_IDENTITY_LOCKED'; END IF;
 END IF;
 IF NEW."entityAccountId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" a JOIN "Currency" c ON c.id=a."currencyId" WHERE a.id=NEW."entityAccountId" AND a."orgId"=NEW."orgId" AND a."entityId"=NEW."orgId" AND (c.code=NEW."currencyCode" OR historical_match)) THEN RAISE EXCEPTION 'LEDGER_ACCOUNT_MASTER_SCOPE'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_sync_corrected_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE new_code TEXT;
BEGIN
 SELECT code INTO new_code FROM "Currency" WHERE id=NEW."currencyId";
 IF NEW."currencyId" IS DISTINCT FROM OLD."currencyId" AND NOT EXISTS(SELECT 1 FROM "BankLedgerAccount" WHERE "entityAccountId"=NEW.id AND "orgId"=NEW."orgId" AND "currencyCode"=new_code) THEN
  UPDATE "BankLedgerAccount" a SET "currencyCode"=new_code WHERE a."entityAccountId"=NEW.id AND a."orgId"=NEW."orgId" AND a."openingBalance"=0 AND a."currencyCode"=(SELECT code FROM "Currency" WHERE id=OLD."currencyId") AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" e WHERE e."accountId"=a.id);
 END IF;
 UPDATE "BankLedgerAccount" SET "bankName"=NEW."bankName","accountNumber"=NEW."accountNumber","accountHolder"=NEW."accountHolder" WHERE "entityAccountId"=NEW.id AND "orgId"=NEW."orgId";
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "OrganizationBankAccount_identity_sync" ON "OrganizationBankAccount";
CREATE TRIGGER "OrganizationBankAccount_identity_sync" AFTER UPDATE ON "OrganizationBankAccount" FOR EACH ROW EXECUTE FUNCTION baro_sync_corrected_account_identity();
