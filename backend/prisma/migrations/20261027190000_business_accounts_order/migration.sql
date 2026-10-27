-- Additive account master link; existing bank numbers, money and entry FKs stay intact.
ALTER TABLE "OrganizationBankAccount" ADD COLUMN IF NOT EXISTS "accountKind" TEXT NOT NULL DEFAULT 'BANK';
ALTER TABLE "OrganizationBankAccount" ADD COLUMN IF NOT EXISTS "displayName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrganizationBankAccount" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BankLedgerAccount" ADD COLUMN IF NOT EXISTS "entityAccountId" TEXT;
ALTER TABLE "OrganizationBankAccount" DROP CONSTRAINT IF EXISTS "OrganizationBankAccount_complete_check";
ALTER TABLE "OrganizationBankAccount" ADD CONSTRAINT "OrganizationBankAccount_complete_check" CHECK (
 "accountKind" IN ('BANK','CASH') AND length("displayName")<=160 AND
 (("accountKind"='CASH' AND length(trim("displayName"))>0) OR
 ("accountKind"='BANK' AND length(trim("bankName")) BETWEEN 1 AND 120 AND length(trim("accountNumber")) BETWEEN 1 AND 100 AND length(trim("accountHolder")) BETWEEN 1 AND 160)));
DROP INDEX IF EXISTS "OrganizationBankAccount_currency_default_key";
DROP INDEX IF EXISTS "EntityBankAccount_unique_key";
CREATE UNIQUE INDEX "EntityBankAccount_unique_key" ON "OrganizationBankAccount"("orgId","entityId","currencyId","bankName","accountNumber") WHERE "accountKind"='BANK';
CREATE UNIQUE INDEX "EntityCashAccount_name_key" ON "OrganizationBankAccount"("orgId","entityId","currencyId","displayName") WHERE "accountKind"='CASH';
CREATE INDEX IF NOT EXISTS "OrganizationBankAccount_orgId_entityId_sortOrder_idx" ON "OrganizationBankAccount"("orgId","entityId","sortOrder");
ALTER TABLE "BankLedgerAccount" DROP CONSTRAINT IF EXISTS "BankLedgerAccount_org_bank_number_currency_key";
DROP INDEX IF EXISTS "BankLedgerAccount_org_bank_number_currency_key";
CREATE UNIQUE INDEX "BankLedgerAccount_org_bank_number_currency_key" ON "BankLedgerAccount"("orgId","bankName","accountNumber","currencyCode") WHERE "accountNumber"<>'';
ALTER TABLE "BankLedgerAccount" ADD CONSTRAINT "BankLedgerAccount_entity_account_fkey" FOREIGN KEY("entityAccountId","orgId") REFERENCES "OrganizationBankAccount"(id,"orgId") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "BankLedgerAccount_entityAccountId_orgId_key" ON "BankLedgerAccount"("entityAccountId","orgId");
CREATE OR REPLACE FUNCTION baro_ledger_account_master_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW."orgId",NEW."entityAccountId",NEW."currencyCode",NEW."openingDate",NEW."openingBalance") IS DISTINCT FROM (OLD."orgId",OLD."entityAccountId",OLD."currencyCode",OLD."openingDate",OLD."openingBalance") THEN RAISE EXCEPTION 'LEDGER_OPENING_LOCKED'; END IF;
 IF NEW."entityAccountId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" a JOIN "Currency" c ON c.id=a."currencyId"
 WHERE a.id=NEW."entityAccountId" AND a."orgId"=NEW."orgId" AND a."entityId"=NEW."orgId" AND c.code=NEW."currencyCode") THEN RAISE EXCEPTION 'LEDGER_ACCOUNT_MASTER_SCOPE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BankLedgerAccount_master_guard" BEFORE INSERT OR UPDATE ON "BankLedgerAccount" FOR EACH ROW EXECUTE FUNCTION baro_ledger_account_master_guard();
CREATE OR REPLACE FUNCTION baro_business_account_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "BankLedgerAccount" WHERE "entityAccountId"=OLD.id) AND
 (NEW."orgId",NEW."entityId",NEW."currencyId",NEW."accountKind",NEW."bankName",NEW."accountNumber") IS DISTINCT FROM
 (OLD."orgId",OLD."entityId",OLD."currencyId",OLD."accountKind",OLD."bankName",OLD."accountNumber") THEN RAISE EXCEPTION 'LEDGER_ACCOUNT_IDENTITY_LOCKED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "OrganizationBankAccount_ledger_identity_guard" BEFORE UPDATE ON "OrganizationBankAccount" FOR EACH ROW EXECUTE FUNCTION baro_business_account_identity_guard();
CREATE OR REPLACE FUNCTION baro_expense_payee_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM "Organization" WHERE id=NEW."partnerOrgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" a WHERE a."orgId"=NEW."orgId" AND a."entityId"=NEW."partnerOrgId") THEN RAISE EXCEPTION 'PAYEE_BANK_ACCOUNT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
