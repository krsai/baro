-- Add a narrowly validated, account-only bank debit. Preserve all existing ledger rows.
CREATE OR REPLACE FUNCTION baro_ledger_evidence_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
 IF (to_jsonb(NEW)-'voidedAt'-'voidedBy'-'voidReason') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt'-'voidedBy'-'voidReason') OR OLD."voidedAt" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_ENTRY_IMMUTABLE'; END IF;RETURN NEW; END IF;
 IF NEW."evidenceType" NOT IN ('FILE','INVOICE','EXPENSE','ADJUSTMENT','BANK_FEE') OR NEW."bankFee"<0 OR length(trim(NEW.purpose))=0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW."evidenceType"='FILE' AND length(trim(NEW."evidenceNumber")) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LEDGER_FILE_REQUIRED'; END IF;
 IF NEW."evidenceType" IN ('FILE','ADJUSTMENT','BANK_FEE') AND NEW."bankFee"<>0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_ledger_counterparty_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE targets INTEGER;
BEGIN
 targets:=num_nonnulls(NEW."counterpartyOrgId",NEW."counterpartyEmployeeId",NEW."counterpartyAccountId");
 IF NEW."evidenceType" IN ('ADJUSTMENT','BANK_FEE') THEN
  IF targets<>0 OR NEW."counterpartyName" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
 ELSE
  IF targets<>1 OR length(trim(COALESCE(NEW."counterpartyName",'')))=0 THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_REQUIRED'; END IF;
  IF NEW."counterpartyOrgId" IS NOT NULL AND (NEW."counterpartyOrgId"=NEW."orgId" OR NOT EXISTS(
   SELECT 1 FROM "Organization" p WHERE p.id=NEW."counterpartyOrgId" AND (p."isActive" OR NEW."evidenceType" IN ('INVOICE','EXPENSE')) AND (p."ownerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id OR r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=p.id)))) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
  IF NEW."counterpartyEmployeeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."counterpartyEmployeeId" AND "orgId"=NEW."orgId" AND (status::text='ACTIVE' OR NEW."evidenceType"='EXPENSE')) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
  IF NEW."counterpartyAccountId" IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE id=NEW."counterpartyAccountId" AND "orgId"=NEW."orgId" AND "entityId"=NEW."orgId" AND "isActive") OR EXISTS(SELECT 1 FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "entityAccountId"=NEW."counterpartyAccountId")) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
 END IF;
 IF NEW."evidenceType"='BANK_FEE' AND NOT EXISTS(SELECT 1 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "TaxTreatment" t ON t.id=c."taxTreatmentId" WHERE c.id=NEW."accountingCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."isActive" AND b."isActive" AND b.code='FEE' AND t.suffix='E') THEN RAISE EXCEPTION 'LEDGER_ACCOUNTING_CODE_INVALID'; END IF;
 RETURN NEW;
END $$;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='BankLedgerEntry_bank_fee_shape_check') THEN
 ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_bank_fee_shape_check" CHECK("evidenceType"<>'BANK_FEE' OR (direction='OUT' AND "bankFee"=0 AND "writeOffAmount"=0 AND "evidenceNumber"='' AND "counterpartyOrgId" IS NULL AND "counterpartyEmployeeId" IS NULL AND "counterpartyAccountId" IS NULL AND "counterpartyName" IS NULL AND "accountingCodeId" IS NOT NULL)) NOT VALID;
 END IF;
END $$;
