-- Acknowledgement is separate from the immutable original change event.
CREATE TABLE "LedgerChangeAcknowledgement" (
 "entryId" TEXT NOT NULL,"orgId" INT NOT NULL,"employeeId" INT NOT NULL,"actorEmail" TEXT NOT NULL,
 "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("entryId","orgId"),
 CONSTRAINT "LedgerChangeAcknowledgement_entry_scope_fkey" FOREIGN KEY("entryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "LedgerChangeAcknowledgement_employee_scope_fkey" FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "LedgerChangeAcknowledgement_orgId_confirmedAt_idx" ON "LedgerChangeAcknowledgement"("orgId","confirmedAt");
CREATE OR REPLACE FUNCTION baro_ledger_change_ack_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" e WHERE e.id=NEW."entryId" AND e."orgId"=NEW."orgId" AND e."voidedAt" IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id=NEW."employeeId" AND e."orgId"=NEW."orgId" AND e.status='ACTIVE' AND e."orgRole" IN ('ADMIN','ACCOUNTANT')) THEN RAISE EXCEPTION 'LEDGER_CHANGE_ACK_DENIED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "LedgerChangeAcknowledgement_scope_guard" BEFORE INSERT ON "LedgerChangeAcknowledgement" FOR EACH ROW EXECUTE FUNCTION baro_ledger_change_ack_guard();
CREATE TRIGGER "LedgerChangeAcknowledgement_append_only" BEFORE UPDATE OR DELETE ON "LedgerChangeAcknowledgement" FOR EACH ROW EXECUTE FUNCTION baro_evidence_append_only();
