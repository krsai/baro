-- Add evidence links without rewriting historical transactions or inventing approvals.
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "evidenceType" TEXT NOT NULL DEFAULT 'FILE';
ALTER TABLE "BankLedgerEntry" ADD COLUMN IF NOT EXISTS "bankFee" DECIMAL(24,4) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_id_sellerOrgId_key" ON "Invoice"(id,"sellerOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTransactionCost_id_orgId_key" ON "PartnerTransactionCost"(id,"orgId");
CREATE TABLE "ExpenseApprovalDecision" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"requestId" INT NOT NULL,version INT NOT NULL,position INT NOT NULL,"employeeId" INT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("requestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT,
 FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 UNIQUE("requestId",version,position)
);
CREATE TABLE "BankLedgerEvidenceAllocation" (
 id TEXT PRIMARY KEY,"entryId" TEXT NOT NULL,"orgId" INT NOT NULL,"invoiceId" TEXT,"expenseItemId" TEXT,"requestVersion" INT,amount DECIMAL(24,4) NOT NULL CHECK(amount>0),
 FOREIGN KEY("entryId") REFERENCES "BankLedgerEntry"(id) ON DELETE RESTRICT,
 FOREIGN KEY("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT,
 FOREIGN KEY("expenseItemId","orgId") REFERENCES "PartnerTransactionCost"(id,"orgId") ON DELETE RESTRICT,
 CHECK(("invoiceId" IS NOT NULL AND "expenseItemId" IS NULL AND "requestVersion" IS NULL) OR ("invoiceId" IS NULL AND "expenseItemId" IS NOT NULL AND "requestVersion" IS NOT NULL))
);
CREATE INDEX "BankLedgerEvidenceAllocation_invoiceId_idx" ON "BankLedgerEvidenceAllocation"("invoiceId");
CREATE INDEX "BankLedgerEvidenceAllocation_expenseItemId_idx" ON "BankLedgerEvidenceAllocation"("expenseItemId");
CREATE OR REPLACE FUNCTION baro_evidence_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EVIDENCE_APPEND_ONLY'; END $$;
CREATE TRIGGER "ExpenseApprovalDecision_append_only" BEFORE UPDATE OR DELETE ON "ExpenseApprovalDecision" FOR EACH ROW EXECUTE FUNCTION baro_evidence_append_only();
CREATE TRIGGER "BankLedgerEvidenceAllocation_append_only" BEFORE UPDATE OR DELETE ON "BankLedgerEvidenceAllocation" FOR EACH ROW EXECUTE FUNCTION baro_evidence_append_only();
CREATE OR REPLACE FUNCTION baro_expense_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM "ExpenseRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=r.id AND s."orgId"=r."orgId"
 JOIN "Employee" e ON e.id=s."employeeId" AND e."orgId"=s."orgId"
 WHERE r.id=NEW."requestId" AND r."orgId"=NEW."orgId" AND r.version=NEW.version AND s.position=NEW.position AND s."employeeId"=NEW."employeeId" AND e.status='ACTIVE' AND e."orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT'))
 OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=NEW."requestId" AND s.position<NEW.position AND NOT EXISTS
 (SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=s."requestId" AND d.version=NEW.version AND d.position=s.position AND d."employeeId"=s."employeeId")) THEN RAISE EXCEPTION 'EXPENSE_APPROVAL_NOT_YOUR_TURN'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ExpenseApprovalDecision_guard" BEFORE INSERT ON "ExpenseApprovalDecision" FOR EACH ROW EXECUTE FUNCTION baro_expense_decision_guard();
-- Once reconciled, editing the request would invalidate the approved item evidence.
CREATE OR REPLACE FUNCTION baro_reconciled_expense_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c JOIN "BankLedgerEvidenceAllocation" a ON a."expenseItemId"=c.id JOIN "BankLedgerEntry" e ON e.id=a."entryId"
 WHERE c."expenseRequestId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER "ExpenseRequest_reconciled_guard" BEFORE UPDATE OR DELETE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_reconciled_expense_guard();
CREATE OR REPLACE FUNCTION baro_reconciled_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'EXPENSE_ALREADY_RECONCILED'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER "PartnerTransactionCost_reconciled_guard" BEFORE UPDATE OR DELETE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_reconciled_cost_guard();
CREATE OR REPLACE FUNCTION baro_ledger_evidence_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
 IF (to_jsonb(NEW)-'voidedAt'-'voidedBy'-'voidReason') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt'-'voidedBy'-'voidReason') OR OLD."voidedAt" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_ENTRY_IMMUTABLE'; END IF;RETURN NEW; END IF;
 IF NEW."evidenceType" NOT IN ('FILE','INVOICE','EXPENSE','ADJUSTMENT') OR NEW."bankFee"<0 OR length(trim(NEW.purpose))=0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW."evidenceType"='FILE' AND length(trim(NEW."evidenceNumber")) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LEDGER_FILE_REQUIRED'; END IF;
 IF NEW."evidenceType" IN ('FILE','ADJUSTMENT') AND NEW."bankFee"<>0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BankLedgerEntry_evidence_guard" BEFORE INSERT OR UPDATE ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_evidence_entry_guard();
CREATE TRIGGER "BankLedgerEntry_delete_guard" BEFORE DELETE ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_evidence_append_only();
CREATE OR REPLACE FUNCTION baro_ledger_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE entry "BankLedgerEntry"; cost "PartnerTransactionCost"; bill "Invoice"; BEGIN
 SELECT * INTO entry FROM "BankLedgerEntry" WHERE id=NEW."entryId";
 IF entry."orgId"<>NEW."orgId" OR entry."voidedAt" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW."invoiceId" IS NOT NULL THEN
 SELECT * INTO bill FROM "Invoice" WHERE id=NEW."invoiceId" FOR UPDATE;
 IF entry."evidenceType"<>'INVOICE' OR entry.direction<>'IN' OR bill.status<>'ISSUED' OR bill."currencyCode"<>(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId") THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW.amount+(SELECT coalesce(sum(a.amount),0) FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."invoiceId"=NEW."invoiceId" AND e."voidedAt" IS NULL)>bill.total THEN RAISE EXCEPTION 'LEDGER_EXCEEDS_DOCUMENT'; END IF;
 ELSE
 SELECT * INTO cost FROM "PartnerTransactionCost" WHERE id=NEW."expenseItemId";
 PERFORM id FROM "ExpenseRequest" WHERE id=cost."expenseRequestId" FOR UPDATE;
 IF entry."evidenceType"<>'EXPENSE' OR entry.direction<>'OUT' OR cost.currency<>(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=entry."accountId")
 OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=cost."expenseRequestId" AND r.version=NEW."requestVersion")
 OR NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=cost."expenseRequestId")
 OR EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=cost."expenseRequestId" AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=s."requestId" AND d.version=NEW."requestVersion" AND d.position=s.position AND d."employeeId"=s."employeeId")) THEN RAISE EXCEPTION 'LEDGER_EXPENSE_NOT_APPROVED'; END IF;
 IF NEW.amount+(SELECT coalesce(sum(a.amount),0) FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=NEW."expenseItemId" AND e."voidedAt" IS NULL)>cost.amount THEN RAISE EXCEPTION 'LEDGER_EXCEEDS_DOCUMENT'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER "BankLedgerEvidenceAllocation_guard" BEFORE INSERT ON "BankLedgerEvidenceAllocation" FOR EACH ROW EXECUTE FUNCTION baro_ledger_allocation_guard();
CREATE OR REPLACE FUNCTION baro_ledger_allocation_total() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE allocated NUMERIC; BEGIN
 IF NEW."evidenceType" IN ('INVOICE','EXPENSE') THEN
 SELECT coalesce(sum(amount),0) INTO allocated FROM "BankLedgerEvidenceAllocation" WHERE "entryId"=NEW.id;
 IF (NEW."evidenceType"='INVOICE' AND allocated<>NEW.amount+NEW."bankFee") OR (NEW."evidenceType"='EXPENSE' AND allocated+NEW."bankFee"<>NEW.amount) THEN RAISE EXCEPTION 'LEDGER_ALLOCATION_MISMATCH'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "BankLedgerEntry_allocation_total" AFTER INSERT ON "BankLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_ledger_allocation_total();
