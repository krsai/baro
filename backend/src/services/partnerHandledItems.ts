import {createHttpError} from '../utils/http';
import {classificationTarget,readClassification,requireClassificationActor} from './partnerClassification';
import {attachLinkedCompanies} from './companyConnections';
const fail=(message='INVALID_PARTNER_HANDLED_ITEMS'):never=>{throw createHttpError(400,message);};
export const handledSelectionInclude={base:{select:{id:true,code:true,nameKo:true,nameEn:true,nameVi:true,isActive:true,industryLinks:{select:{systemIndustryId:true}}}}};
const canonical=(groups:any[])=>groups.filter(group=>group.baseIds.length).map(group=>({industryId:group.industryId,baseIds:[...group.baseIds].sort((a:number,b:number)=>a-b)})).sort((a,b)=>a.industryId-b.industryId);
export async function readHandledItems(db:any,orgId:number,entityId:number){
 const row=db.partnerHandledPolicy?await db.partnerHandledPolicy.findUnique({where:{orgId_entityId:{orgId,entityId}},include:{selections:{include:handledSelectionInclude}}}):null;
 const groups=new Map<number,any>();
 for(const selected of row?.selections||[]){if(!groups.has(selected.industryId))groups.set(selected.industryId,{industryId:selected.industryId,baseIds:[],bases:[]});const group=groups.get(selected.industryId);group.baseIds.push(selected.baseId);group.bases.push(selected.base);}
 return {revision:row?.revision??0,industries:[...groups.values()].sort((a,b)=>a.industryId-b.industryId)};
}
export async function saveHandledItems(tx:any,orgId:number,entityId:number,actorId:number,body:any){
 await classificationTarget(tx,orgId,entityId);await requireClassificationActor(tx,orgId,actorId);
 if(orgId===entityId)throw createHttpError(403,'PARTNER_HANDLED_ITEMS_LOCAL_ONLY');
 if(!Number.isSafeInteger(body?.revision)||body.revision<0||!Array.isArray(body.industries)||body.industries.length>100)fail();
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
 const before=await readHandledItems(tx,orgId,entityId);
 if(body.revision!==before.revision)throw createHttpError(409,'PARTNER_HANDLED_ITEMS_CHANGED');
 const local=await readClassification(tx,orgId,entityId),[party]=await attachLinkedCompanies(tx,orgId,[{entityId,id:entityId,classification:local}]);
 const classification=party?.linkedCompany&&party.officialClassification?.industryIds?.length?party.officialClassification:local;
 const current=new Set(classification.industryIds),groups=new Map(canonical(before.industries).map(group=>[group.industryId,group])),seen=new Set();
 const ids=body.industries.map((group:any)=>group?.industryId);
 if(ids.some((id:any)=>!Number.isSafeInteger(id)||id<=0))fail();
 await tx.$queryRawUnsafe('SELECT id FROM "SettingServiceDefault" WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE',ids);
 const industries=await tx.settingServiceDefault.findMany({where:{id:{in:ids},retirement:null}});
 for(const group of body.industries){
  const {industryId,baseIds}=group||{};
  if(seen.has(industryId)||!Array.isArray(baseIds)||baseIds.length>500||baseIds.some((id:any)=>!Number.isSafeInteger(id)||id<=0)||new Set(baseIds).size!==baseIds.length)fail();seen.add(industryId);
  const previous=groups.get(industryId),next={industryId,baseIds:[...baseIds].sort((a:number,b:number)=>a-b)};
  if(JSON.stringify(previous?.baseIds||[])===JSON.stringify(next.baseIds))continue;
  const industry=industries.find((row:any)=>row.id===industryId);
  if(!current.has(industryId)||!industry?.handledItemSelection||!industry.isActive)fail();
  const bases=await tx.transactionCodeBase.findMany({where:{id:{in:baseIds},isActive:true,industryLinks:{some:{systemIndustryId:industryId}}},select:{id:true}});
  if(bases.length!==baseIds.length)fail();
  if(baseIds.length)groups.set(industryId,next);else groups.delete(industryId);
 }
 const after=canonical([...groups.values()]),old=canonical(before.industries);
 if(JSON.stringify(old)===JSON.stringify(after))return before;
 const revision=before.revision+1;
 if(before.revision)await tx.partnerHandledPolicy.update({where:{orgId_entityId:{orgId,entityId}},data:{revision,updatedByEmployeeId:actorId}});
 else await tx.partnerHandledPolicy.create({data:{orgId,entityId,revision,updatedByEmployeeId:actorId}});
 await tx.partnerHandledSelection.deleteMany({where:{orgId,entityId}});
 const data=after.flatMap(group=>group.baseIds.map(baseId=>({orgId,entityId,industryId:group.industryId,baseId})));
 if(data.length)await tx.partnerHandledSelection.createMany({data});
 await tx.partnerHandledAudit.create({data:{orgId,entityId,revision,actorId,before:old,after}});
 return readHandledItems(tx,orgId,entityId);
}
export function registerPartnerHandledItemRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const scope=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!scope)return null;await requireClassificationActor(db,scope.organization.id,gates.actorId());return scope;};
 app.get('/partner-handled-items/options',async(req:any,res:any)=>{
  if(!await access(req,res))return;
  const industries=await db.settingServiceDefault.findMany({where:{handledItemSelection:true,isActive:true,retirement:null},select:{id:true,nameKo:true,nameEn:true,nameVi:true}});
  const bases=industries.length?await db.transactionCodeBase.findMany({where:{isActive:true,industryLinks:{some:{systemIndustryId:{in:industries.map((row:any)=>row.id)}}}},select:{id:true,code:true,nameKo:true,nameEn:true,nameVi:true,industryLinks:{select:{systemIndustryId:true}}},orderBy:{code:'asc'}}):[];
  res.json({industries,bases});
 });
 app.put('/system-setting-defaults/services/:id/handled-items',async(req:any,res:any)=>{
  if(!await gates.requireSystemAdmin(req,res))return;
  const id=Number(req.params.id),{enabled,revision}=req.body||{};
  if(!Number.isSafeInteger(id)||id<=0||typeof enabled!=='boolean'||!Number.isSafeInteger(revision)||revision<0)fail();
  res.json(await db.$transaction(async(tx:any)=>{
   await tx.$queryRawUnsafe('SELECT id FROM "SettingServiceDefault" WHERE id=$1 FOR UPDATE',id);
   const row=await tx.settingServiceDefault.findFirst({where:{id,retirement:null}});if(!row)throw createHttpError(404,'SETTING_NOT_FOUND');
   if(row.handledItemRevision!==revision)throw createHttpError(409,'PARTNER_HANDLED_ITEMS_CHANGED');
   return tx.settingServiceDefault.update({where:{id},data:{handledItemSelection:enabled,handledItemRevision:{increment:1}}});
  }));
 });
}
