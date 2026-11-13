// Explicit maintenance command only; never called by app startup or migration.
const {createHash,randomUUID}=require('node:crypto');
const manifest=require('../data/shipping-ports-container-scope.json');
const scopeHash=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
async function pruneShippingPorts(db,{actorId,apply=false,expectedHash,scope=manifest}={}){
 const codes=scope.ports.map(p=>p.code);
 if(!codes.length||new Set(codes).size!==codes.length||scope.ports.some(p=>!['KR','JP','CN','VN'].includes(p.country)||!p.code.startsWith(p.country)))throw Error('PORT_SCOPE_INVALID');
 if(apply&&expectedHash!==createHash('sha256').update(JSON.stringify(scope)).digest('hex'))throw Error('PORT_SCOPE_HASH_REQUIRED');
 return db.$transaction(async tx=>{
  if(!apply)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const admin=await tx.systemUser.findUnique({where:{id:actorId},select:{id:true,systemRole:true}});
  if(admin?.systemRole!=='SYSTEM_ADMIN')throw Error('SYSTEM_ADMIN_REQUIRED');
  const kept=await tx.$queryRawUnsafe('SELECT code,country FROM "ShippingPort" WHERE code=ANY($1::text[])',codes);
  if(kept.length!==codes.length)throw Error('PORT_SCOPE_MISSING_CODE');
  const before=await tx.$queryRawUnsafe(`SELECT p.*,EXISTS(SELECT 1 FROM "FreightJob" j WHERE j."originPortCode"=p.code OR j."destinationPortCode"=p.code) AS "inUse" FROM "ShippingPort" p WHERE NOT(code=ANY($1::text[])) AND "deletedAt" IS NULL ORDER BY code${apply?' FOR UPDATE OF p':''}`,codes);
  const targets=before.filter(p=>!p.inUse),protectedCodes=before.filter(p=>p.inUse).map(p=>p.code);
  const result={keep:kept.length,delete:targets.length,protectedCodes,retainedByCountry:Object.fromEntries(['KR','JP','CN','VN'].map(c=>[c,kept.filter(p=>p.country===c).length]))};
  if(!apply||!targets.length)return {...result,applied:apply};
  const runId=randomUUID(),targetCodes=targets.map(p=>p.code);
  const after=await tx.$queryRawUnsafe('UPDATE "ShippingPort" SET "isActive"=false,"deletedAt"=CURRENT_TIMESTAMP,version=version+1,"updatedBySystemUserId"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE code=ANY($1::text[]) RETURNING *',targetCodes,admin.id);
  if(after.length!==targets.length)throw Error('PORT_PRUNE_COUNT_MISMATCH');
  const originals=new Map(targets.map(({inUse,...p})=>[p.code,p]));
  for(let i=0;i<after.length;i+=300){
   const receipts=after.slice(i,i+300).map(p=>({clientKey:'prune-'+runId+'-'+p.code,requestHash:createHash('sha256').update(JSON.stringify({scope:expectedHash,code:p.code,version:p.version-1})).digest('hex'),code:p.code,version:p.version,actorId:admin.id,action:'DELETE',before:originals.get(p.code),after:p}));
   await tx.$executeRawUnsafe('INSERT INTO "ShippingPortChange"("clientKey","requestHash",code,version,"actorId",action,"before","after") SELECT "clientKey","requestHash",code,version,"actorId",action,"before","after" FROM jsonb_to_recordset($1::jsonb) AS r("clientKey" text,"requestHash" text,code text,version int,"actorId" int,action text,"before" jsonb,"after" jsonb)',JSON.stringify(receipts));
  }
  return {...result,applied:true,runId};
 },{isolationLevel:'Serializable',timeout:180000,maxWait:15000});
}
async function main(){
 require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});
 require('../src/config/databaseTargetGuard').assertSafeApplicationDatabaseEnv(process.env);
 const url=process.env.DIRECT_URL||process.env.DATABASE_URL;
 if(!url||!/railway|rlwy\.net/i.test(new URL(url).hostname))throw Error('RAILWAY_TARGET_REQUIRED');
 const db=new(require('@prisma/client').PrismaClient)({datasourceUrl:url});
 try{
  if((await require('./railway-schema-preflight').missingSchema(db)).length)throw Error('SCHEMA_PREFLIGHT_REQUIRED');
  const admins=await db.systemUser.findMany({where:{systemRole:'SYSTEM_ADMIN'},select:{id:true}});
  if(admins.length!==1)throw Error('UNIQUE_SYSTEM_ADMIN_REQUIRED');
  console.log(JSON.stringify({scopeHash,...await pruneShippingPorts(db,{actorId:admins[0].id,apply:process.argv.includes('--apply'),expectedHash:process.argv.find(a=>a.startsWith('--scope-hash='))?.slice(13)})}));
 }finally{await db.$disconnect();}
}
if(require.main===module)main().catch(e=>{console.error('Port maintenance failed; transaction rolled back. '+(/^[A-Z_]+$/.test(e.message)?e.message:'Database details suppressed.'));process.exitCode=1;});
module.exports={pruneShippingPorts,scopeHash};
