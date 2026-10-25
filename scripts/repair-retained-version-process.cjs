// Restore one deleted historical FK from unanimous issued snapshot evidence.
// No name/code matching, version rewrites, assignment changes, or active processes.
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const key='migration:20261025:retained-version-process:1434';
const tables=['StyleProcessVersion','AssignmentPlan','WorkRecord','OutsourcedWorkRecord','WorkOrder','SalarySystemVersion','FactoryProductionAllowanceRate','PayrollSnapshot'];
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);
process.stdin.on('end',async()=>{let db;let report;try{
 const {DATABASE_PUBLIC_URL:url}=JSON.parse(input);
 assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});db=new PrismaClient({datasourceUrl:url});
 const apply=process.argv.includes('--apply');
 await db.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT id FROM "Style" WHERE id=43 FOR NO KEY UPDATE');
  const previous=await tx.systemSetting.findUnique({where:{key}});
  if(previous){report={alreadyApplied:true};return;}
  const versions=await tx.styleProcessVersion.findMany({where:{id:{in:[2,6,19]},styleId:43},orderBy:{id:'asc'}});
  if(versions.length!==3 || new Set(versions.map(v=>v.orgId)).size!==1)throw Error('EVIDENCE_SCOPE_MISMATCH');
  const evidence=versions.map(v=>({versionId:v.id,orgId:v.orgId,styleId:v.styleId,process:v.processSnapshot.find(p=>p.styleProcessId===1434&&p.id===1434)}));
  if(evidence.some(e=>!e.process))throw Error('MISSING_ORIGINAL_FK');
  const fields=p=>({processCode:p.storageCode,processName:p.name,productionStage:p.productionStage,genderScope:p.genderScope||'UNISEX',ptSeconds:p.pt,timesPerPiece:p.timesPerPiece,processDescription:p.description||null});
  if(new Set(evidence.map(e=>JSON.stringify(fields(e.process)))).size!==1)throw Error('CONFLICTING_SNAPSHOT_EVIDENCE');
  const data={id:1434,orgId:versions[0].orgId,styleId:43,...fields(evidence[0].process),isActive:false,createdBy:key};
  if(await tx.styleProcess.findUnique({where:{id:1434}}))throw Error('ORIGINAL_ID_ALREADY_EXISTS');
  if(await tx.styleProcess.findFirst({where:{orgId:data.orgId,styleId:43,processCode:data.processCode,sourceOrgId:0}}))throw Error('ORIGINAL_CODE_COLLISION');
  // Fail closed if any protected table cannot be included in the digest.
  const digest=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>{
   const [summary]=await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS digest FROM "${table}" t`);
   return [table,summary];
  })));
  const before=await digest();
  const restored=await tx.styleProcess.create({data});
  const after=await digest();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('PROTECTED_DATA_CHANGED');
  await tx.systemSetting.create({data:{key,updatedBy:key,value:{reason:'Restore exact deleted FK 1434 referenced by issued versions 2,6,19 as inactive historical process. Original creation metadata is unknown; this row records the recovery operation.',before:null,after:JSON.parse(JSON.stringify(restored)),evidence,protectedTables:before}}});
  report={applied:apply,rollbackVerified:!apply,restoredProcessId:1434,retainedVersionIds:versions.map(v=>v.id),protectedTablesUnchanged:true};
  if(!apply)throw Error('ROLLBACK_VERIFIED');
 },{timeout:60000});
 console.log(JSON.stringify(report));
}catch(e){if(e.message==='ROLLBACK_VERIFIED')console.log(JSON.stringify(report));else{console.error('VERSION_PROCESS_REPAIR_FAILED '+(e.code||e.message));process.exitCode=1;}}finally{if(db)await db.$disconnect();}});
