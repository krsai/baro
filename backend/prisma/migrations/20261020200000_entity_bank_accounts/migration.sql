CREATE TABLE IF NOT EXISTS "OrganizationBankAccount" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"entityId" INTEGER NOT NULL,"currencyId" INTEGER NOT NULL,
 "bankName" TEXT NOT NULL,"accountNumber" TEXT NOT NULL,"accountHolder" TEXT NOT NULL,
 "isDefault" BOOLEAN NOT NULL DEFAULT false,"isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdByEmployeeId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "OrganizationBankAccount_orgId_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "OrganizationBankAccount_entityId_fkey" FOREIGN KEY("entityId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "OrganizationBankAccount_currencyId_fkey" FOREIGN KEY("currencyId") REFERENCES "Currency"(id) ON DELETE RESTRICT,
 CONSTRAINT "OrganizationBankAccount_createdByEmployeeId_orgId_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "OrganizationBankAccount_updatedByEmployeeId_orgId_fkey" FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationBankAccount_id_orgId_key" ON "OrganizationBankAccount"(id,"orgId");
CREATE INDEX IF NOT EXISTS "OrganizationBankAccount_orgId_entityId_currencyId_idx" ON "OrganizationBankAccount"("orgId","entityId","currencyId");
CREATE UNIQUE INDEX IF NOT EXISTS "EntityBankAccount_unique_key" ON "OrganizationBankAccount"("orgId","entityId","currencyId","bankName","accountNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationBankAccount_currency_default_key" ON "OrganizationBankAccount"("orgId","entityId","currencyId") WHERE "isActive" AND "isDefault";
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='OrganizationBankAccount_complete_check') THEN
 ALTER TABLE "OrganizationBankAccount" ADD CONSTRAINT "OrganizationBankAccount_complete_check" CHECK(
 length(trim("bankName")) BETWEEN 1 AND 120 AND length(trim("accountNumber")) BETWEEN 1 AND 100 AND length(trim("accountHolder")) BETWEEN 1 AND 160
 AND ("isActive" OR NOT "isDefault")); END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_entity_bank_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM "Organization" WHERE id=NEW."entityId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "Organization" e WHERE e.id=NEW."entityId" AND
  (e.id=NEW."orgId" OR e."ownerOrgId"=NEW."orgId" OR e."dataOwnerOrgId"=NEW."orgId" OR EXISTS(
   SELECT 1 FROM "OrgRelationship" r WHERE (r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=e.id) OR (r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=e.id)))) THEN
 RAISE EXCEPTION 'BANK_ACCOUNT_ENTITY_SCOPE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "OrganizationBankAccount_scope_guard" ON "OrganizationBankAccount";
CREATE TRIGGER "OrganizationBankAccount_scope_guard" BEFORE INSERT OR UPDATE ON "OrganizationBankAccount" FOR EACH ROW EXECUTE FUNCTION baro_entity_bank_scope_guard();
CREATE OR REPLACE FUNCTION baro_expense_payee_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM "Organization" WHERE id=NEW."partnerOrgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" a WHERE a."orgId"=NEW."orgId" AND a."entityId"=NEW."partnerOrgId" AND a."isActive") THEN
 RAISE EXCEPTION 'PAYEE_BANK_ACCOUNT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ExpenseRequest_payee_bank_guard" ON "ExpenseRequest";
CREATE CONSTRAINT TRIGGER "ExpenseRequest_payee_bank_guard" AFTER INSERT OR UPDATE ON "ExpenseRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_payee_bank_guard();
