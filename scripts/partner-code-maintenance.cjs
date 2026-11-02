// Operator-only maintenance. Credentials arrive on stdin and are never persisted.
// Audit is read-only; apply requires exact IDs, a reviewed revision and ADMIN identities.
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {createHash}=require('node:crypto');
const {createInterface}=require('node:readline');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const print=value=>process.stdout.write(JSON.stringify(value)+'\n');
let db;
async function snapshot(tx){
 const organizations=await tx.$queryRawUnsafe(`SELECT id,name,"nameKo","nameVi",code,type::text,"ownerOrgId","dataOwnerOrgId","businessNumber",country,
  (SELECT count(*)::int FROM "Employee" e WHERE e."orgId"=o.id) AS "employeeCount"
  FROM "Organization" o WHERE o."ownerOrgId"=1 OR EXISTS (SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=1 AND r."brandOrgId"=o.id) OR upper(name) LIKE '%DEX%' OR upper(name) LIKE '%BARO%' OR upper(name) LIKE '%URD%' OR upper(name) LIKE '%BINH MINH%' ORDER BY id`);
 const employees=await tx.$queryRawUnsafe(`SELECT e.id,e."orgId",e.name,e."employeeNo",e.status::text,e."orgRole"::text FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE upper(o.name) LIKE '%DEX%' ORDER BY e.id`);
 const codeOwners=await tx.$queryRawUnsafe(`SELECT id,name,code,"ownerOrgId","dataOwnerOrgId" FROM "Organization" WHERE upper(code) IN ('DEXL','BARO','URDK','NUBM') ORDER BY id`);
 const admins=await tx.$queryRawUnsafe(`SELECT id,"orgId",name,email,"orgRole"::text,status::text FROM "Employee" WHERE lower(email)='krsailer82@gmail.com' ORDER BY id`);
 const data={organizations,employees,codeOwners,admins};return {...data,revision:hash(data)};
}
async function run(input){
 if(input.op==='connect'){
  if(db)throw Error('CODE_ALREADY_CONNECTED');assertSafeApplicationDatabaseEnv({DATABASE_URL:input.url,DIRECT_URL:input.url});
  db=new PrismaClient({datasourceUrl:String(input.url).trim(),log:[]});await db.$connect();return {connected:true};
 }
 if(!db)throw Error('CODE_NOT_CONNECTED');
 if(input.op==='audit')return db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return snapshot(tx);},{timeout:30000});

 if(input.op==='link-company')return db.$transaction(async tx=>{
  const {companyIdentityRevision,connectPartnerCompany}=require('../backend/dist/services/companyConnections');
  const actor=await tx.employee.findFirst({where:{id:input.actorId,orgId:input.orgId,email:'krsailer82@gmail.com',orgRole:'ADMIN',status:'ACTIVE'},select:{id:true}});
  if(!actor)throw Error('CODE_ADMIN_REQUIRED');
  const select={id:true,name:true,nameKo:true,nameVi:true,code:true,country:true,businessNumber:true};
  const local=await tx.organization.findUnique({where:{id:input.entityId},select});
  const target=await tx.organization.findUnique({where:{id:input.targetOrgId},select});
  if(!local||!target||local.name!==input.expectedName||target.name!==input.expectedName||target.code!==input.expectedCode)throw Error('CODE_TARGET_CHANGED');
  const link=await connectPartnerCompany(tx,input.orgId,input.entityId,input.actorId,{targetOrgId:target.id,revision:companyIdentityRevision(target)});
  return {linked:true,link,company:target};
 },{isolationLevel:'Serializable',timeout:30000});
 if(input.op!=='apply')throw Error('CODE_INVALID_OPERATION');
 if(!Array.isArray(input.changes)||!input.changes.length||input.changes.some(row=>!Number.isSafeInteger(row.id)||!/^[A-Z0-9]{4}$/.test(row.code)))throw Error('CODE_INVALID_PLAN');
 if(new Set(input.changes.map(row=>row.id)).size!==input.changes.length||new Set(input.changes.map(row=>row.code)).size!==input.changes.length)throw Error('CODE_DUPLICATE_PLAN');
 return db.$transaction(async tx=>{
  const actor=await tx.employee.findFirst({where:{id:input.actorId,orgId:input.actorOrgId,email:'krsailer82@gmail.com',orgRole:'ADMIN',status:'ACTIVE'},select:{id:true}});
  if(!actor)throw Error('CODE_ADMIN_REQUIRED');
  const current=await snapshot(tx);if(input.revision!==current.revision)throw Error('CODE_STALE_PLAN');
  const ids=input.changes.map(row=>row.id).sort((a,b)=>a-b);
  for(const id of ids)await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',id);
  const before=[];
  for(const change of input.changes){
   const rows=await tx.$queryRawUnsafe('SELECT to_jsonb(o) AS row FROM "Organization" o WHERE id=$1',change.id);const row=rows[0]?.row;
   if(!row||row.name!==change.name||row.code!==change.expectedCode)throw Error('CODE_TARGET_CHANGED');
   if(row.id!==input.actorOrgId&&row.ownerOrgId!==input.actorOrgId&&row.dataOwnerOrgId!==input.actorOrgId)throw Error('CODE_TARGET_SCOPE_REQUIRED');
   const conflict=await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE upper(code)=upper($1) AND id<>$2',change.code,change.id);
   if(conflict.length)throw Error('CODE_CONFLICT');before.push(row);
  }
  const employeeChanges=[];
  if(input.employeePrefix){
   const {orgId,oldPrefix,newPrefix}=input.employeePrefix;
   if(!input.changes.some(row=>row.id===orgId&&row.code===newPrefix)||!/^[A-Z0-9]{4}$/.test(newPrefix))throw Error('CODE_INVALID_EMPLOYEE_PLAN');
   const admin=await tx.employee.findFirst({where:{orgId,email:'krsailer82@gmail.com',orgRole:'ADMIN',status:'ACTIVE'},select:{id:true}});if(!admin)throw Error('CODE_EMPLOYEE_ADMIN_REQUIRED');
   const company=before.find(row=>row.id===orgId);if(!company||company.code!==oldPrefix)throw Error('CODE_PREFIX_CHANGED');
   const employees=await tx.$queryRawUnsafe('SELECT id,"employeeNo" FROM "Employee" WHERE "orgId"=$1 ORDER BY id FOR UPDATE',orgId);
   for(const employee of employees){
    if(typeof employee.employeeNo!=='string'||!employee.employeeNo.startsWith(oldPrefix)||!/^\d{4}$/.test(employee.employeeNo.slice(oldPrefix.length)))throw Error('CODE_EMPLOYEE_NUMBER_REQUIRES_REVIEW');
    employeeChanges.push({id:employee.id,orgId,before:employee.employeeNo,after:newPrefix+employee.employeeNo.slice(oldPrefix.length)});
   }
   if(new Set(employeeChanges.map(row=>row.after)).size!==employeeChanges.length)throw Error('CODE_EMPLOYEE_DUPLICATE');
  }
  const key=String(input.receiptKey||'');if(!/^PARTNER_CODE_CHANGE:[A-Z0-9_-]+:2026-11-02$/.test(key))throw Error('CODE_INVALID_RECEIPT_KEY');
  if(await tx.systemSetting.findUnique({where:{key}}))throw Error('CODE_RECEIPT_EXISTS');
  for(const change of input.changes)if(change.expectedCode!==change.code)await tx.$executeRawUnsafe('UPDATE "Organization" SET code=$1 WHERE id=$2 AND code IS NOT DISTINCT FROM $3',change.code,change.id,change.expectedCode);
  for(const change of employeeChanges)await tx.$executeRawUnsafe('UPDATE "Employee" SET "employeeNo"=$1 WHERE id=$2 AND "orgId"=$3 AND "employeeNo"=$4',change.after,change.id,change.orgId,change.before);
  const receipt={actorId:actor.id,at:new Date().toISOString(),organizations:input.changes.map(row=>({id:row.id,name:row.name,before:row.expectedCode,after:row.code})),employees:employeeChanges};
  await tx.systemSetting.create({data:{key,value:receipt,updatedByEmployeeId:actor.id}});
  return {applied:true,receiptKey:key,...receipt};
 },{isolationLevel:'Serializable',timeout:30000});
}
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const lines=createInterface({input:process.stdin,terminal:false});
(async()=>{print({ready:true});for await(const line of lines){try{print(await run(JSON.parse(line)));}catch(error){print({error:/^CODE_/.test(error.message)?error.message:error.code||'DATABASE_UNAVAILABLE'});}}if(db)await db.$disconnect();})().catch(()=>{print({error:'MAINTENANCE_STOPPED'});process.exitCode=1;});
