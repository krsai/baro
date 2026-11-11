-- Additive: legacy locked payrolls are imported only by an explicit administrator action.
-- No salary, cash, or historical management state is rewritten by this migration.
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSnapshot_id_orgId_key" ON "PayrollSnapshot"(id,"orgId");
ALTER TABLE "AccountingOpeningItem" ADD COLUMN IF NOT EXISTS "payrollItemId" TEXT;

CREATE TABLE IF NOT EXISTS "PayrollPayableDocument" (
    "id" TEXT NOT NULL,
    "orgId" INTEGER NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "managementNumber" TEXT NOT NULL,
    "accountingCodeId" INTEGER NOT NULL,
    "createdByEmployeeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPayableDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PayrollPayableItem" (
    "id" TEXT NOT NULL,
    "orgId" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "snapshotRevision" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL(24,4) NOT NULL,
    "createdByEmployeeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedByEmployeeId" INTEGER,

    CONSTRAINT "PayrollPayableItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PayrollPayableAllocation" (
    "id" TEXT NOT NULL,
    "orgId" INTEGER NOT NULL,
    "payrollItemId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "amount" DECIMAL(24,4) NOT NULL,

    CONSTRAINT "PayrollPayableAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableDocument_snapshotId_key" ON "PayrollPayableDocument"("snapshotId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableDocument_snapshotId_orgId_key" ON "PayrollPayableDocument"("snapshotId", "orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableDocument_id_orgId_key" ON "PayrollPayableDocument"("id", "orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableDocument_orgId_managementNumber_key" ON "PayrollPayableDocument"("orgId", "managementNumber");

CREATE INDEX IF NOT EXISTS "PayrollPayableItem_orgId_voidedAt_idx" ON "PayrollPayableItem"("orgId", "voidedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableItem_id_orgId_key" ON "PayrollPayableItem"("id", "orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableItem_documentId_snapshotRevision_employeeId_key" ON "PayrollPayableItem"("documentId", "snapshotRevision", "employeeId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableAllocation_entryId_key" ON "PayrollPayableAllocation"("entryId");

CREATE INDEX IF NOT EXISTS "PayrollPayableAllocation_payrollItemId_idx" ON "PayrollPayableAllocation"("payrollItemId");

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_payroll_fkey') THEN ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_payroll_fkey" FOREIGN KEY ("payrollItemId", "orgId") REFERENCES "PayrollPayableItem"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableDocument_org_fkey') THEN ALTER TABLE "PayrollPayableDocument" ADD CONSTRAINT "PayrollPayableDocument_org_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableDocument_snapshot_fkey') THEN ALTER TABLE "PayrollPayableDocument" ADD CONSTRAINT "PayrollPayableDocument_snapshot_fkey" FOREIGN KEY ("snapshotId", "orgId") REFERENCES "PayrollSnapshot"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableDocument_code_fkey') THEN ALTER TABLE "PayrollPayableDocument" ADD CONSTRAINT "PayrollPayableDocument_code_fkey" FOREIGN KEY ("accountingCodeId", "orgId") REFERENCES "TransactionCode"("id", "ownerOrgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableDocument_actor_fkey') THEN ALTER TABLE "PayrollPayableDocument" ADD CONSTRAINT "PayrollPayableDocument_actor_fkey" FOREIGN KEY ("createdByEmployeeId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableItem_document_fkey') THEN ALTER TABLE "PayrollPayableItem" ADD CONSTRAINT "PayrollPayableItem_document_fkey" FOREIGN KEY ("documentId", "orgId") REFERENCES "PayrollPayableDocument"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableItem_employee_fkey') THEN ALTER TABLE "PayrollPayableItem" ADD CONSTRAINT "PayrollPayableItem_employee_fkey" FOREIGN KEY ("employeeId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableItem_actor_fkey') THEN ALTER TABLE "PayrollPayableItem" ADD CONSTRAINT "PayrollPayableItem_actor_fkey" FOREIGN KEY ("createdByEmployeeId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableItem_void_actor_fkey') THEN ALTER TABLE "PayrollPayableItem" ADD CONSTRAINT "PayrollPayableItem_void_actor_fkey" FOREIGN KEY ("voidedByEmployeeId", "orgId") REFERENCES "Employee"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableAllocation_item_fkey') THEN ALTER TABLE "PayrollPayableAllocation" ADD CONSTRAINT "PayrollPayableAllocation_item_fkey" FOREIGN KEY ("payrollItemId", "orgId") REFERENCES "PayrollPayableItem"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PayrollPayableAllocation_entry_fkey') THEN ALTER TABLE "PayrollPayableAllocation" ADD CONSTRAINT "PayrollPayableAllocation_entry_fkey" FOREIGN KEY ("entryId", "orgId") REFERENCES "BankLedgerEntry"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

ALTER TABLE "AccountingOpeningItem" DROP CONSTRAINT IF EXISTS "AccountingOpeningItem_values_check";
ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_values_check" CHECK (
 amount>0 AND "currencyCode" IN ('USD','VND','KRW') AND ("currencyCode"='USD' AND amount=round(amount,2) OR "currencyCode"<>'USD' AND amount=round(amount,0))
 AND side IN ('AR','AP') AND num_nonnulls("partyOrgId","employeeId")=1 AND length(trim(reason)) BETWEEN 1 AND 1000
 AND "balanceDate" ~ '^\d{4}-\d{2}-\d{2}$'
 AND (kind='OPENING' AND "accountingCodeId" IS NOT NULL AND "invoiceId" IS NULL AND "expenseItemId" IS NULL AND "payrollItemId" IS NULL
 OR kind IN ('SETTLED','EXCLUDED') AND (num_nonnulls("invoiceId","expenseItemId","payrollItemId")=1 AND side='AR' AND "invoiceId" IS NOT NULL AND "expenseItemId" IS NULL OR side='AP' AND num_nonnulls("expenseItemId","payrollItemId")=1 AND "invoiceId" IS NULL))
 AND ("voidedAt" IS NULL AND "voidReason" IS NULL AND "voidedByEmployeeId" IS NULL OR "voidedAt" IS NOT NULL AND length(trim("voidReason"))>0 AND "voidedByEmployeeId" IS NOT NULL));
CREATE OR REPLACE FUNCTION baro_ledger_evidence_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
 IF (to_jsonb(NEW)-'voidedAt'-'voidedBy'-'voidReason') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt'-'voidedBy'-'voidReason') OR OLD."voidedAt" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_ENTRY_IMMUTABLE'; END IF;RETURN NEW; END IF;
 IF NEW."evidenceType" NOT IN ('FILE','INVOICE','EXPENSE','ADJUSTMENT','BANK_FEE','OPENING','PAYROLL') OR NEW."bankFee"<0 OR length(trim(NEW.purpose))=0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
 IF NEW."evidenceType"='FILE' AND length(trim(NEW."evidenceNumber")) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LEDGER_FILE_REQUIRED'; END IF;
 IF NEW."evidenceType" IN ('FILE','ADJUSTMENT','BANK_FEE','OPENING','PAYROLL') AND NEW."bankFee"<>0 THEN RAISE EXCEPTION 'LEDGER_INVALID_EVIDENCE'; END IF;
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
  IF NEW."counterpartyEmployeeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."counterpartyEmployeeId" AND "orgId"=NEW."orgId" AND (status::text='ACTIVE' OR NEW."evidenceType" IN ('EXPENSE','PAYROLL'))) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
  IF NEW."counterpartyAccountId" IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM "OrganizationBankAccount" WHERE id=NEW."counterpartyAccountId" AND "orgId"=NEW."orgId" AND "entityId"=NEW."orgId" AND "isActive") OR EXISTS(SELECT 1 FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "entityAccountId"=NEW."counterpartyAccountId")) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
 END IF;
 IF NEW."evidenceType"='BANK_FEE' AND NOT EXISTS(SELECT 1 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "TaxTreatment" t ON t.id=c."taxTreatmentId" WHERE c.id=NEW."accountingCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."isActive" AND b."isActive" AND b.code='FEE' AND t.suffix='E') THEN RAISE EXCEPTION 'LEDGER_ACCOUNTING_CODE_INVALID'; END IF;
 RETURN NEW;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableItem_active_employee_key" ON "PayrollPayableItem"("documentId","employeeId") WHERE "voidedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingOpeningItem_active_payroll_key" ON "AccountingOpeningItem"("payrollItemId") WHERE "voidedAt" IS NULL AND "payrollItemId" IS NOT NULL;
CREATE OR REPLACE FUNCTION baro_payroll_actor(org_id INTEGER,actor_id INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor_id AND "orgId"=org_id AND status='ACTIVE' AND "orgRole" IN ('ADMIN','ACCOUNTANT','OPERATOR'));
$$;
CREATE OR REPLACE FUNCTION baro_payroll_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
 IF NOT baro_payroll_actor(NEW."orgId",NEW."createdByEmployeeId") OR NOT EXISTS(SELECT 1 FROM "PayrollSnapshot" s WHERE s.id=NEW."snapshotId" AND s."orgId"=NEW."orgId" AND NOT s."isProvisional" AND s.month=NEW.month) OR NOT EXISTS(SELECT 1 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "TaxTreatment" t ON t.id=c."taxTreatmentId" WHERE c.id=NEW."accountingCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."isActive" AND b."isActive" AND b.code='SAL' AND t.suffix='E') THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_INVALID_SOURCE'; END IF;
 IF NEW."managementNumber" !~ '^PAY-[0-9]{4}-[0-9]{6}$' THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_INVALID_SOURCE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollPayableDocument_guard" ON "PayrollPayableDocument";
CREATE TRIGGER "PayrollPayableDocument_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollPayableDocument" FOR EACH ROW EXECUTE FUNCTION baro_payroll_document_guard();
CREATE OR REPLACE FUNCTION baro_payroll_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source "PayrollSnapshot"; wage JSONB; wage_count INTEGER; expected NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NULL OR (to_jsonb(NEW)-'voidedAt'-'voidedByEmployeeId') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt'-'voidedByEmployeeId') OR NOT baro_payroll_actor(NEW."orgId",NEW."voidedByEmployeeId") THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
  IF EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "payrollItemId"=OLD.id AND "voidedAt" IS NULL) THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_EXCLUDED'; END IF;
  IF EXISTS(SELECT 1 FROM "PayrollPayableAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."payrollItemId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'PAYROLL_PAYMENT_LINKED'; END IF;
  RETURN NEW;
 END IF;
 SELECT s.* INTO source FROM "PayrollSnapshot" s JOIN "PayrollPayableDocument" d ON d."snapshotId"=s.id AND d."orgId"=s."orgId" WHERE d.id=NEW."documentId" AND d."orgId"=NEW."orgId" FOR UPDATE OF s;
 SELECT count(*) INTO wage_count FROM jsonb_array_elements(source.data) e WHERE (e->>'workerId')::INTEGER=NEW."employeeId";
 SELECT e INTO wage FROM jsonb_array_elements(source.data) e WHERE (e->>'workerId')::INTEGER=NEW."employeeId" LIMIT 1;
 expected:=coalesce(wage->>'netSalary',wage->>'grossSalary',wage->>'totalSalary',wage->>'totalEarnings',wage->>'productionEarnings',wage->>'productionAllowance')::NUMERIC;
 IF source.id IS NULL OR source."isProvisional" OR source.revision<>NEW."snapshotRevision" OR NOT baro_payroll_actor(NEW."orgId",NEW."createdByEmployeeId") OR wage_count<>1 OR NEW."currencyCode" NOT IN ('USD','VND','KRW') OR NEW."currencyCode"<>coalesce(wage->>'currencyCode','VND') OR expected IS NULL OR NEW.amount<=0 OR NEW.amount<>round(expected,CASE WHEN NEW."currencyCode"='USD' THEN 2 ELSE 0 END) OR NEW."voidedAt" IS NOT NULL OR NEW."voidedByEmployeeId" IS NOT NULL THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_INVALID_SOURCE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollPayableItem_guard" ON "PayrollPayableItem";
CREATE TRIGGER "PayrollPayableItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollPayableItem" FOR EACH ROW EXECUTE FUNCTION baro_payroll_item_guard();
CREATE OR REPLACE FUNCTION baro_payroll_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT OLD."isProvisional" AND NOT NEW."isProvisional" AND NEW.revision<>OLD.revision THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
 IF NOT OLD."isProvisional" AND (NEW.data IS DISTINCT FROM OLD.data OR NEW.month<>OLD.month OR NEW."orgId"<>OLD."orgId" OR NEW."factoryId"<>OLD."factoryId") THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
 IF NEW."isProvisional" IS DISTINCT FROM OLD."isProvisional" THEN
  IF NOT baro_payroll_actor(NEW."orgId",NEW."updatedByEmployeeId") OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_ACCESS_DENIED'; END IF;
  IF EXISTS(SELECT 1 FROM "PayrollPayableItem" i JOIN "PayrollPayableDocument" d ON d.id=i."documentId" JOIN "AccountingOpeningItem" a ON a."payrollItemId"=i.id WHERE d."snapshotId"=OLD.id AND i."voidedAt" IS NULL AND a."voidedAt" IS NULL) THEN RAISE EXCEPTION 'PAYROLL_MANAGEMENT_EXCLUDED'; END IF;
  IF EXISTS(SELECT 1 FROM "PayrollPayableItem" i JOIN "PayrollPayableDocument" d ON d.id=i."documentId" JOIN "PayrollPayableAllocation" a ON a."payrollItemId"=i.id JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE d."snapshotId"=OLD.id AND i."voidedAt" IS NULL AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'PAYROLL_PAYMENT_LINKED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollSnapshot_payable_guard" ON "PayrollSnapshot";
CREATE TRIGGER "PayrollSnapshot_payable_guard" BEFORE UPDATE ON "PayrollSnapshot" FOR EACH ROW EXECUTE FUNCTION baro_payroll_snapshot_guard();
CREATE OR REPLACE FUNCTION baro_payroll_consistency_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source "PayrollSnapshot"; expected INTEGER; actual INTEGER;
BEGIN
 IF TG_TABLE_NAME='PayrollSnapshot' THEN SELECT * INTO source FROM "PayrollSnapshot" WHERE id=NEW.id;
 ELSE SELECT s.* INTO source FROM "PayrollSnapshot" s JOIN "PayrollPayableDocument" d ON d."snapshotId"=s.id WHERE d.id=NEW."documentId"; END IF;
 SELECT count(*) INTO actual FROM "PayrollPayableItem" i JOIN "PayrollPayableDocument" d ON d.id=i."documentId" WHERE d."snapshotId"=source.id AND i."voidedAt" IS NULL;
 IF source."isProvisional" THEN IF actual<>0 THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_SOURCE_CHANGED'; END IF;
 ELSE
  SELECT count(*) INTO expected FROM jsonb_array_elements(source.data) e WHERE round(coalesce(e->>'netSalary',e->>'grossSalary',e->>'totalSalary',e->>'totalEarnings',e->>'productionEarnings',e->>'productionAllowance')::NUMERIC,CASE WHEN coalesce(e->>'currencyCode','VND')='USD' THEN 2 ELSE 0 END)>0;
  IF expected<>actual OR NOT EXISTS(SELECT 1 FROM "PayrollPayableDocument" WHERE "snapshotId"=source.id) OR EXISTS(SELECT 1 FROM "PayrollPayableItem" i JOIN "PayrollPayableDocument" d ON d.id=i."documentId" WHERE d."snapshotId"=source.id AND i."voidedAt" IS NULL AND i."snapshotRevision"<>source.revision) THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_SOURCE_CHANGED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollSnapshot_payable_consistency" ON "PayrollSnapshot";
CREATE CONSTRAINT TRIGGER "PayrollSnapshot_payable_consistency" AFTER UPDATE ON "PayrollSnapshot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."isProvisional" IS DISTINCT FROM NEW."isProvisional") EXECUTE FUNCTION baro_payroll_consistency_guard();
DROP TRIGGER IF EXISTS "PayrollPayableItem_consistency" ON "PayrollPayableItem";
CREATE CONSTRAINT TRIGGER "PayrollPayableItem_consistency" AFTER INSERT OR UPDATE ON "PayrollPayableItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_payroll_consistency_guard();
CREATE OR REPLACE FUNCTION baro_payroll_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item "PayrollPayableItem"; doc "PayrollPayableDocument"; e "BankLedgerEntry"; used NUMERIC;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PAYROLL_HISTORY_IMMUTABLE'; END IF;
 SELECT * INTO item FROM "PayrollPayableItem" WHERE id=NEW."payrollItemId" AND "orgId"=NEW."orgId" FOR UPDATE;
 SELECT * INTO doc FROM "PayrollPayableDocument" WHERE id=item."documentId";
 SELECT * INTO e FROM "BankLedgerEntry" WHERE id=NEW."entryId" AND "orgId"=NEW."orgId";
 IF item.id IS NULL OR item."voidedAt" IS NOT NULL OR e.id IS NULL OR e."voidedAt" IS NOT NULL OR e."evidenceType"<>'PAYROLL' OR e."evidenceNumber"<>item.id OR e.direction<>'OUT' OR e."counterpartyEmployeeId" IS DISTINCT FROM item."employeeId" OR e."counterpartyOrgId" IS NOT NULL OR e."counterpartyAccountId" IS NOT NULL OR e."accountingCodeId" IS DISTINCT FROM doc."accountingCodeId" OR NEW.amount<>e.amount OR NEW.amount<=0 OR e."transactionDate"<doc.month||'-01' OR item."currencyCode"<>(SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id=e."accountId") OR NOT EXISTS(SELECT 1 FROM "PayrollSnapshot" WHERE id=doc."snapshotId" AND NOT "isProvisional" AND revision=item."snapshotRevision") THEN RAISE EXCEPTION 'PAYROLL_PAYABLE_SOURCE_CHANGED'; END IF;
 SELECT coalesce(sum(a.amount),0) INTO used FROM "PayrollPayableAllocation" a JOIN "BankLedgerEntry" b ON b.id=a."entryId" WHERE a."payrollItemId"=item.id AND b."voidedAt" IS NULL;
 used:=used+coalesce((SELECT sum(amount) FROM "AccountingOpeningItem" WHERE "payrollItemId"=item.id AND "voidedAt" IS NULL),0);
 IF used+NEW.amount>item.amount THEN RAISE EXCEPTION 'LEDGER_EXCEEDS_DOCUMENT'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollPayableAllocation_guard" ON "PayrollPayableAllocation";
CREATE TRIGGER "PayrollPayableAllocation_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollPayableAllocation" FOR EACH ROW EXECUTE FUNCTION baro_payroll_allocation_guard();
CREATE OR REPLACE FUNCTION baro_payroll_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."evidenceType"='PAYROLL' AND NOT EXISTS(SELECT 1 FROM "PayrollPayableAllocation" WHERE "entryId"=NEW.id AND "orgId"=NEW."orgId" AND amount=NEW.amount) THEN RAISE EXCEPTION 'LEDGER_ALLOCATION_MISMATCH'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PayrollPayableEntry_guard" ON "BankLedgerEntry";
CREATE CONSTRAINT TRIGGER "PayrollPayableEntry_guard" AFTER INSERT ON "BankLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_payroll_entry_guard();
CREATE OR REPLACE FUNCTION baro_payroll_opening_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item "PayrollPayableItem"; doc "PayrollPayableDocument"; remaining NUMERIC;
BEGIN
 IF NEW."payrollItemId" IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO item FROM "PayrollPayableItem" WHERE id=NEW."payrollItemId" AND "orgId"=NEW."orgId" FOR UPDATE;
 SELECT * INTO doc FROM "PayrollPayableDocument" WHERE id=item."documentId";
 SELECT item.amount-coalesce(sum(a.amount),0) INTO remaining FROM "PayrollPayableAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."payrollItemId"=item.id AND e."voidedAt" IS NULL;
 IF item.id IS NULL OR item."voidedAt" IS NOT NULL OR NEW.side<>'AP' OR NEW.kind NOT IN ('SETTLED','EXCLUDED') OR NEW."sourceVersion" IS DISTINCT FROM item."snapshotRevision" OR NEW."employeeId" IS DISTINCT FROM item."employeeId" OR NEW."partyOrgId" IS NOT NULL OR NEW."currencyCode"<>item."currencyCode" OR NEW."accountingCodeId" IS DISTINCT FROM doc."accountingCodeId" OR NEW.amount<>remaining OR to_char((doc.month||'-01')::date+interval '1 month'-interval '1 day','YYYY-MM-DD')>=NEW."balanceDate" OR NOT EXISTS(SELECT 1 FROM "PayrollSnapshot" WHERE id=doc."snapshotId" AND NOT "isProvisional" AND revision=item."snapshotRevision") THEN RAISE EXCEPTION 'OPENING_SOURCE_CHANGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "AccountingOpeningItem_payroll_guard" ON "AccountingOpeningItem";
CREATE TRIGGER "AccountingOpeningItem_payroll_guard" BEFORE INSERT ON "AccountingOpeningItem" FOR EACH ROW EXECUTE FUNCTION baro_payroll_opening_guard();
