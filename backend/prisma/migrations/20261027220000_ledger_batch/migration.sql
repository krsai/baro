-- Immutable receipts make a multi-row save atomic and repeatable after a lost response.
CREATE TABLE "BankLedgerBatch" (
 id TEXT PRIMARY KEY,"orgId" INT NOT NULL,"clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 "entryIds" JSONB NOT NULL,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
 UNIQUE("orgId","clientKey")
);
CREATE TRIGGER "BankLedgerBatch_append_only" BEFORE UPDATE OR DELETE ON "BankLedgerBatch" FOR EACH ROW EXECUTE FUNCTION baro_evidence_append_only();
CREATE INDEX "BankLedgerEntry_org_date_idx" ON "BankLedgerEntry"("orgId","transactionDate","createdAt",id);
