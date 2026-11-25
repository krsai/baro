-- Sidecar identity: no UPDATE of historical ledger rows, approvals or snapshots.
-- Rollback uses a compatible application and retains numbers, counters and backups.
LOCK TABLE "BankLedgerEntry" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS "BankLedgerNumberCounter" (
 "orgId" integer NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 year integer NOT NULL CHECK (year BETWEEN 1000 AND 9999),
 "lastNumber" integer NOT NULL CHECK ("lastNumber">0),
 PRIMARY KEY ("orgId",year)
);
CREATE TABLE IF NOT EXISTS "BankLedgerManagementNumber" (
 "entryId" text PRIMARY KEY,
 "orgId" integer NOT NULL,
 "managementNumber" text NOT NULL,
 year integer NOT NULL,
 sequence integer NOT NULL CHECK (sequence>0),
 origin text NOT NULL CHECK (origin IN ('BACKFILL','AUTO')),
 "originalRow" jsonb,
 "assignedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LedgerManagementNumber_entry_org_key" UNIQUE ("entryId","orgId"),
 CONSTRAINT "LedgerManagementNumber_entry_scope_fkey" FOREIGN KEY ("entryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "LedgerManagementNumber_org_number_key" UNIQUE ("orgId","managementNumber"),
 CONSTRAINT "LedgerManagementNumber_org_year_sequence_key" UNIQUE ("orgId",year,sequence)
);
CREATE OR REPLACE FUNCTION baro_assign_ledger_number(entry_id text, company_id integer, entry_date text, source text, original_row jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE entry_year integer; next_number integer;
BEGIN
 IF EXISTS(SELECT 1 FROM "BankLedgerManagementNumber" WHERE "entryId"=entry_id AND "orgId"=company_id) THEN RETURN; END IF;
 IF entry_date !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'LEDGER_NUMBER_INVALID_DATE'; END IF;
 entry_year=left(entry_date,4)::integer;
 INSERT INTO "BankLedgerNumberCounter"("orgId",year,"lastNumber") VALUES(company_id,entry_year,1)
 ON CONFLICT ("orgId",year) DO UPDATE SET "lastNumber"="BankLedgerNumberCounter"."lastNumber"+1 RETURNING "lastNumber" INTO next_number;
 INSERT INTO "BankLedgerManagementNumber"("entryId","orgId","managementNumber",year,sequence,origin,"originalRow")
 VALUES(entry_id,company_id,'BNK-'||entry_year||'-'||lpad(next_number::text,greatest(6,length(next_number::text)),'0'),entry_year,next_number,source,original_row);
END $$;
DO $$ DECLARE entry record; BEGIN
 FOR entry IN SELECT b.*,to_jsonb(b) AS original FROM "BankLedgerEntry" b
 WHERE NOT EXISTS(SELECT 1 FROM "BankLedgerManagementNumber" n WHERE n."entryId"=b.id)
 ORDER BY b."orgId",b."transactionDate",b."createdAt",b.id LOOP
  PERFORM baro_assign_ledger_number(entry.id,entry."orgId",entry."transactionDate",'BACKFILL',entry.original);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION baro_ledger_number_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM baro_assign_ledger_number(NEW.id,NEW."orgId",NEW."transactionDate",'AUTO',NULL);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Ledger_management_number_insert" ON "BankLedgerEntry";
CREATE TRIGGER "Ledger_management_number_insert" AFTER INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_number_insert();
CREATE OR REPLACE FUNCTION baro_ledger_number_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'LEDGER_MANAGEMENT_NUMBER_IMMUTABLE';
END $$;
DROP TRIGGER IF EXISTS "Ledger_management_number_immutable" ON "BankLedgerManagementNumber";
CREATE TRIGGER "Ledger_management_number_immutable" BEFORE UPDATE OR DELETE ON "BankLedgerManagementNumber" FOR EACH ROW EXECUTE FUNCTION baro_ledger_number_immutable();
