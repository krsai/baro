-- No financial rows or bank defaults are inferred or rewritten.
CREATE UNIQUE INDEX "OrganizationBankAccount_primary_currency_key" ON "OrganizationBankAccount"("orgId","entityId","currencyId") WHERE "isDefault" AND "isActive" AND "accountKind"='BANK';
CREATE OR REPLACE FUNCTION baro_ledger_registration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."evidenceType"='ADJUSTMENT' THEN RETURN NEW; END IF;
 IF NEW."internalTransferSourceId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" s JOIN "ChangeApprovalRequest" r ON r.id=current_setting('baro.change_request_id',true)
   WHERE s.id=NEW."internalTransferSourceId" AND s."orgId"=NEW."orgId" AND s."internalTransferSourceId" IS NULL AND s."counterpartyAccountId" IS NOT NULL
   AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true)
   AND (r.operation='UPDATE' AND s."revisesEntryId"=r."ledgerEntryId" OR r.operation IN('CREATE','UPDATE') AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK' AND p->>'clientKey'=s."clientKey"))) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."internalTransferAmount" IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM "ChangeApprovalRequest" r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'rows') p
  WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED'
  AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND r.operation IN('CREATE','UPDATE')
  AND p->>'entryKind'='BANK' AND p->>'clientKey'=NEW."clientKey" AND p->'counterparty'->>'kind'='ACCOUNT' AND p->'counterparty'->>'id'=NEW."counterpartyAccountId"
  AND COALESCE(p->>'transferAmount',p->>'amount')::numeric=NEW."internalTransferAmount"
  AND (p->>'accountingCodeId')::integer IS NOT DISTINCT FROM NEW."accountingCodeId"
  AND (p->>'amount')::numeric=NEW.amount AND p->>'direction'=NEW.direction AND p->>'transactionDate'=NEW."transactionDate"
  AND (p->>'accountId'=NEW."accountId" OR p->>'accountId'='entity:'||(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "orgId"=NEW."orgId"))
 ) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND (r.operation='UPDATE' AND NEW."revisesEntryId"=r."ledgerEntryId" OR r.operation IN('CREATE','UPDATE') AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK' AND p->>'clientKey'=NEW."clientKey" AND p->>'transactionDate'=NEW."transactionDate" AND p->>'direction'=NEW.direction AND (p->>'amount')::numeric=NEW.amount AND (p->>'accountId'=NEW."accountId" OR p->>'accountId'='entity:'||(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "orgId"=NEW."orgId"))))) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION baro_ledger_update_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ChangeApprovalRequest"%ROWTYPE; b "BankLedgerBatch"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "ChangeApprovalRequest" WHERE id=NEW.id;
 IF r.menu<>'BANK_LEDGER' OR r.operation<>'UPDATE' OR r.status<>'APPROVED' OR OLD.status='APPROVED' THEN RETURN NEW; END IF;
 SELECT * INTO b FROM "BankLedgerBatch" WHERE "orgId"=r."orgId" AND "clientKey"=r.payload->>'clientKey';
 IF b.id IS NULL OR jsonb_array_length(b."entryIds")<>(SELECT count(*) FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(b."entryIds") x(id) WHERE NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" e CROSS JOIN LATERAL jsonb_array_elements(r.payload->'rows') p WHERE e.id=x.id AND e."orgId"=r."orgId" AND p->>'entryKind'='BANK' AND p->>'clientKey'=e."clientKey"))
 THEN RAISE EXCEPTION 'CHANGE_NOT_APPLIED'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "Ledger_update_receipt_guard" AFTER UPDATE ON "ChangeApprovalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_ledger_update_receipt_guard();
