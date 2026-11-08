// Explicit additive rollout. Default runs the exact migration then rolls back.
const path=require('node:path');
const {spawnSync}=require('node:child_process');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {PrismaClient}=require('@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {migrations}=require('./migrate-entity-profiles');
const version='20261108030000_shipping_request_jobs';
const tables=['FreightJob','FreightBill','FreightMaster','FreightDispatch','FreightPackage','FreightDocument','FreightAudit','TransportExchange','TransportExchangeEvent','Style','WorkOrder','ExpenseRequest','PartnerTransactionCost','BankLedgerEntry','Invoice'];
const literal=v=>`'${v.replaceAll("'","''")}'`;
const fingerprint=table=>`SELECT md5(COALESCE(string_agg(md5((to_jsonb(t)${table==='FreightJob'?"-ARRAY['receiptStatus','requesterOrgId','requestCreatedByOrgId','requestCreatedByEmployeeId','requestSnapshot','sharedSnapshot']":''})::text),'' ORDER BY id),'')) FROM "${table}" t`;
async function main(){
 if(process.argv.slice(2).some(flag=>!['--apply','--dry-run','--verify'].includes(flag)))throw Error('Invalid flags');
 assertSafeApplicationDatabaseEnv();const url=process.env.DIRECT_URL||process.env.DATABASE_URL;if(!url)throw Error('Missing target');
 const db=new PrismaClient({datasourceUrl:url});
 try{
  if(!process.argv.includes('--verify')){
   const m=migrations().find(row=>row.version===version),apply=process.argv.includes('--apply');
   const sql=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SELECT pg_advisory_xact_lock(2026102002);
    LOCK TABLE ${tables.map(t=>`"${t}"`).join(',')} IN SHARE ROW EXCLUSIVE MODE;
    CREATE TEMP TABLE shipping_preservation(entity TEXT PRIMARY KEY,digest TEXT) ON COMMIT DROP;
    ${tables.map(t=>`INSERT INTO shipping_preservation VALUES(${literal(t)},(${fingerprint(t)}));`).join('\n')}
    DO $step$ BEGIN
    IF EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(version)} AND checksum<>${literal(m.checksum)}) THEN RAISE EXCEPTION 'SHIPPING_CHECKSUM_MISMATCH'; END IF;
    IF NOT EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(version)}) THEN EXECUTE ${literal(m.sql)};INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES(${literal(version)},${literal(m.checksum)});END IF;
    ${tables.map(t=>`IF (${fingerprint(t)}) IS DISTINCT FROM (SELECT digest FROM shipping_preservation WHERE entity=${literal(t)}) THEN RAISE EXCEPTION 'SHIPPING_PRESERVATION_FAILED'; END IF;`).join('\n')}
    END $step$;${apply?'COMMIT':'ROLLBACK'};`;
   const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../prisma/schema.prisma')],{env:{...process.env,DIRECT_URL:url,DATABASE_URL:url},encoding:'utf8',stdio:'pipe',input:sql,timeout:90000});
   if(result.error||result.signal||result.status!==0){const code=String(result.stderr||result.stdout).match(/SHIPPING_[A-Z_]+/)?.[0];throw Object.assign(Error('Migration rolled back'),{safeCode:code});}
   console.log(JSON.stringify({ok:true,mode:apply?'apply':'dry-run',protectedTables:tables.length,businessValuesPreserved:true,rolledBack:!apply}));
   if(!apply)return;
  }
  await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const jobs=await tx.$queryRawUnsafe('SELECT "orgId","receiptStatus",count(*)::int count FROM "FreightJob" GROUP BY "orgId","receiptStatus"');
   const legacy=await tx.$queryRawUnsafe('SELECT status,count(*)::int count FROM "TransportExchange" GROUP BY status');
   const check=require('../dist/services/shippingRequests').listShippingRequests;
   const members=await tx.$queryRawUnsafe(`SELECT DISTINCT ON(e."orgId") e.id,e."orgId" FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE e.status::text='ACTIVE' AND e."orgRole"::text='ADMIN' AND o."isActive" AND o."ownerOrgId" IS NULL AND (o."dataOwnerOrgId" IS NULL OR o."dataOwnerOrgId"=o.id) AND o.type::text IN('MANUFACTURER','SERVICE') ORDER BY e."orgId",e.id LIMIT 10`);
   let verified=0;for(const member of members){await check(tx,member.orgId,member.id);verified++;}
   console.log(JSON.stringify({ok:true,readOnly:true,jobs,legacy,prismaCompanyQueries:verified}));
  },{timeout:30000});
 }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.safeCode||error.code||'SHIPPING_ROLLOUT_FAILED',databaseCode:error.meta?.code}));process.exitCode=1;});
