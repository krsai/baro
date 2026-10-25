// The supplied application DB is read from stdin; no auth database env is loaded.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const version='20261025100000_localized_name_primary_english';
const preserved=['PartnerTransactionCost','ExpenseRequest','ExpenseRequestAudit','OutsourcedWorkRecord','WorkLog','WorkRecord','WorkOrder','WorkOrderItem','AssignmentPlan','Style','StyleProcess','SalarySystemVersion','PayrollSnapshot','Invoice','InvoiceLine'];
const masters=['ProcessMasterOption','Organization','Factory','Warehouse','EmployeeGrade','SalaryItem','AttrColor','AttrCategory','AttrProcess','PriorCompletionReason','OutsourcingServiceType','TransactionCode','SettingServiceDefault','PartnerRole','SettingTransactionCodeDefault','TransactionCodeBase','ExpenseType','TaxTreatment'];
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const digest=()=>[...preserved,...masters].map(table=>`SELECT '${table}' AS name,count(*)::int AS count,md5(coalesce(string_agg(${masters.includes(table)?"(to_jsonb(t)-'name'-'nameEn'-'label')":"to_jsonb(t)"}::text,'' ORDER BY id::text),'')) AS digest FROM "${table}" t`).join(' UNION ALL ');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);
process.stdin.on('end',()=>{try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;
 assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
 const sql=fs.readFileSync(path.join(__dirname,'../backend/prisma/migrations',version,'migration.sql'),'utf8').replace(/\r\n/g,'\n');
 const checksum=createHash('sha256').update(sql).digest('hex'),apply=process.argv.includes('--apply');
 const transaction=`BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s';
 SELECT pg_advisory_xact_lock(2026102002);
 LOCK TABLE ${preserved.map(t=>'"'+t+'"').join(',')} IN SHARE MODE;
 CREATE TEMP TABLE names_before ON COMMIT DROP AS ${digest()};
 DO $step$ BEGIN
 IF EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(version)} AND checksum<>${literal(checksum)}) THEN RAISE EXCEPTION 'ENTITY_MIGRATION_CHECKSUM_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(version)}) THEN
 EXECUTE ${literal(sql)};
 INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES(${literal(version)},${literal(checksum)});
 END IF; END $step$;
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM names_before b JOIN (${digest()}) a USING(name) WHERE a.count<>b.count OR a.digest<>b.digest) THEN RAISE EXCEPTION 'LOCALIZED_NAME_BUSINESS_DATA_CHANGED'; END IF; END $$;
 ${apply?'COMMIT':'ROLLBACK'};`;
 const result=spawnSync(process.execPath,[require.resolve('../backend/node_modules/prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../backend/prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},input:transaction,encoding:'utf8',timeout:90000});
 if(result.status!==0){console.error('LOCALIZED_NAME_MIGRATION_FAILED; credentials suppressed.');process.exitCode=1;return;}
 console.log(JSON.stringify({mode:apply?'applied':'rollback-validation',version,preservedBusinessTables:preserved.length,preservedMasterNonNameColumns:masters.length}));
}catch(e){console.error('LOCALIZED_NAME_MIGRATION_FAILED '+(e.code||''));process.exitCode=1;}});
