// Explicitly authorized, narrowly scoped cleanup; default mode is read-only.
const {createHash}=require('node:crypto');
const RECEIPT='LEGACY_CUSTOMER_TYPE_CLEANUP:BARO_URIDEUL:2026-11-02';
async function cleanup(db,{apply=false,revision}={}){
 return db.$transaction(async tx=>{
  if(!apply)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  else{
   await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=3 FOR UPDATE');
   await tx.$queryRawUnsafe('SELECT id FROM "OrgRelationship" WHERE id=2 FOR UPDATE');
  }
  const relationship=await tx.orgRelationship.findUnique({where:{id:2},select:{id:true,manufacturerOrgId:true,brandOrgId:true,systemIndustryId:true}});
  const classification=await tx.partnerClassification.findUnique({where:{orgId_entityId:{orgId:1,entityId:3}},select:{revision:true,industries:{select:{systemIndustryId:true}}}});
  const types=await tx.settingServiceDefault.findMany({where:{id:{in:[94,96]}},select:{id:true,code:true}});
  if(relationship?.manufacturerOrgId!==1||relationship?.brandOrgId!==3||types.find(r=>r.id===94)?.code!=='WOVEN'||types.find(r=>r.id===96)?.code!=='MIXED'||classification?.industries.length!==1||classification.industries[0].systemIndustryId!==94)throw Error('CLEANUP_TARGET_CHANGED');
  if(relationship.systemIndustryId!==96&&relationship.systemIndustryId!==null)throw Error('CLEANUP_TARGET_CHANGED');
  const previousReceipt=await tx.systemSetting.findUnique({where:{key:RECEIPT}});
  if(relationship.systemIndustryId===null)return {mode:apply?'APPLY':'READ_ONLY',alreadyClean:true,receiptRecorded:!!previousReceipt};
  const before={relationship,classification};
  const expected=createHash('sha256').update(JSON.stringify(before)).digest('hex');
  if(!apply)return {mode:'READ_ONLY',revision:expected,before,change:{systemIndustryId:null}};
  if(revision!==expected)throw Error('CLEANUP_REVISION_CHANGED');
  if(previousReceipt)throw Error('CLEANUP_RECEIPT_CONFLICT');
  const changed=await tx.orgRelationship.updateMany({where:{id:2,manufacturerOrgId:1,brandOrgId:3,systemIndustryId:96},data:{systemIndustryId:null}});
  if(changed.count!==1)throw Error('CLEANUP_TARGET_CHANGED');
  const after=await tx.orgRelationship.findUnique({where:{id:2},select:{id:true,manufacturerOrgId:true,brandOrgId:true,systemIndustryId:true}});
  await tx.systemSetting.create({data:{key:RECEIPT,value:{before,after,revision:expected,reason:'User explicitly authorized removal of obsolete customer type reference after moving URIDEUL to WOVEN.'}}});
  return {mode:'APPLY',before,after,receipt:RECEIPT};
 },{isolationLevel:'Serializable',timeout:20000});
}
module.exports={cleanup};
if(require.main===module){
 require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});
 require('../src/config/databaseTargetGuard').assertSafeApplicationDatabaseEnv(process.env);
 const db=new (require('@prisma/client').PrismaClient)();
 cleanup(db,{apply:process.argv.includes('--apply'),revision:process.argv.find(v=>v.startsWith('--revision='))?.slice(11)}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message?.startsWith('CLEANUP_')?error.message:'Cleanup unavailable; transaction did not complete.');process.exitCode=1;}).finally(()=>db.$disconnect());
}
