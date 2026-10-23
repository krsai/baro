// Only the Railway application DB supplied on stdin; local auth URLs are never read.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const versions=['20261023140000_expense_code_link_policy','20261023140100_baro_expense_code_links'];
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const tables=['PartnerTransactionCost','ExpenseRequest','ExpenseRequestAudit','OutsourcedWorkRecord','WorkLog','WorkOrder','WorkOrderItem','AssignmentPlan','Style','StyleProcess'];
const digest=()=>tables.map(table=>`SELECT '${table}' AS name,count(*)::int AS count,md5(coalesce(string_agg((to_jsonb(t)-'linkTarget'-'linkPolicyAuditId')::text,'' ORDER BY id::text),'')) AS digest FROM "${table}" t`).join(' UNION ALL ');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',async()=>{let db;try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;
 if(!url)throw Error('APPLICATION_DB_URL_REQUIRED');
 assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
 db=new PrismaClient({datasourceUrl:url});
 if(process.argv.includes('--audit')){
  const result=await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const org=await tx.$queryRawUnsafe('SELECT id,name,type::text FROM "Organization" WHERE id=1');
   const bases=await tx.$queryRawUnsafe(`SELECT id,code,"entryMode","isActive" FROM "TransactionCodeBase" WHERE code IN ('BTH','PRT') ORDER BY code`);
   const prepared=(await tx.$queryRawUnsafe(`SELECT to_regclass('"ExpenseCodeLinkPolicy"') IS NOT NULL AS ready`))[0].ready;
   const policies=prepared?await tx.$queryRawUnsafe(`SELECT p."orgId",p."baseId",b.code,p.target FROM "ExpenseCodeLinkPolicy" p JOIN "TransactionCodeBase" b ON b.id=p."baseId" ORDER BY p."orgId",b.code`):[];
   return {readOnly:true,org,bases,prepared,policies,preservedTables:await tx.$queryRawUnsafe(digest())};
  },{timeout:60000});console.log(JSON.stringify(result,null,2));return;
 }
 await db.$disconnect();db=null;
 const steps=versions.map(version=>{
  const sql=fs.readFileSync(path.join(__dirname,'../backend/prisma/migrations',version,'migration.sql'),'utf8').replace(/\r\n/g,'\n');
  const checksum=createHash('sha256').update(sql).digest('hex');
  return `DO $step$ BEGIN
    IF EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(version)} AND checksum<>${literal(checksum)}) THEN RAISE EXCEPTION 'ENTITY_MIGRATION_CHECKSUM_MISMATCH'; END IF;
    IF NOT EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(version)}) THEN
      EXECUTE ${literal(sql)}; INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES(${literal(version)},${literal(checksum)});
    END IF; END $step$;`;
 }).join('\n');
 const apply=process.argv.includes('--apply');
 const transaction=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SELECT pg_advisory_xact_lock(2026102002);
  LOCK TABLE ${tables.map(table=>'"'+table+'"').join(',')} IN SHARE MODE;
  CREATE TEMP TABLE expense_link_before ON COMMIT DROP AS ${digest()};
  ${steps}
  DO $$ BEGIN IF EXISTS(SELECT 1 FROM expense_link_before b JOIN (${digest()}) a USING(name) WHERE a.count<>b.count OR a.digest<>b.digest) THEN RAISE EXCEPTION 'EXPENSE_LINK_BUSINESS_DATA_CHANGED'; END IF; END $$;
  ${apply?'COMMIT':'ROLLBACK'};`;
 const result=spawnSync(process.execPath,[require.resolve('../backend/node_modules/prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../backend/prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},input:transaction,encoding:'utf8',timeout:90000});
 if(result.status!==0)throw Error('EXPENSE_LINK_MIGRATION_FAILED');
 console.log(JSON.stringify({mode:apply?'applied':'rollback-validation',versions,preservedBusinessTables:tables.length}));
 }catch(error){console.error('Expense code link operation failed; database credentials suppressed. '+(error.code||(/^[A-Z_]+$/.test(error.message)?error.message:'')));process.exitCode=1;}finally{if(db)await db.$disconnect();}});
