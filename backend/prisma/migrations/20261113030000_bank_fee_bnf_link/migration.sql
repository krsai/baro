-- Add grouping FKs without rewriting ledger amounts, originals or approval snapshots.
CREATE TABLE IF NOT EXISTS "BankLedgerFeeLink" (
 "feeEntryId" TEXT PRIMARY KEY,"parentEntryId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "BankFeeLink_parent_scope_fkey" FOREIGN KEY("parentEntryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "BankFeeLink_fee_scope_fkey" FOREIGN KEY("feeEntryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "BankFeeLink_not_self_check" CHECK("feeEntryId"<>"parentEntryId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BankLedgerFeeLink_feeEntryId_orgId_key" ON "BankLedgerFeeLink"("feeEntryId","orgId");
CREATE INDEX IF NOT EXISTS "BankLedgerFeeLink_parentEntryId_orgId_idx" ON "BankLedgerFeeLink"("parentEntryId","orgId");
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('baro_ledger_counterparty_guard()'::regprocedure);
 IF position('b.code=''BNF''' in definition)=0 THEN
  IF position('b.code=''FEE''' in definition)=0 THEN RAISE EXCEPTION 'bank fee code guard anchor missing'; END IF;
  EXECUTE replace(definition,'b.code=''FEE''','b.code=''BNF''');
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_bank_fee_code_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.kind='FEE' AND NOT EXISTS(SELECT 1 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "TaxTreatment" t ON t.id=c."taxTreatmentId" WHERE c.id=NEW."accountingCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."isActive" AND b."isActive" AND b.code='BNF' AND t.suffix='E') THEN RAISE EXCEPTION 'LEDGER_ACCOUNTING_CODE_INVALID'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Settlement_bank_fee_code_guard" ON "BankLedgerSettlementLine";
CREATE TRIGGER "Settlement_bank_fee_code_guard" BEFORE INSERT ON "BankLedgerSettlementLine" FOR EACH ROW EXECUTE FUNCTION baro_bank_fee_code_guard();
CREATE OR REPLACE FUNCTION baro_bank_fee_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'bank fee link immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" p JOIN "BankLedgerEntry" f ON f.id=NEW."feeEntryId" AND f."orgId"=p."orgId" WHERE p.id=NEW."parentEntryId" AND p."orgId"=NEW."orgId" AND p."evidenceType" NOT IN ('BANK_FEE','ADJUSTMENT') AND f."evidenceType"='BANK_FEE' AND f.direction='OUT' AND p."accountId"=f."accountId" AND p."transactionDate"=f."transactionDate" AND p."voidedAt" IS NULL AND f."voidedAt" IS NULL) THEN RAISE EXCEPTION 'invalid bank fee parent'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankFeeLink_guard" ON "BankLedgerFeeLink";
CREATE TRIGGER "BankFeeLink_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BankLedgerFeeLink" FOR EACH ROW EXECUTE FUNCTION baro_bank_fee_link_guard();
CREATE OR REPLACE FUNCTION baro_bank_fee_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "BankLedgerFeeLink" l JOIN "BankLedgerEntry" p ON p.id=l."parentEntryId" AND p."orgId"=l."orgId" JOIN "BankLedgerEntry" f ON f.id=l."feeEntryId" AND f."orgId"=l."orgId" WHERE l."orgId"=NEW."orgId" AND ((p."voidedAt" IS NULL)<>(f."voidedAt" IS NULL))) THEN RAISE EXCEPTION 'bank fee parent state mismatch'; END IF;
 IF TG_TABLE_NAME='BankLedgerFeeLink' THEN
  IF NOT EXISTS(SELECT 1 FROM "BankLedgerBatch" b JOIN "BankLedgerEntry" p ON p.id=NEW."parentEntryId" AND p."orgId"=NEW."orgId" JOIN "BankLedgerEntry" f ON f.id=NEW."feeEntryId" AND f."orgId"=NEW."orgId" WHERE b."orgId"=NEW."orgId" AND (b."entryIds" ? NEW."parentEntryId") AND (b."entryIds" ? NEW."feeEntryId") AND p.xmin=f.xmin AND p.xmin=NEW.xmin) THEN RAISE EXCEPTION 'bank fee must be created with parent in same batch'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "BankFeeLink_consistency" ON "BankLedgerFeeLink";
CREATE CONSTRAINT TRIGGER "BankFeeLink_consistency" AFTER INSERT ON "BankLedgerFeeLink" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_bank_fee_consistency();
DROP TRIGGER IF EXISTS "Ledger_bank_fee_consistency" ON "BankLedgerEntry";
CREATE CONSTRAINT TRIGGER "Ledger_bank_fee_consistency" AFTER UPDATE ON "BankLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_bank_fee_consistency();
CREATE OR REPLACE FUNCTION baro_ledger_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."internalTransferSourceId" IS DISTINCT FROM OLD."internalTransferSourceId" OR NEW."internalTransferAmount" IS DISTINCT FROM OLD."internalTransferAmount" THEN RAISE EXCEPTION 'LEDGER_TRANSFER_IMMUTABLE'; END IF;
 IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL AND NOT (
  baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',OLD.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',OLD.id)
  OR EXISTS(SELECT 1 FROM "BankLedgerEntry" p WHERE p."orgId"=OLD."orgId" AND (p.id=OLD."internalTransferSourceId" OR p."internalTransferSourceId"=OLD.id) AND (baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',p.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',p.id)))
  OR EXISTS(SELECT 1 FROM "BankLedgerFeeLink" l JOIN "BankLedgerEntry" p ON p.id=l."parentEntryId" AND p."orgId"=l."orgId" WHERE l."feeEntryId"=OLD.id AND l."orgId"=OLD."orgId" AND (
   baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',p.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',p.id)
   OR EXISTS(SELECT 1 FROM "BankLedgerEntry" peer WHERE peer."orgId"=p."orgId" AND (peer.id=p."internalTransferSourceId" OR peer."internalTransferSourceId"=p.id) AND (baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',peer.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',peer.id)))))
 ) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
-- Compatible rollback: disable adding linked fees; retain links, BNFE and history.
