CREATE TABLE IF NOT EXISTS "AccountingOpeningItem" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"batchKey" TEXT NOT NULL,line INTEGER NOT NULL,
 kind TEXT NOT NULL,side TEXT NOT NULL,"balanceDate" TEXT NOT NULL,"currencyCode" TEXT NOT NULL,amount DECIMAL(24,4) NOT NULL,
 "partyOrgId" INTEGER,"employeeId" INTEGER,"accountingCodeId" INTEGER,"invoiceId" TEXT,"expenseItemId" TEXT,"sourceVersion" INTEGER,
 reason TEXT NOT NULL,"createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMP(3),"voidReason" TEXT,"voidedByEmployeeId" INTEGER,
 CONSTRAINT "AccountingOpeningItem_company_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_batch_fkey" FOREIGN KEY("orgId","batchKey") REFERENCES "BankLedgerBatch"("orgId","clientKey") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_party_fkey" FOREIGN KEY("partyOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_employee_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_actor_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_void_actor_fkey" FOREIGN KEY("voidedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_code_fkey" FOREIGN KEY("accountingCodeId","orgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_invoice_fkey" FOREIGN KEY("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_cost_fkey" FOREIGN KEY("expenseItemId","orgId") REFERENCES "PartnerTransactionCost"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningItem_values_check" CHECK (
 amount>0 AND "currencyCode" IN ('USD','VND','KRW') AND ("currencyCode"='USD' AND amount=round(amount,2) OR "currencyCode"<>'USD' AND amount=round(amount,0))
 AND side IN ('AR','AP') AND num_nonnulls("partyOrgId","employeeId")=1 AND length(trim(reason)) BETWEEN 1 AND 1000
 AND "balanceDate" ~ '^\d{4}-\d{2}-\d{2}$'
 AND (kind='OPENING' AND "accountingCodeId" IS NOT NULL AND "invoiceId" IS NULL AND "expenseItemId" IS NULL
 OR kind IN ('SETTLED','EXCLUDED') AND (side='AR' AND "invoiceId" IS NOT NULL AND "expenseItemId" IS NULL OR side='AP' AND "expenseItemId" IS NOT NULL AND "invoiceId" IS NULL))
 AND ("voidedAt" IS NULL AND "voidReason" IS NULL AND "voidedByEmployeeId" IS NULL OR "voidedAt" IS NOT NULL AND length(trim("voidReason"))>0 AND "voidedByEmployeeId" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingOpeningItem_orgId_batchKey_line_key" ON "AccountingOpeningItem"("orgId","batchKey",line);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingOpeningItem_id_orgId_key" ON "AccountingOpeningItem"(id,"orgId");
CREATE INDEX IF NOT EXISTS "AccountingOpeningItem_orgId_balanceDate_idx" ON "AccountingOpeningItem"("orgId","balanceDate");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingOpeningItem_active_invoice_key" ON "AccountingOpeningItem"("invoiceId") WHERE "voidedAt" IS NULL AND "invoiceId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingOpeningItem_active_cost_key" ON "AccountingOpeningItem"("expenseItemId") WHERE "voidedAt" IS NULL AND "expenseItemId" IS NOT NULL;
CREATE TABLE IF NOT EXISTS "AccountingOpeningAllocation" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"openingItemId" TEXT NOT NULL,"entryId" TEXT NOT NULL,amount DECIMAL(24,4) NOT NULL CHECK(amount>0),
 CONSTRAINT "AccountingOpeningAllocation_item_fkey" FOREIGN KEY("openingItemId","orgId") REFERENCES "AccountingOpeningItem"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "AccountingOpeningAllocation_entry_fkey" FOREIGN KEY("entryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingOpeningAllocation_entryId_key" ON "AccountingOpeningAllocation"("entryId");
CREATE INDEX IF NOT EXISTS "AccountingOpeningAllocation_openingItemId_idx" ON "AccountingOpeningAllocation"("openingItemId");



DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_company_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_company_fkey" FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_batch_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_batch_fkey" FOREIGN KEY("orgId","batchKey") REFERENCES "BankLedgerBatch"("orgId","clientKey") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_party_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_party_fkey" FOREIGN KEY("partyOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_employee_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_employee_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_actor_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_actor_fkey" FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_void_actor_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_void_actor_fkey" FOREIGN KEY("voidedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_code_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_code_fkey" FOREIGN KEY("accountingCodeId","orgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_invoice_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_invoice_fkey" FOREIGN KEY("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_cost_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_cost_fkey" FOREIGN KEY("expenseItemId","orgId") REFERENCES "PartnerTransactionCost"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningAllocation_item_fkey') THEN ALTER TABLE "AccountingOpeningAllocation" ADD CONSTRAINT "AccountingOpeningAllocation_item_fkey" FOREIGN KEY("openingItemId","orgId") REFERENCES "AccountingOpeningItem"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningAllocation_entry_fkey') THEN ALTER TABLE "AccountingOpeningAllocation" ADD CONSTRAINT "AccountingOpeningAllocation_entry_fkey" FOREIGN KEY("entryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_values_check') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_values_check" CHECK (
 amount>0 AND "currencyCode" IN ('USD','VND','KRW') AND ("currencyCode"='USD' AND amount=round(amount,2) OR "currencyCode"<>'USD' AND amount=round(amount,0))
 AND side IN ('AR','AP') AND num_nonnulls("partyOrgId","employeeId")=1 AND length(trim(reason)) BETWEEN 1 AND 1000
 AND "balanceDate" ~ '^\d{4}-\d{2}-\d{2}$'
 AND (kind='OPENING' AND "accountingCodeId" IS NOT NULL AND "invoiceId" IS NULL AND "expenseItemId" IS NULL
 OR kind IN ('SETTLED','EXCLUDED') AND (side='AR' AND "invoiceId" IS NOT NULL AND "expenseItemId" IS NULL OR side='AP' AND "expenseItemId" IS NOT NULL AND "invoiceId" IS NULL))
 AND ("voidedAt" IS NULL AND "voidReason" IS NULL AND "voidedByEmployeeId" IS NULL OR "voidedAt" IS NOT NULL AND length(trim("voidReason"))>0 AND "voidedByEmployeeId" IS NOT NULL)); END IF;
END $$;

CREATE OR REPLACE FUNCTION baro_opening_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bill "Invoice"; cost "PartnerTransactionCost"; current_amount DECIMAL(24,4);
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OPENING_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NULL OR (to_jsonb(NEW)-'voidedAt'-'voidReason'-'voidedByEmployeeId') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt'-'voidReason'-'voidedByEmployeeId') THEN RAISE EXCEPTION 'OPENING_HISTORY_IMMUTABLE'; END IF;
  IF EXISTS(SELECT 1 FROM "AccountingOpeningAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."openingItemId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_ALREADY_MATCHED'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=CASE WHEN TG_OP='UPDATE' THEN NEW."voidedByEmployeeId" ELSE NEW."createdByEmployeeId" END AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole"='ADMIN') THEN RAISE EXCEPTION 'LEDGER_ADJUSTMENT_ADMIN_REQUIRED'; END IF;
 IF NEW."partyOrgId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=NEW."partyOrgId" AND p.id<>NEW."orgId" AND (p."ownerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id OR r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=p.id))) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
 IF TG_OP='INSERT' AND NEW."invoiceId" IS NOT NULL THEN
  SELECT * INTO bill FROM "Invoice" WHERE id=NEW."invoiceId" AND "sellerOrgId"=NEW."orgId" FOR UPDATE;
  SELECT bill."receivableAdded"-coalesce((SELECT sum(amount) FROM "InvoiceCredit" WHERE "invoiceId"=bill.id AND "voidedAt" IS NULL),0)-coalesce((SELECT sum(a.amount) FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."invoiceId" IN (SELECT id FROM "Invoice" WHERE id=coalesce(bill."rootInvoiceId",bill.id) OR "rootInvoiceId"=coalesce(bill."rootInvoiceId",bill.id)) AND e."voidedAt" IS NULL),0) INTO current_amount;
  IF bill.status<>'ISSUED' OR bill."buyerOrgId" IS DISTINCT FROM NEW."partyOrgId" OR NEW."employeeId" IS NOT NULL OR bill."currencyCode"<>NEW."currencyCode" OR NEW.amount<>current_amount OR coalesce(bill.snapshot->'fields'->>'date',to_char(bill."issuedAt",'YYYY-MM-DD'))>=NEW."balanceDate" OR EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE id=coalesce(bill."rootInvoiceId",bill.id) OR "rootInvoiceId"=coalesce(bill."rootInvoiceId",bill.id)) AND "voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_SOURCE_CHANGED'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW."expenseItemId" IS NOT NULL THEN
  SELECT * INTO cost FROM "PartnerTransactionCost" WHERE id=NEW."expenseItemId" AND "orgId"=NEW."orgId" FOR UPDATE;
  SELECT cost.amount-coalesce(sum(a.amount),0) INTO current_amount FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=cost.id AND e."voidedAt" IS NULL;
  IF cost.currency<>NEW."currencyCode" OR cost."partnerOrgId" IS DISTINCT FROM NEW."partyOrgId" OR cost."payeeEmployeeId" IS DISTINCT FROM NEW."employeeId" OR NEW.amount<>current_amount OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=cost."expenseRequestId" AND r."orgId"=NEW."orgId" AND r.version=NEW."sourceVersion" AND r."deletedAt" IS NULL AND r."requestDate"<NEW."balanceDate") THEN RAISE EXCEPTION 'OPENING_SOURCE_CHANGED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "AccountingOpeningItem_guard" ON "AccountingOpeningItem";
CREATE TRIGGER "AccountingOpeningItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AccountingOpeningItem" FOR EACH ROW EXECUTE FUNCTION baro_opening_item_guard();

CREATE OR REPLACE FUNCTION baro_opening_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item "AccountingOpeningItem"; e "BankLedgerEntry"; used DECIMAL(24,4);
BEGIN
 SELECT * INTO item FROM "AccountingOpeningItem" WHERE id=NEW."openingItemId" AND "orgId"=NEW."orgId" FOR UPDATE;
 SELECT * INTO e FROM "BankLedgerEntry" WHERE id=NEW."entryId" AND "orgId"=NEW."orgId";
 IF item.id IS NULL OR e.id IS NULL OR item.kind<>'OPENING' OR item."voidedAt" IS NOT NULL OR e."voidedAt" IS NOT NULL OR e."evidenceType"<>'OPENING' OR e."evidenceNumber"<>item.id OR e.amount<>NEW.amount OR e.direction<>(CASE WHEN item.side='AR' THEN 'IN' ELSE 'OUT' END) OR e."counterpartyOrgId" IS DISTINCT FROM item."partyOrgId" OR e."counterpartyEmployeeId" IS DISTINCT FROM item."employeeId" OR e."counterpartyAccountId" IS NOT NULL OR e."accountingCodeId" IS DISTINCT FROM item."accountingCodeId" OR e."transactionDate"<item."balanceDate" OR item."currencyCode"<>(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=e."accountId") THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 SELECT coalesce(sum(a.amount),0) INTO used FROM "AccountingOpeningAllocation" a JOIN "BankLedgerEntry" b ON b.id=a."entryId" WHERE a."openingItemId"=item.id AND b."voidedAt" IS NULL;
 IF used+NEW.amount>item.amount THEN RAISE EXCEPTION 'LEDGER_EXCEEDS_DOCUMENT'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "AccountingOpeningAllocation_guard" ON "AccountingOpeningAllocation";
CREATE TRIGGER "AccountingOpeningAllocation_guard" BEFORE INSERT ON "AccountingOpeningAllocation" FOR EACH ROW EXECUTE FUNCTION baro_opening_allocation_guard();
DROP TRIGGER IF EXISTS "AccountingOpeningAllocation_append_only" ON "AccountingOpeningAllocation";
CREATE TRIGGER "AccountingOpeningAllocation_append_only" BEFORE UPDATE OR DELETE ON "AccountingOpeningAllocation" FOR EACH ROW EXECUTE FUNCTION baro_evidence_append_only();

CREATE OR REPLACE FUNCTION baro_opening_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."evidenceType"='OPENING' AND NOT EXISTS(SELECT 1 FROM "AccountingOpeningAllocation" WHERE "entryId"=NEW.id AND "orgId"=NEW."orgId" AND amount=NEW.amount) THEN RAISE EXCEPTION 'LEDGER_ALLOCATION_MISMATCH'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "AccountingOpeningEntry_guard" ON "BankLedgerEntry";
CREATE CONSTRAINT TRIGGER "AccountingOpeningEntry_guard" AFTER INSERT ON "BankLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_opening_entry_guard();

CREATE OR REPLACE FUNCTION baro_ledger_evidence_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
 IF (to_jsonb(NEW)-'voidedAt'-'voidedBy'-'voidReason') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt'-'voidedBy'-'voidReason') OR OLD."voidedAt" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_ENTRY_IMMUTABLE'; END IF;RETURN NEW; END IF;
 IF NEW."evidenceType" NOT IN ('FILE','INVOICE','EXPENSE','ADJUSTMENT','BANK_FEE','OPENING') OR NEW."bankFee"<0 OR length(trim(NEW.purpose))=0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW."evidenceType"='FILE' AND length(trim(NEW."evidenceNumber")) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LEDGER_FILE_REQUIRED'; END IF;
 IF NEW."evidenceType" IN ('FILE','ADJUSTMENT','BANK_FEE','OPENING') AND NEW."bankFee"<>0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION baro_opening_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='Invoice' THEN
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.total IS DISTINCT FROM OLD.total OR NEW."receivableAdded" IS DISTINCT FROM OLD."receivableAdded") AND EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "invoiceId"=OLD.id AND "voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_SOURCE_LOCKED'; END IF;
 ELSIF TG_TABLE_NAME='ExpenseRequest' THEN
  IF (NEW.version IS DISTINCT FROM OLD.version OR NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt") AND EXISTS(SELECT 1 FROM "AccountingOpeningItem" a JOIN "PartnerTransactionCost" c ON c.id=a."expenseItemId" WHERE c."expenseRequestId"=OLD.id AND a."voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_SOURCE_LOCKED'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "expenseItemId"=OLD.id AND "voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_SOURCE_LOCKED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_opening_guard" ON "Invoice";
CREATE TRIGGER "Invoice_opening_guard" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION baro_opening_source_guard();
DROP TRIGGER IF EXISTS "Cost_opening_guard" ON "PartnerTransactionCost";
CREATE TRIGGER "Cost_opening_guard" BEFORE UPDATE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_opening_source_guard();
DROP TRIGGER IF EXISTS "ExpenseRequest_opening_guard" ON "ExpenseRequest";
CREATE TRIGGER "ExpenseRequest_opening_guard" BEFORE UPDATE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_opening_source_guard();

CREATE OR REPLACE FUNCTION baro_opening_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "invoiceId"=NEW."invoiceId" AND "voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_SOURCE_LOCKED'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InvoicePayment_opening_guard" ON "InvoicePayment";
CREATE TRIGGER "InvoicePayment_opening_guard" BEFORE INSERT OR UPDATE ON "InvoicePayment" FOR EACH ROW EXECUTE FUNCTION baro_opening_payment_guard();
DROP TRIGGER IF EXISTS "InvoiceCredit_opening_guard" ON "InvoiceCredit";
CREATE TRIGGER "InvoiceCredit_opening_guard" BEFORE INSERT OR UPDATE ON "InvoiceCredit" FOR EACH ROW EXECUTE FUNCTION baro_opening_payment_guard();
