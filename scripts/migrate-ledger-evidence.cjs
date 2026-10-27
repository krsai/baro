// Stdin-only credentials; preserves all old financial rows and account columns.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const version=process.argv.includes('--delete-guard')?'20261027210100_ledger_evidence_delete':'20261027210000_ledger_evidence';
const tables=['OrganizationBankAccount','BankLedgerAccount','BankLedgerEntry','Invoice','PartnerTransactionCost','ExpenseRequest'];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const digest=()=>tables.map(table=>`SELECT '${table}' AS name,count(*)::int AS count,md5(coalesce(string_agg((to_jsonb(t)${table==='BankLedgerEntry'?"-'evidenceType'-'bankFee'":''})::text,'' ORDER BY id::text),'')) AS digest FROM "${table}" t`).join(' UNION ALL ');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
 const sql=fs.readFileSync(path.join(__dirname,'../backend/prisma/migrations',version,'migration.sql'),'utf8').replace(/\r\n/g,'\n'),checksum=createHash('sha256').update(sql).digest('hex'),apply=process.argv.includes('--apply');
 const transaction=`BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s';
 SELECT pg_advisory_xact_lock(2026102002);
 LOCK TABLE ${tables.map(t=>'"'+t+'"').join(',')} IN SHARE MODE;
 CREATE TEMP TABLE accounts_before ON COMMIT DROP AS ${digest()};
 DO $step$ BEGIN
 IF EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${quote(version)} AND checksum<>${quote(checksum)}) THEN RAISE EXCEPTION 'CHECKSUM_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${quote(version)}) THEN
 EXECUTE ${quote(sql)};INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES(${quote(version)},${quote(checksum)});END IF;END $step$;
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM accounts_before b JOIN (${digest()}) a USING(name) WHERE a.count<>b.count OR a.digest<>b.digest) THEN RAISE EXCEPTION 'BUSINESS_DATA_CHANGED'; END IF;END $$;
 ${apply?'COMMIT':'ROLLBACK'};`;
 const result=spawnSync(process.execPath,[require.resolve('../backend/node_modules/prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../backend/prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},input:transaction,encoding:'utf8',timeout:90000});
 if(result.status!==0){console.error('BUSINESS_ACCOUNT_MIGRATION_FAILED; credentials suppressed.');process.exitCode=1;return;}
 console.log(JSON.stringify({version,mode:apply?'applied':'rollback-verified',preservedTables:tables.length}));
}catch(error){console.error('BUSINESS_ACCOUNT_MIGRATION_FAILED '+(error.code||''));process.exitCode=1;}});
