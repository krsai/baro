// Credentials arrive through stdin only. Never print connection strings or raw errors.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const tracked=['Organization','Invoice','InvoiceOrder','InvoiceLine','InvoicePayment','InvoicePaymentAllocation','InvoiceCredit','ExpenseRequest','ExpenseRequestAudit','ExpenseRequestApprovalStep','ExpenseApprovalDecision','PartnerTransactionCost','OutsourcedWorkRecord','WorkRecord','Attendance','BankLedgerAccount','BankLedgerEntry','BankLedgerEvidenceAllocation'];
const versions=['20261028090000_expense_approval_settings','20261028140000_document_management_numbers'];
let db,queue=Promise.resolve();
const print=value=>process.stdout.write(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');
const migrations=()=>versions.map(version=>{const sql=fs.readFileSync(path.join(__dirname,'../backend/prisma/migrations',version,'migration.sql'),'utf8').replace(/\r\n/g,'\n');return {version,sql,checksum:crypto.createHash('sha256').update(sql).digest('hex')};});
async function fingerprints(tx){
 const present=await tx.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public'`),names=new Set(present.map(row=>row.tablename));
 const result=[];
 for(const table of tracked.filter(name=>names.has(name))){
  const rows=await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg((to_jsonb(t)-'managementNumber')::text,'' ORDER BY to_jsonb(t)->>'id'),'')) AS digest FROM "${table}" t`);
  result.push({table,...rows[0]});
 }
 return result;
}
async function audit(){return db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const columns=await tx.$queryRawUnsafe(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ExpenseRequest','Invoice')`);
 const hasNumber=columns.some(row=>row.table_name==='ExpenseRequest'&&row.column_name==='managementNumber');
 const history=await tx.$queryRawUnsafe(`SELECT version,checksum FROM "EntitySchemaMigration" ORDER BY version`);
 const checks=migrations().map(item=>{const row=history.find(row=>row.version===item.version);return {version:item.version,applied:!!row,checksumMatches:!row||row.checksum===item.checksum};});
 const invoiceCounts=await tx.$queryRawUnsafe(`SELECT "sellerOrgId",status,count(*)::int AS count FROM "Invoice" GROUP BY "sellerOrgId",status ORDER BY "sellerOrgId",status`);
 const expenseCounts=await tx.$queryRawUnsafe(`SELECT "orgId",count(*)::int AS count${hasNumber?',count(*) FILTER(WHERE "managementNumber" IS NULL)::int AS "missingStoredNumber"':''} FROM "ExpenseRequest" GROUP BY "orgId" ORDER BY "orgId"`);
 const settings=await tx.$queryRawUnsafe(`SELECT key,ARRAY(SELECT jsonb_object_keys(value)) AS keys FROM "SystemSetting" WHERE key LIKE 'EXPENSE_APPROVAL_POLICY:%' OR key LIKE 'DOCUMENT_NUMBER:%' ORDER BY key`);
 const triggers=await tx.$queryRawUnsafe(`SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='"ExpenseRequest"'::regclass AND NOT tgisinternal ORDER BY tgname`);
 return {action:'audit',hasNumber,migrations:checks,invoices:invoiceCounts,expenses:expenseCounts,settings,triggers,fingerprints:await fingerprints(tx)};
 },{timeout:60000,isolationLevel:'RepeatableRead'});}
async function migrate(apply){return db.$transaction(async tx=>{
 await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='60s'");
 await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(2026102002)::text');
 const before=await fingerprints(tx),changed=[];
 for(const item of migrations()){
  const rows=await tx.$queryRawUnsafe('SELECT checksum FROM "EntitySchemaMigration" WHERE version=$1',item.version);
  if(rows[0]&&rows[0].checksum!==item.checksum)throw Error('CHECKSUM_MISMATCH');
  if(!rows.length){await tx.$executeRawUnsafe(item.sql);await tx.$executeRawUnsafe('INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES($1,$2)',item.version,item.checksum);changed.push(item.version);}
 }
 const after=await fingerprints(tx);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('BUSINESS_DATA_CHANGED');
 const result={action:apply?'migrations-applied':'migrations-rollback-verified',changed,preservedTables:before.length};
 if(!apply){const error=Error('ROLLBACK_VERIFIED');error.result=result;throw error;}
 return result;
 },{timeout:90000,isolationLevel:'Serializable'}).catch(error=>{if(error.result)return error.result;throw error;});}
if(process.stdin.isTTY)process.stdin.setRawMode(true); // Disable terminal echo before accepting credentials.
const rl=readline.createInterface({input:process.stdin,terminal:false});
rl.on('line',line=>{queue=queue.then(async()=>{try{
 const input=JSON.parse(line);
 if(!db){const url=String(input.url||'');new URL(url);assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});const client=new PrismaClient({datasourceUrl:url,log:[]});await client.$connect();db=client;print({connected:true});return;}
 if(input.action==='audit')print(await audit());
 else if(input.action==='inspect-invoice-numbers')print(await require('./helpers/production-invoice-numbers.cjs').inspect(db));
 else if(input.action==='verify-invoice-numbers'||input.action==='apply-invoice-numbers')print(await require('./helpers/production-invoice-numbers.cjs').renumber({db,targets:input.targets,apply:input.action==='apply-invoice-numbers'}));
 else if(input.action==='verify-migrations')print(await migrate(false));
 else if(input.action==='apply-migrations')print(await migrate(true));
 else if(input.action==='verify-backfill'||input.action==='apply-backfill')print(await require('./helpers/production-document-operations.cjs').backfill({db,fingerprints,apply:input.action==='apply-backfill'}));
 else if(input.action==='close'){await db.$disconnect();rl.close();process.stdin.destroy();}
 else print({error:'UNKNOWN_ACTION'});
 }catch(error){print({error:error.code||(['CHECKSUM_MISMATCH','BUSINESS_DATA_CHANGED'].includes(error.message)?error.message:'OPERATION_FAILED'),sqlCode:error.meta?.code,unsupportedVoidResult:String(error.meta?.message||error.message).includes('void')});}});});
