-- Payment instructions follow verified SaaS links. No account, ledger, document
-- or historical snapshot is copied or rewritten.
CREATE OR REPLACE FUNCTION baro_linked_bank_owner(company_id INTEGER,entity_id INTEGER)
RETURNS INTEGER LANGUAGE plpgsql STABLE AS $$
DECLARE source_id INTEGER;
BEGIN
 IF company_id=entity_id THEN RETURN NULL; END IF;
 SELECT COALESCE(
  (SELECT i."anchorEntityId" FROM "CompanyIdentityLink" l JOIN "CompanyIdentity" i ON i.id=l."identityId" WHERE l."orgId"=company_id AND l."entityId"=entity_id),
  (SELECT "targetOrgId" FROM "CompanyPartnerLink" WHERE "orgId"=company_id AND "entityId"=entity_id),entity_id) INTO source_id;
 IF EXISTS(SELECT 1 FROM "Organization" o WHERE o.id=source_id AND o."ownerOrgId" IS NULL AND o."isActive"
  AND (o."dataOwnerOrgId" IS NULL OR o."dataOwnerOrgId"=o.id) AND o.type::text IN ('MANUFACTURER','BRAND','SERVICE')
  AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=o.id AND e.status::text='ACTIVE')) THEN RETURN source_id; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION baro_expense_payee_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id INTEGER;
BEGIN
 IF NEW."payeeEmployeeId" IS NOT NULL THEN
  PERFORM id FROM "Employee" WHERE id=NEW."payeeEmployeeId" AND "orgId"=NEW."orgId" FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM "EmployeeExpenseBankAccount" WHERE "employeeId"=NEW."payeeEmployeeId" AND "orgId"=NEW."orgId") THEN RAISE EXCEPTION 'PAYEE_BANK_ACCOUNT_REQUIRED'; END IF;
 ELSE
  PERFORM id FROM "Organization" WHERE id=NEW."partnerOrgId" FOR UPDATE;
  source_id:=baro_linked_bank_owner(NEW."orgId",NEW."partnerOrgId");
  IF source_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE "entityId"=source_id AND "orgId"=source_id AND "accountKind"='BANK') THEN RAISE EXCEPTION 'PAYEE_BANK_ACCOUNT_REQUIRED'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE "entityId"=NEW."partnerOrgId" AND "orgId"=NEW."orgId") THEN RAISE EXCEPTION 'PAYEE_BANK_ACCOUNT_REQUIRED'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE "expenseRequestId"=NEW.id AND "orgId"=NEW."orgId" AND ("partnerOrgId" IS DISTINCT FROM NEW."partnerOrgId" OR "payeeEmployeeId" IS DISTINCT FROM NEW."payeeEmployeeId")) THEN RAISE EXCEPTION 'expense request payee mismatch'; END IF;
 RETURN NEW;
END $$;
