// Read-only inventory. Never deletes classifications or rewrites business data.
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {PrismaClient}=require('@prisma/client');
async function audit(){
 assertSafeApplicationDatabaseEnv(process.env);
 const db=new PrismaClient();
 try{
  const result=await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const references=await tx.$queryRawUnsafe(`SELECT t.id,t.code,t."isActive",
    (SELECT count(*)::int FROM "TransactionCodeBase" b WHERE b."expenseTypeId"=t.id) AS "codeFamilies",
    (SELECT count(*)::int FROM "Organization" o WHERE o."partnerExpenseTypeId"=t.id) AS "partnerReferences",
    (SELECT count(*)::int FROM "SettingServiceDefault" s WHERE s."expenseTypeId"=t.id) AS "industryReferences"
    FROM "ExpenseType" t ORDER BY t.id`);
   const anchors=await tx.$queryRawUnsafe(`SELECT s.code='GENERAL' AS "legacyGeneral",b."entryMode",count(*)::int AS count
    FROM "TransactionCodeBase" b JOIN "SettingServiceDefault" s ON s.id=b."serviceTypeId" GROUP BY 1,2 ORDER BY 1,2`);
   const orphaned=await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "TransactionCodeBase" b LEFT JOIN "SettingServiceDefault" s ON s.id=b."serviceTypeId" WHERE s.id IS NULL`);
   return {mode:'READ_ONLY',references,anchors,orphanedSourceCount:orphaned[0].count,legacyTableDropSafe:false,reason:'Compatibility FK readers and SQL guards still reference ExpenseType. This tool never authorizes a table drop.'};
  },{timeout:15000});
  console.log(JSON.stringify(result,null,2));
 }finally{await db.$disconnect();}
}
if(require.main===module)audit().catch(()=>{console.error('Read-only accounting inventory unavailable; no database changes were attempted.');process.exitCode=1;});
module.exports={audit};
