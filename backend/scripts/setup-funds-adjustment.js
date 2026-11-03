// Explicitly authorized catalogue addition and classification of existing balancing rows.
const {createHash}=require('node:crypto');
async function inspect(tx){
 const industries=await tx.settingServiceDefault.findMany({where:{OR:[{code:'FUNDS'},{nameEn:{contains:'fund',mode:'insensitive'}}]},select:{id:true,code:true,nameEn:true,expenseTypeId:true}});
 const types=await tx.expenseType.findMany({where:{OR:[{code:'FUNDS'},{nameEn:{contains:'fund',mode:'insensitive'}}]},select:{id:true,code:true,nameEn:true}});
 const bases=await tx.transactionCodeBase.findMany({where:{OR:[{code:'FAD'},{serviceTypeId:{in:industries.map(row=>row.id)}}]},select:{id:true,code:true,serviceTypeId:true,nameEn:true}});
 const entries=await tx.bankLedgerEntry.findMany({where:{evidenceType:'ADJUSTMENT',purpose:{equals:'balancing',mode:'insensitive'},createdBy:'krsailer82@gmail.com'},orderBy:{id:'asc'},select:{id:true,orgId:true,accountingCodeId:true,amount:true,direction:true,transactionDate:true,purpose:true,createdBy:true,voidedAt:true}});
 const organizations=await tx.organization.findMany({where:{id:{in:[...new Set(entries.map(row=>row.orgId))]}},select:{id:true,code:true,name:true,dataOwnerOrgId:true}});
 return {industries,types,bases,entries:entries.map(row=>({...row,amount:row.amount.toString()})),organizations};
}
const RECEIPT='FUNDS_ADJUSTMENT_CODE:2026-11-03';
function classificationGuard(original,targets){
 if(!original.includes("IF TG_OP='UPDATE' THEN")||!original.includes('LEDGER_ENTRY_IMMUTABLE')||!targets.length)throw Error('ADJUSTMENT_SETUP_GUARD_CHANGED');
 if(targets.some(row=>!Number.isSafeInteger(row.codeId)||row.codeId<=0||![1,1845].includes(row.orgId)||!/^[0-9a-f-]{36}$/i.test(row.id)))throw Error('ADJUSTMENT_SETUP_TARGET_CHANGED');
 const allowed=targets.map(row=>`(OLD.id='${row.id}' AND OLD."orgId"=${row.orgId} AND NEW."accountingCodeId"=${row.codeId})`).join(' OR ');
 const exception=`IF TG_OP='UPDATE' AND OLD."accountingCodeId" IS NULL AND OLD."voidedAt" IS NULL AND OLD."evidenceType"='ADJUSTMENT' AND OLD.purpose='balancing' AND OLD."createdBy"='krsailer82@gmail.com' AND (to_jsonb(NEW)-'accountingCodeId')=(to_jsonb(OLD)-'accountingCodeId') AND (${allowed}) THEN RETURN NEW; END IF;\n IF TG_OP='UPDATE' THEN`;
 return original.replace("IF TG_OP='UPDATE' THEN",exception);
}
async function setup(db,{apply=false,revision}={}){
 return db.$transaction(async tx=>{
  if(!apply)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  else await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id IN (1,1845) ORDER BY id FOR UPDATE');
  const receipt=await tx.systemSetting.findUnique({where:{key:RECEIPT}});
  if(receipt){
   const current=await inspect(tx),expected=receipt.value.after.entries;
   const base=await tx.transactionCodeBase.findUnique({where:{id:receipt.value.baseId},include:{industryLinks:true}});
   if(base?.code!=='FAD'||base.nameKo!=='자금 조정'||base.nameEn!=='Funds adjustment'||base.nameVi!=='Điều chỉnh số dư'||!base.industryLinks.some(row=>row.systemIndustryId===98))throw Error('ADJUSTMENT_SETUP_CATALOGUE_CHANGED');
   const mismatches=expected.flatMap(saved=>{const row=current.entries.find(row=>row.id===saved.id);return !row?[{id:saved.id,missing:true}]:Object.keys(saved).filter(key=>key==='amount'?String(row[key])!==String(saved[key]):JSON.stringify(row[key])!==JSON.stringify(saved[key])).map(key=>({id:saved.id,key}));});
   if(mismatches.length)throw Error('ADJUSTMENT_SETUP_VERIFICATION_FAILED '+JSON.stringify(mismatches));
   const definition=(await tx.$queryRawUnsafe(`SELECT pg_get_functiondef('baro_ledger_evidence_entry_guard()'::regprocedure) AS definition`))[0].definition;
   if(definition.includes("to_jsonb(NEW)-'accountingCodeId'"))throw Error('ADJUSTMENT_SETUP_GUARD_NOT_RESTORED');
   return {mode:apply?'APPLY':'READ_ONLY',alreadyApplied:true,verified:expected.length,remainingUnclassified:current.entries.filter(row=>row.accountingCodeId===null).length,codes:receipt.value.codes,originalGuardRestored:true,receipt:RECEIPT};
  }
  const before=await inspect(tx),expected=createHash('sha256').update(JSON.stringify(before)).digest('hex');
  if(!apply)return {...before,revision:expected};
  if(revision!==expected)throw Error('ADJUSTMENT_SETUP_REVISION_CHANGED');
  if(before.industries.length!==1||before.industries[0].id!==98||before.bases.some(row=>row.code==='FAD')||before.entries.length<4||before.entries.some(row=>![1,1845].includes(row.orgId)||row.accountingCodeId!==null||row.voidedAt)||before.organizations.some(row=>![1,1845].includes(row.id)||!['BARO','DEXL'].includes(row.code)||row.dataOwnerOrgId!==null&&row.dataOwnerOrgId!==row.id))throw Error('ADJUSTMENT_SETUP_TARGET_CHANGED');
  const {saveCodeBase}=require('../dist/services/codeBaseManagement');
  const {provisionSettingDefaults}=require('../dist/services/transactionSettingRoutes');
  const base=await saveCodeBase(tx,{code:'FAD',nameKo:'자금 조정',nameEn:'Funds adjustment',nameVi:'Điều chỉnh số dư',industryIds:[98],entryMode:'GENERAL',orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:[],isActive:true});
  const codes=[];let updated=0;
  for(const org of before.organizations){
   await provisionSettingDefaults(tx,org.id,true);
   const code=await tx.transactionCode.findFirst({where:{ownerOrgId:org.id,baseId:base.id,code:'FADE',isActive:true}});
   if(!code)throw Error('ADJUSTMENT_SETUP_CODE_MISSING');codes.push({orgId:org.id,id:code.id,code:code.code});
  }
  // Serialize ledger writers, allow only these exact null -> classification changes,
  // and restore the original function before committing. All other fields remain immutable.
  await tx.$executeRawUnsafe('LOCK TABLE "BankLedgerEntry" IN SHARE ROW EXCLUSIVE MODE');
  const definitions=await tx.$queryRawUnsafe(`SELECT pg_get_functiondef('baro_ledger_evidence_entry_guard()'::regprocedure) AS definition`);
  const original=definitions[0]?.definition;
  await tx.$executeRawUnsafe(classificationGuard(original||'',before.entries.map(row=>({id:row.id,orgId:row.orgId,codeId:codes.find(code=>code.orgId===row.orgId).id}))));
  for(const org of before.organizations){
   const code=codes.find(code=>code.orgId===org.id),target=before.entries.filter(row=>row.orgId===org.id);
   const changed=await tx.bankLedgerEntry.updateMany({where:{id:{in:target.map(row=>row.id)},orgId:org.id,accountingCodeId:null,evidenceType:'ADJUSTMENT',purpose:'balancing',createdBy:'krsailer82@gmail.com',voidedAt:null},data:{accountingCodeId:code.id}});
   if(changed.count!==target.length)throw Error('ADJUSTMENT_SETUP_TARGET_CHANGED');updated+=changed.count;
  }
  await tx.$executeRawUnsafe(original);
  const after=await inspect(tx);
  if(JSON.stringify(before.entries.map(({accountingCodeId,...row})=>row))!==JSON.stringify(after.entries.map(({accountingCodeId,...row})=>row)))throw Error('ADJUSTMENT_SETUP_FINANCIAL_DATA_CHANGED');
  await tx.systemSetting.create({data:{key:RECEIPT,value:{before,after,revision:expected,baseId:base.id,codes}}});
  return {mode:'APPLY',updated,baseId:base.id,codes,receipt:RECEIPT};
 },{isolationLevel:'Serializable',timeout:60000});
}
module.exports={inspect,setup,classificationGuard};
if(require.main===module){
 const db=new(require('@prisma/client').PrismaClient)();
 setup(db,{apply:process.argv.includes('--apply'),revision:process.argv.find(value=>value.startsWith('--revision='))?.slice(11)}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{const detail=String(error.message||'').replaceAll(process.env.DIRECT_URL||'__none__','[redacted]').replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]');console.error('Adjustment setup unavailable; no changes applied.',error.code||error.name,detail.slice(-600));process.exitCode=1;}).finally(()=>db.$disconnect());
}
