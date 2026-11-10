-- Preserve historical single-leg records. New internal transfers are paired.
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "internalTransferSourceId" TEXT;
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "internalTransferAmount" DECIMAL(24,4);
ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_transfer_amount_check" CHECK("internalTransferAmount" IS NULL OR "internalTransferAmount">0);
CREATE UNIQUE INDEX IF NOT EXISTS "Ledger_transfer_source_key" ON "BankLedgerEntry"("internalTransferSourceId","orgId");
ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_transfer_source_scope_fkey" FOREIGN KEY("internalTransferSourceId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "Ledger_transfer_not_self_check" CHECK("internalTransferSourceId" IS NULL OR "internalTransferSourceId"<>id);

CREATE OR REPLACE FUNCTION baro_ledger_registration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."evidenceType"='ADJUSTMENT' THEN RETURN NEW; END IF;
 IF NEW."internalTransferSourceId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" s JOIN "ChangeApprovalRequest" r ON r.id=current_setting('baro.change_request_id',true)
   WHERE s.id=NEW."internalTransferSourceId" AND s."orgId"=NEW."orgId" AND s."internalTransferSourceId" IS NULL AND s."counterpartyAccountId" IS NOT NULL
   AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true)
   AND (r.operation='UPDATE' AND s."revisesEntryId"=r."ledgerEntryId" OR r.operation='CREATE' AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK' AND p->>'clientKey'=s."clientKey"))) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
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
 IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND (r.operation='UPDATE' AND NEW."revisesEntryId"=r."ledgerEntryId" OR r.operation='CREATE' AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK' AND p->>'clientKey'=NEW."clientKey" AND p->>'transactionDate'=NEW."transactionDate" AND p->>'direction'=NEW.direction AND (p->>'amount')::numeric=NEW.amount AND (p->>'accountId'=NEW."accountId" OR p->>'accountId'='entity:'||(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "orgId"=NEW."orgId"))))) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_ledger_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."internalTransferSourceId" IS DISTINCT FROM OLD."internalTransferSourceId" OR NEW."internalTransferAmount" IS DISTINCT FROM OLD."internalTransferAmount" THEN RAISE EXCEPTION 'LEDGER_TRANSFER_IMMUTABLE'; END IF;
 IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL AND NOT (
  baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',OLD.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',OLD.id)
  OR EXISTS(SELECT 1 FROM "BankLedgerEntry" p WHERE p."orgId"=OLD."orgId" AND (p.id=OLD."internalTransferSourceId" OR p."internalTransferSourceId"=OLD.id)
   AND (baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',p.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',p.id)))
 ) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_internal_transfer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "BankLedgerEntry"%ROWTYPE; s "BankLedgerEntry"%ROWTYPE; m "BankLedgerEntry"%ROWTYPE; a "BankLedgerAccount"%ROWTYPE; b "BankLedgerAccount"%ROWTYPE;
BEGIN
 SELECT * INTO e FROM "BankLedgerEntry" WHERE id=NEW.id AND "orgId"=NEW."orgId";
 IF e."internalTransferSourceId" IS NOT NULL THEN SELECT * INTO s FROM "BankLedgerEntry" WHERE id=e."internalTransferSourceId" AND "orgId"=e."orgId";
 ELSE s:=e; END IF;
 SELECT * INTO m FROM "BankLedgerEntry" WHERE "internalTransferSourceId"=s.id AND "orgId"=s."orgId";
 -- No backfill of historical unpaired entries on unrelated updates.
 IF m.id IS NULL AND TG_OP='UPDATE' AND e."internalTransferSourceId" IS NULL THEN RETURN NEW; END IF;
 IF s."counterpartyAccountId" IS NULL AND m.id IS NULL AND e."internalTransferSourceId" IS NULL THEN
  IF e."internalTransferAmount" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_TRANSFER_PAIR_INVALID'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM "BankLedgerAccount" WHERE id=s."accountId" AND "orgId"=s."orgId";
 SELECT * INTO b FROM "BankLedgerAccount" WHERE id=m."accountId" AND "orgId"=m."orgId";
 IF m.id IS NULL OR s."internalTransferSourceId" IS NOT NULL OR a.id=b.id
  OR s."counterpartyAccountId" IS DISTINCT FROM b."entityAccountId" OR m."counterpartyAccountId" IS DISTINCT FROM a."entityAccountId"
  OR NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE id=a."entityAccountId" AND "orgId"=s."orgId" AND "entityId"=s."orgId")
  OR NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE id=b."entityAccountId" AND "orgId"=s."orgId" AND "entityId"=s."orgId")
  OR s.direction=m.direction OR s."internalTransferAmount" IS DISTINCT FROM m.amount OR m."internalTransferAmount" IS DISTINCT FROM s.amount
  OR a."currencyCode"=b."currencyCode" AND s.amount<>m.amount OR s."transactionDate"<>m."transactionDate"
  OR s."accountingCodeId" IS DISTINCT FROM m."accountingCodeId" OR s.purpose<>m.purpose OR s."evidenceNumber"<>m."evidenceNumber"
  OR s."evidenceType"<>'FILE' OR m."evidenceType"<>'FILE' OR s."bankFee"<>0 OR m."bankFee"<>0 OR s."writeOffAmount"<>0 OR m."writeOffAmount"<>0
  OR s."voidedAt" IS DISTINCT FROM m."voidedAt" OR s."voidedBy" IS DISTINCT FROM m."voidedBy" OR s."voidReason" IS DISTINCT FROM m."voidReason"
  OR EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" WHERE "entryId" IN(s.id,m.id))
  OR EXISTS(SELECT 1 FROM "BankLedgerSettlementLine" WHERE "entryId" IN(s.id,m.id))
 THEN RAISE EXCEPTION 'LEDGER_TRANSFER_PAIR_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "Ledger_internal_transfer_guard" AFTER INSERT OR UPDATE ON "BankLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_internal_transfer_guard();
