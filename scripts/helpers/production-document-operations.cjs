const receiptKey='MAINTENANCE:DOCUMENT_NUMBERS:2026-10-28:v1';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
exports.backfill=async function({db,fingerprints,apply}){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10s'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='60s'");
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(2026102002)::text');
  await tx.$executeRawUnsafe('LOCK TABLE "ExpenseRequest" IN ACCESS EXCLUSIVE MODE');
  if(await tx.systemSetting.findUnique({where:{key:receiptKey}}))return {action:'backfill-already-applied'};
  const before=await fingerprints(tx);
  const originals=await tx.expenseRequest.findMany({select:{id:true,orgId:true,managementNumber:true},orderBy:{id:'asc'}});
  const targets=originals.filter(row=>row.managementNumber===null).map(row=>({...row,number:`EXP-${String(row.id).padStart(6,'0')}`}));
  for(const row of targets)if(originals.some(other=>other.orgId===row.orgId&&other.managementNumber?.toUpperCase()===row.number))throw Error('NUMBER_COLLISION');
  const triggerSql=`SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='"ExpenseRequest"'::regclass AND NOT tgisinternal ORDER BY tgname`;
  const triggers=await tx.$queryRawUnsafe(triggerSql);
  // The exclusive lock prevents concurrent access while metadata-only repairs bypass guards.
  // Transactional DDL restores both guards and data on any error or verification rollback.
  if(targets.length){
   for(const trigger of triggers.filter(row=>row.tgenabled!=='D'))await tx.$executeRawUnsafe(`ALTER TABLE "ExpenseRequest" DISABLE TRIGGER ${quote(trigger.tgname)}`);
   await tx.$executeRawUnsafe(`UPDATE "ExpenseRequest" SET "managementNumber"='EXP-'||lpad(id::text,greatest(6,length(id::text)),'0') WHERE "managementNumber" IS NULL`);
   for(const trigger of triggers.filter(row=>row.tgenabled!=='D'))await tx.$executeRawUnsafe(`ALTER TABLE "ExpenseRequest" ENABLE ${trigger.tgenabled==='A'?'ALWAYS ':trigger.tgenabled==='R'?'REPLICA ':''}TRIGGER ${quote(trigger.tgname)}`);
  }
  const scopes=await tx.$queryRawUnsafe('SELECT "orgId" FROM "ExpenseRequest" UNION SELECT "sellerOrgId" FROM "Invoice" ORDER BY 1');
  const policiesCreated=[];
  const {defaultApprovalSettings}=require('../../backend/dist/services/expenseApproval');
  for(const scope of scopes){
   const key=`EXPENSE_APPROVAL_POLICY:${scope.orgId}`;
   if(!await tx.systemSetting.findUnique({where:{key}})){
    await tx.systemSetting.create({data:{key,value:defaultApprovalSettings(),updatedBy:'authorized-maintenance:2026-10-28'}});
    policiesCreated.push(key);
   }
  }
  const after=await fingerprints(tx);
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('BUSINESS_DATA_CHANGED');
  const actual=await tx.expenseRequest.findMany({select:{id:true,orgId:true,managementNumber:true},orderBy:{id:'asc'}});
  if(actual.length!==originals.length||actual.some((row,index)=>row.id!==originals[index].id||row.orgId!==originals[index].orgId||row.managementNumber!==(originals[index].managementNumber??`EXP-${String(row.id).padStart(6,'0')}`)))throw Error('NUMBER_VERIFY_FAILED');
  if(JSON.stringify(triggers)!==JSON.stringify(await tx.$queryRawUnsafe(triggerSql)))throw Error('TRIGGER_VERIFY_FAILED');
  await tx.systemSetting.create({data:{key:receiptKey,value:{at:new Date().toISOString(),reason:'Persist existing effective expense references and authorized currency limits; preserve issued documents and business history',numbers:targets.map(({id,orgId,number})=>({id,orgId,number})),policiesCreated,before,after,triggers},updatedBy:'authorized-maintenance:2026-10-28'}});
  const result={action:apply?'backfill-applied':'backfill-rollback-verified',expenseNumbersFilled:targets.length,approvalPoliciesCreated:policiesCreated.length,preservedTables:before.length,triggerStatesPreserved:true,receiptKey};
  if(!apply){const error=Error('ROLLBACK_VERIFIED');error.result=result;throw error;}
  return result;
 },{timeout:90000,isolationLevel:'Serializable'}).catch(error=>{if(error.result)return error.result;throw error;});
};
