// Read-only rollout evidence. Never prints credentials, filenames or financial data.
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {PrismaClient}=require('@prisma/client');
async function audit(){
 assertSafeApplicationDatabaseEnv(process.env);
 if(!process.env.DATABASE_URL&&!process.env.DIRECT_URL)throw Error('Application database connection is not configured.');
 const db=new PrismaClient({datasources:{db:{url:process.env.DIRECT_URL||process.env.DATABASE_URL}}});
 try{
  const report=await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const [{present}]=await tx.$queryRawUnsafe(`SELECT to_regclass('"BankLedgerManagementNumber"') IS NOT NULL AS present`);
   const groups=await tx.$queryRawUnsafe(`SELECT "orgId",left("transactionDate",4) AS year,count(*)::int AS entries,count(*) FILTER(WHERE "voidedAt" IS NOT NULL)::int AS cancelled FROM "BankLedgerEntry" GROUP BY 1,2 ORDER BY 1,2`);
   if(!present)return {applied:false,groups};
   const [integrity]=await tx.$queryRawUnsafe(`SELECT
    (SELECT count(*)::int FROM "BankLedgerEntry" b LEFT JOIN "BankLedgerManagementNumber" n ON n."entryId"=b.id AND n."orgId"=b."orgId" WHERE n."entryId" IS NULL) AS missing,
    (SELECT count(*)::int FROM "BankLedgerManagementNumber" WHERE origin='BACKFILL' AND "originalRow" IS NOT NULL) AS backedUp,
    (SELECT count(*)::int FROM "BankLedgerManagementNumber") AS assigned,
    (SELECT count(*)::int FROM "BankLedgerManagementNumber" n LEFT JOIN "BankLedgerNumberCounter" c ON c."orgId"=n."orgId" AND c.year=n.year WHERE c."lastNumber" IS NULL OR c."lastNumber"<n.sequence) AS invalidCounters`);
   return {applied:true,groups,...integrity};
  });
  console.log(JSON.stringify(report,null,2));
  if(report.applied&&(report.missing||report.invalidCounters))process.exitCode=1;
 }finally{await db.$disconnect();}
}
if(require.main===module)audit().catch(()=>{console.error('[ledger-number-audit] Could not verify application database. Check the configured Railway connection; no data was changed.');process.exitCode=1;});
module.exports={audit};
