// Dedicated versioned migration; credentials arrive through Railway stdin.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',async()=>{let db;try{
 const variables=JSON.parse(input),url=variables.DATABASE_PUBLIC_URL;
 if(!url)throw Error('Railway public business database URL unavailable');
 assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
 const version='20261022200000_partner_industry_canonical',sql=fs.readFileSync(path.join(__dirname,'../backend/prisma/migrations',version,'migration.sql'),'utf8').replace(/\r\n/g,'\n');
 const checksum=createHash('sha256').update(sql).digest('hex'),apply=process.argv.includes('--apply');
 const transaction=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SELECT pg_advisory_xact_lock(2026102002);
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version='${version}' AND checksum<>'${checksum}') THEN RAISE EXCEPTION 'ENTITY_MIGRATION_CHECKSUM_MISMATCH'; END IF; END $$;
 ${sql}
 INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES('${version}','${checksum}') ON CONFLICT DO NOTHING;
 ${apply?'COMMIT':'ROLLBACK'};`;
 const result=spawnSync(process.execPath,[require.resolve('../backend/node_modules/prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../backend/prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},input:transaction,encoding:'utf8',timeout:90000});
 if(result.status!==0){console.error('Partner industry migration rolled back. '+String(result.stderr||'').replaceAll(url,'[database]').slice(0,1800));process.exitCode=1;return;}
 console.log(JSON.stringify({mode:apply?'applied':'rollback-validation',version,preservedBusinessTables:10}));
 if(apply){db=new PrismaClient({datasourceUrl:url});console.log(JSON.stringify(await db.$queryRawUnsafe(`SELECT version,mappings FROM "PartnerIndustryMigrationAudit" WHERE version='20261022200000'`)));}
}catch(error){console.error('Partner industry migration failed; credentials suppressed. '+(error.code||''));process.exitCode=1;}finally{if(db)await db.$disconnect();}});
