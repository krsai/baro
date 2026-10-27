-- Allow normal removal of unlinked expense rows; reconciled rows remain protected.
CREATE OR REPLACE FUNCTION baro_reconciled_expense_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "BankLedgerEvidenceAllocation" a ON a."expenseItemId"=c.id JOIN "BankLedgerEntry" e ON e.id=a."entryId"
 WHERE c."expenseRequestId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_reconciled_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
