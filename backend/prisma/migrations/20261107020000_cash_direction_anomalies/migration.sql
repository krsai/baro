-- User correction: direction is an anomaly basis, never a cash-write prohibition.
-- Preserve configured values, source IDs and all financial history.
DROP TRIGGER IF EXISTS "BankLedgerEntry_cash_direction_guard" ON "BankLedgerEntry";
DROP TRIGGER IF EXISTS "BankLedgerSettlementLine_cash_direction_guard" ON "BankLedgerSettlementLine";
DROP TRIGGER IF EXISTS "PartnerTransactionCost_cash_direction_guard" ON "PartnerTransactionCost";
DROP FUNCTION IF EXISTS baro_accounting_cash_direction_guard();

-- Read-only projection using the current configured basis. Consumers must scope orgId.
CREATE VIEW "AccountingDirectionAnomaly" AS
 SELECT e."orgId",'LEDGER'::text AS "sourceKind",e.id::text AS "sourceId",c.id AS "codeId",b."cashDirection" AS "expectedDirection",e.direction::text AS "actualDirection"
 FROM "BankLedgerEntry" e JOIN "TransactionCode" c ON c.id=e."accountingCodeId" AND c."ownerOrgId"=e."orgId"
 JOIN "TransactionCodeBase" b ON b.id=c."baseId"
 WHERE e."voidedAt" IS NULL AND b."cashDirection" NOT IN ('BOTH',e.direction::text)
 UNION ALL
 SELECT e."orgId",'SETTLEMENT',l.id::text,c.id,b."cashDirection",'OUT'
 FROM "BankLedgerSettlementLine" l JOIN "BankLedgerEntry" e ON e.id=l."entryId" AND e."orgId"=l."orgId"
 JOIN "TransactionCode" c ON c.id=l."accountingCodeId" AND c."ownerOrgId"=e."orgId" JOIN "TransactionCodeBase" b ON b.id=c."baseId"
 WHERE e."voidedAt" IS NULL AND b."cashDirection"='IN'
 UNION ALL
 SELECT p."orgId",'EXPENSE',p.id::text,c.id,b."cashDirection",'OUT'
 FROM "PartnerTransactionCost" p JOIN "TransactionCode" c ON c.id=p."transactionCodeId" AND c."ownerOrgId"=p."orgId"
 JOIN "TransactionCodeBase" b ON b.id=c."baseId"
 LEFT JOIN "ExpenseRequest" r ON r.id=p."expenseRequestId" AND r."orgId"=p."orgId"
 WHERE r."deletedAt" IS NULL AND b."cashDirection"='IN';
