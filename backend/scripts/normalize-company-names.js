// Explicitly requested company/partner master-name correction. Never touches employees or documents.
const path=require('node:path');
const fs=require('node:fs');
const env={...process.env,...require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../.env')))};
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {migrations,runEntityProfileMigrations}=require('./migrate-entity-profiles');
async function main(){
 assertSafeApplicationDatabaseEnv(env);
 const url=String(env.DIRECT_URL||env.DATABASE_URL||'').trim();
 if(!url)throw Error('Database connection unavailable');
 if(!/(?:^|\.)(?:railway\.app|railway\.internal|rlwy\.net)$/.test(new URL(url).hostname))throw Error('Railway target required');
 const db=new(require('@prisma/client').PrismaClient)({datasourceUrl:url});
 try{
  const receipts=await db.$queryRawUnsafe('SELECT version,checksum FROM "EntitySchemaMigration"');
  const all=migrations(),current=all.at(-1);
  if(current.version!=='20261110040000_uppercase_company_names')throw Error('Explicit migration selection required');
  if(all.slice(0,-1).some(m=>!receipts.some(r=>r.version===m.version&&r.checksum===m.checksum)))throw Error('Earlier migrations must be deployed and verified first');
  if(receipts.some(r=>r.version===current.version&&r.checksum!==current.checksum))throw Error('Migration checksum mismatch');
  const inspect=()=>db.$queryRawUnsafe(`SELECT 'Organization' AS source,count(*)::int AS remaining FROM "Organization" WHERE name IS DISTINCT FROM upper(name) OR "nameKo" IS DISTINCT FROM upper("nameKo") OR "nameVi" IS DISTINCT FROM upper("nameVi") UNION ALL SELECT 'CompanyIdentity',count(*)::int FROM "CompanyIdentity" WHERE name IS DISTINCT FROM upper(name) OR "nameKo" IS DISTINCT FROM upper("nameKo") OR "nameVi" IS DISTINCT FROM upper("nameVi")`);
  console.log(JSON.stringify({stage:'before',counts:await inspect()}));
  if(process.argv.includes('--apply')){
   await runEntityProfileMigrations({db,env});
   const counts=await inspect();
   if(counts.some(row=>row.remaining!==0))throw Error('Post-application name verification failed');
   const missing=await require('./railway-schema-preflight').missingSchema(db);
   if(missing.length)throw Error('Post-application schema verification failed');
   for(const [version,name] of [['20261103190000_common_company_identity','baro_company_identity_anchor_guard'],['20261104150000_service_partner_data_owner','baro_company_partner_data_owner']]){
    const sql=all.find(m=>m.version===version).sql;
    const expected=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION '+name)).match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
    const actual=await db.$queryRawUnsafe('SELECT prosrc FROM pg_proc WHERE pronamespace=\'public\'::regnamespace AND proname=$1',name);
    if(!expected||actual.length!==1||actual[0].prosrc!==expected)throw Error('Post-application guard verification failed');
   }
   const audit=await db.$queryRawUnsafe('SELECT count(*)::int AS originals FROM "CompanyNameCaseAudit"');
   console.log(JSON.stringify({stage:'verified',counts,audit}));
  }
 }finally{await db.$disconnect();}
}
main().catch(error=>{console.error('[company-names] '+(['Earlier migrations must be deployed and verified first','Explicit migration selection required','Migration checksum mismatch','Post-application name verification failed'].includes(error.message)?error.message:'Connection or execution failed; database details suppressed.'));process.exitCode=1;});
