CREATE TABLE IF NOT EXISTS "CompanyWorkspaceRegistration" (
 "actorEmail" TEXT NOT NULL, "clientKey" TEXT NOT NULL, "orgId" INTEGER NOT NULL UNIQUE,
 "requestHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("actorEmail","clientKey"),
 FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "BankLedgerAccount" (
 "id" TEXT PRIMARY KEY, "orgId" INTEGER NOT NULL, "clientKey" TEXT NOT NULL,
 "bankName" TEXT NOT NULL, "accountNumber" TEXT NOT NULL, "accountHolder" TEXT NOT NULL,
 "currencyCode" TEXT NOT NULL CONSTRAINT "BankLedgerAccount_currency_check" CHECK ("currencyCode" IN ('USD','VND','KRW')),
 "openingDate" TEXT NOT NULL, "openingBalance" DECIMAL(24,4) NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
 UNIQUE ("id","orgId"), UNIQUE ("orgId","clientKey"),
 CONSTRAINT "BankLedgerAccount_org_bank_number_currency_key" UNIQUE ("orgId","bankName","accountNumber","currencyCode")
);
CREATE INDEX IF NOT EXISTS "BankLedgerAccount_orgId_createdAt_idx" ON "BankLedgerAccount"("orgId","createdAt");
CREATE TABLE IF NOT EXISTS "BankLedgerEntry" (
 "id" TEXT PRIMARY KEY, "orgId" INTEGER NOT NULL, "accountId" TEXT NOT NULL,
 "clientKey" TEXT NOT NULL, "transactionDate" TEXT NOT NULL,
 "direction" TEXT NOT NULL CHECK ("direction" IN ('IN','OUT')),
 "amount" DECIMAL(24,4) NOT NULL CHECK ("amount">0), "purpose" TEXT NOT NULL, "evidenceNumber" TEXT NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMP(3), "voidedBy" TEXT, "voidReason" TEXT,
 FOREIGN KEY ("accountId","orgId") REFERENCES "BankLedgerAccount"("id","orgId") ON DELETE RESTRICT,
 UNIQUE ("orgId","clientKey"),
 CONSTRAINT "BankLedgerEntry_void_audit_check" CHECK (("voidedAt" IS NULL AND "voidedBy" IS NULL AND "voidReason" IS NULL) OR
 ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "BankLedgerEntry_account_date_idx"
 ON "BankLedgerEntry"("orgId","accountId","transactionDate","createdAt","id");

-- db push may have created the tables first. Install the domain checks in both rollout paths.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerAccount_currency_check' AND conrelid='"BankLedgerAccount"'::regclass) THEN
  ALTER TABLE "BankLedgerAccount" ADD CONSTRAINT "BankLedgerAccount_currency_check" CHECK ("currencyCode" IN ('USD','VND','KRW'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerEntry_direction_check' AND conrelid='"BankLedgerEntry"'::regclass) THEN
  ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_direction_check" CHECK ("direction" IN ('IN','OUT'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerEntry_amount_check' AND conrelid='"BankLedgerEntry"'::regclass) THEN
  ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_amount_check" CHECK ("amount">0);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerEntry_void_audit_check' AND conrelid='"BankLedgerEntry"'::regclass) THEN
  ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_void_audit_check" CHECK (("voidedAt" IS NULL AND "voidedBy" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL));
 END IF;
END $$;
