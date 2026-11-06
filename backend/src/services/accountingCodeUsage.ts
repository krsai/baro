// Configuration copies are not transactions. Voided/deleted documents remain history.
export async function accountingCodeUsage(db:any,ids:number[]){
 if(!ids.length)return new Map();
 const rows=await db.$queryRawUnsafe(`WITH refs AS (
 SELECT c."baseId" AS id,'expense' AS source,(r."deletedAt" IS NULL) AS current
 FROM "TransactionCode" c JOIN "PartnerTransactionCost" cost ON cost."transactionCodeId"=c.id
 LEFT JOIN "ExpenseRequest" r ON r.id=cost."expenseRequestId" AND r."orgId"=cost."orgId"
 WHERE c."baseId"=ANY($1::int[])
 UNION ALL
 SELECT c."baseId",'ledger',e."voidedAt" IS NULL FROM "TransactionCode" c
 JOIN "BankLedgerEntry" e ON e."accountingCodeId"=c.id WHERE c."baseId"=ANY($1::int[])
 UNION ALL
 SELECT c."baseId",'settlement',e."voidedAt" IS NULL FROM "TransactionCode" c
 JOIN "BankLedgerSettlementLine" l ON l."accountingCodeId"=c.id
 JOIN "BankLedgerEntry" e ON e.id=l."entryId" AND e."orgId"=l."orgId" WHERE c."baseId"=ANY($1::int[])
 ) SELECT id,source,count(*)::int AS total,count(*) FILTER(WHERE current)::int AS current FROM refs GROUP BY id,source`,ids);
 const result=new Map(ids.map(id=>[id,{current:0,history:0,expense:0,ledger:0,settlement:0}]));
 for(const row of rows){const value:any=result.get(row.id);if(!value)continue;const current=Number(row.current),total=Number(row.total);value.current+=current;value.history+=total-current;value[row.source]=current;}
 return result;
}
