// Explicit, bounded rollout. Default: execute the exact migration and ROLLBACK.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {PrismaClient} = require('@prisma/client');
const {assertSafeApplicationDatabaseEnv} = require('../src/config/databaseTargetGuard');
const {migrations} = require('./migrate-entity-profiles');
const version='20261108010000_style_product_ownership';
const literal=s=>`'${s.replaceAll("'","''")}'`;
// Exclude only the three NEW linkage columns. All existing content, timestamps,
// production/time data, orders, document snapshots and financial rows must match.
const protectedTables=['Style','StyleProcess','StyleProcessStandard','StyleProcessVersion','StyleProcessAtObservation','WorkRecord','OutsourcedWorkRecord','AssignmentPlan','AssignmentCard','WorkOrder','WorkOrderItem','PartnerTransactionCost','ExpenseRequest','BankLedgerEntry','Invoice'];
const fingerprint=(table,connectedEdit=false)=>`SELECT md5(COALESCE(string_agg(md5((to_jsonb(t)${table==='Style'&&!connectedEdit?"-ARRAY['productStyleId','productOwnerOrgId','appliedProductRevision']":''})::text),'' ORDER BY ${table==='StyleProductRevision'?'"productId",revision':'id'}),'')) FROM "${table}" t`;
function rolloutSql({apply=false,connectedEdit=false}={}) {
 const targetVersion=connectedEdit?'20261108020000_connected_style_product_edit':version;
 const migration=migrations().find(m=>m.version===targetVersion);
 const tables=connectedEdit?[...protectedTables,'StyleProduct','StyleProductRevision']:protectedTables;
 const before=tables.map(table=>`INSERT INTO split_style_preservation VALUES(${literal(table)},(${fingerprint(table,connectedEdit)}));`).join('\n');
 const after=tables.map(table=>`IF (${fingerprint(table,connectedEdit)}) IS DISTINCT FROM (SELECT digest FROM split_style_preservation WHERE entity=${literal(table)}) THEN RAISE EXCEPTION 'STYLE_PRODUCT_BUSINESS_PRESERVATION_FAILED'; END IF;`).join('\n');
 return `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
 SELECT pg_advisory_xact_lock(2026102002);
 LOCK TABLE ${tables.map(t=>`"${t}"`).join(',')} IN SHARE ROW EXCLUSIVE MODE;
 CREATE TEMP TABLE split_style_preservation(entity TEXT PRIMARY KEY,digest TEXT) ON COMMIT DROP;
 ${before}
 DO $step$ BEGIN
 IF EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(targetVersion)} AND checksum<>${literal(migration.checksum)}) THEN RAISE EXCEPTION 'STYLE_PRODUCT_CHECKSUM_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(targetVersion)}) THEN
 EXECUTE ${literal(migration.sql)};
 INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES(${literal(targetVersion)},${literal(migration.checksum)});
 END IF;
 END $step$;
 DO $preservation$ BEGIN ${after} END $preservation$;
 ${apply?'COMMIT':'ROLLBACK'};`;
}
async function main(){
 if(process.argv.slice(2).some(arg=>!['--apply','--dry-run','--connected-edit'].includes(arg)))throw Error('Invalid mode');
 assertSafeApplicationDatabaseEnv();
 const url=process.env.DIRECT_URL||process.env.DATABASE_URL;
 if(!url)throw Error('Application database is required');
 const apply=process.argv.includes('--apply');
 const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../prisma/schema.prisma')],{
  cwd:path.join(__dirname,'..'),env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},encoding:'utf8',stdio:'pipe',timeout:90000,input:rolloutSql({apply,connectedEdit:process.argv.includes('--connected-edit')}),
 });
 if(result.error||result.signal||result.status!==0){
  const code=String(result.stderr||result.stdout||'').match(/STYLE_PRODUCT_[A-Z_]+/)?.[0];
  console.error(JSON.stringify({ok:false,mode:apply?'apply':'dry-run',error:code||'Migration failed; transaction rolled back; credentials suppressed.'}));process.exitCode=1;return;
 }
 console.log(JSON.stringify({ok:true,mode:apply?'apply':'dry-run',businessValuesPreserved:true,rolledBack:!apply}));
 if(apply){
  const db=new PrismaClient({datasourceUrl:url});try{
   const owners=await db.$queryRawUnsafe(`SELECT "ownerOrgId",count(*)::int count FROM "StyleProduct" GROUP BY "ownerOrgId" ORDER BY "ownerOrgId"`);
   const links=await db.$queryRawUnsafe(`SELECT count(*)::int total,count(*) FILTER(WHERE s."productOwnerOrgId"=p."ownerOrgId" AND s."orgId"=p."custodianOrgId")::int verified FROM "Style" s JOIN "StyleProduct" p ON p.id=s."productStyleId"`);
   console.log(JSON.stringify({owners,links}));
  }finally{await db.$disconnect();}
 }
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({ok:false,error:String(error.message).startsWith('[database-target]')?'Application database target guard rejected connection.':'Style ownership operation failed; credentials suppressed.'}));process.exitCode=1;});
module.exports={rolloutSql,protectedTables};
