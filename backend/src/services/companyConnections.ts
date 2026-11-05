import {createHttpError} from '../utils/http';
import {editRevision,retryEditTransaction} from '../utils/editRevision';
import {classificationTarget,requireClassificationActor} from './partnerClassification';
import {identityFields,identityCandidates,resolveIdentityChoice,saveIdentityChoice,identityDto,currentIdentity,publicCompanyFields,publicCompanyDetails} from './companyIdentity';

const tenantTypes=['MANUFACTURER','BRAND','SERVICE'];
const tenantScope={ownerOrgId:null,isActive:true,type:{in:tenantTypes},employees:{some:{status:'ACTIVE'}}};
const publicSelect=publicCompanyFields;
export const normalizedBusinessNumber=(value:any)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const companyIdentityRevision=(row:any)=>editRevision(Object.fromEntries(Object.keys(identityFields).map(key=>[key,row[key]??null])));
const identity=(row:any)=>({...row,revision:companyIdentityRevision(row)});
export async function companyConnectionCandidates(db:any,orgId:number,input:any){
 const name=String(input.name||'').trim(),number=normalizedBusinessNumber(input.businessNumber),country=String(input.country||'').trim();
 if(number)return identityCandidates(db,orgId,input);
 if((!number&&name.length<3)||name.length>200||number.length>100)throw createHttpError(400,'COMPANY_LOOKUP_INPUT_REQUIRED');
 const predicate=number?`regexp_replace(upper("businessNumber"),'[^A-Z0-9]','','g')=$2`:`(lower(name)=lower($2) OR lower("nameKo")=lower($2) OR lower("nameVi")=lower($2))`;
 const rows=await db.$queryRawUnsafe(`SELECT id,name,"nameKo","nameVi",code,country,"businessNumber",address,industry,representative,phone,email FROM "Organization" o WHERE id<>$1 AND "ownerOrgId" IS NULL AND ("dataOwnerOrgId" IS NULL OR "dataOwnerOrgId"=o.id) AND "isActive" AND type::text IN ('MANUFACTURER','BRAND','SERVICE') AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=o.id AND e.status::text='ACTIVE') AND ${predicate} AND ($3='' OR country=$3) ORDER BY id LIMIT 21`,orgId,number||name,country);
 return (await Promise.all(rows.filter((row:any)=>!number||normalizedBusinessNumber(row.businessNumber)===number).map((row:any)=>publicCompanyDetails(db,row)))).map(identity);
}
export async function connectPartnerCompany(tx:any,orgId:number,entityId:number,actorId:number|null,requested?:any){
 await requireClassificationActor(tx,orgId,actorId);
 if(entityId!==orgId)await classificationTarget(tx,orgId,entityId);
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
 const entity=await tx.organization.findUnique({where:{id:entityId},select:publicSelect});
 const existing=await tx.companyPartnerLink.findUnique({where:{orgId_entityId:{orgId,entityId}}});
 if(existing){
  if(requested?.separate||requested?.identityId||requested?.sourceEntityId&&requested.sourceEntityId!==existing.targetOrgId)throw createHttpError(409,'COMPANY_CONNECTION_ALREADY_LINKED');
  if(requested&&requested.targetOrgId!==existing.targetOrgId)throw createHttpError(409,'COMPANY_CONNECTION_ALREADY_LINKED');
  const linked=await tx.organization.findFirst({where:{id:existing.targetOrgId},select:publicSelect});
  const a=normalizedBusinessNumber(entity.businessNumber),b=normalizedBusinessNumber(linked?.businessNumber);
  if(a&&b&&a!==b||entity.country&&linked?.country&&entity.country!==linked.country)throw createHttpError(409,'COMPANY_CONNECTION_IDENTITY_MISMATCH');
  return existing;
 }
 if(!requested||requested.separate||requested.identityId||requested.sourceEntityId){
  const choice=await resolveIdentityChoice(tx,orgId,entityId,requested,entity);
  return choice?saveIdentityChoice(tx,orgId,entityId,actorId!,choice):null;
 }
 let target:any;
 if(requested){
  if(!Number.isSafeInteger(requested.targetOrgId)||requested.targetOrgId===orgId)throw createHttpError(400,'INVALID_COMPANY_CONNECTION');
  target=await tx.organization.findFirst({where:{...tenantScope,id:requested.targetOrgId,OR:[{dataOwnerOrgId:null},{dataOwnerOrgId:requested.targetOrgId}]},select:publicSelect});
  if(!target||requested.revision!==companyIdentityRevision(target))throw createHttpError(409,'COMPANY_CONNECTION_CHANGED');
  const number=normalizedBusinessNumber(entity.businessNumber),targetNumber=normalizedBusinessNumber(target.businessNumber);
  if(number&&targetNumber&&number!==targetNumber||entity.country&&target.country&&entity.country!==target.country)throw createHttpError(409,'COMPANY_CONNECTION_IDENTITY_MISMATCH');
 }
 return tx.companyPartnerLink.create({data:{orgId,entityId,targetOrgId:target.id,createdByEmployeeId:actorId,matchMethod:'SELECTED'}});
}
// Customer organization FKs can predate tenant registration. A relationship
// never authorizes rewriting an independently registered company's profile.
export async function assertPartnerProfileEditable(tx:any,orgId:number,entity:any){
 if(entity.ownerOrgId===orgId||entity.dataOwnerOrgId===orgId)return;
 if(entity.ownerOrgId!=null||entity.dataOwnerOrgId!=null||await tx.employee.findFirst({where:{orgId:entity.id},select:{id:true}}))throw createHttpError(403,'COMPANY_PROFILE_IS_PRIVATE');
}
export function registerCompanyConnectionRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!ctx)return null;await requireClassificationActor(db,ctx.organization.id,gates.getActor());return ctx.organization.id;};
 app.get('/company-connections/candidates',async(req:any,res:any)=>{const orgId=await access(req,res);if(!orgId)return;res.json(await companyConnectionCandidates(db,orgId,req.query));});
 app.get('/company-connections',async(req:any,res:any)=>{const orgId=await access(req,res);if(!orgId)return;
  const rows=await db.companyPartnerLink.findMany({where:{OR:[{orgId},{targetOrgId:orgId}]},include:{source:{select:publicSelect},target:{select:publicSelect}},orderBy:{createdAt:'asc'}});
  const common=await db.companyIdentityLink.findMany({where:{orgId},include:{identity:true}});
  await Promise.all(common.map(async(row:any)=>{row.identity=await currentIdentity(db,row.identity);}));
  res.json([...common.map((row:any)=>({company:identityDto(row.identity,true),entityId:row.entityId,direction:'OUTGOING',createdAt:row.createdAt})),...rows.filter((row:any)=>!common.some((c:any)=>c.entityId===row.entityId&&row.orgId===orgId)).map((row:any)=>({company:row.orgId===orgId?row.target:row.source,entityId:row.orgId===orgId?row.entityId:null,direction:row.orgId===orgId?'OUTGOING':'INCOMING',createdAt:row.createdAt}))]);
 });
 app.post('/company-connections',async(req:any,res:any)=>{const orgId=await access(req,res);if(!orgId)return;const entityId=Number(req.body?.entityId);if(!Number.isSafeInteger(entityId)||entityId<=0)throw createHttpError(400,'INVALID_PARTNER_ID');
  res.json(await retryEditTransaction(db,tx=>connectPartnerCompany(tx,orgId,entityId,gates.getActor(),req.body?.companyConnection)));
 });
}

/** A local relationship keeps its FK; public identity comes from the connected subscriber. */
export async function linkedPartnerCompany(db:any,orgId:number,entityId?:number,requested?:any,profile?:any){
 const common=entityId?await db.companyIdentityLink.findUnique({where:{orgId_entityId:{orgId,entityId}},include:{identity:true}}):null;
 if(common)return resolveIdentityChoice(db,orgId,entityId,requested,profile);
 const link=entityId?await db.companyPartnerLink.findUnique({where:{orgId_entityId:{orgId,entityId}},include:{target:{select:publicSelect}}}):null;
 if(link)return link.target;
 if(!requested||requested.separate||requested.identityId||requested.sourceEntityId)return resolveIdentityChoice(db,orgId,entityId,requested,profile);
 if(!Number.isSafeInteger(requested.targetOrgId)||requested.targetOrgId===orgId)throw createHttpError(400,'INVALID_COMPANY_CONNECTION');
 const target=await db.organization.findFirst({where:{...tenantScope,id:requested.targetOrgId,OR:[{dataOwnerOrgId:null},{dataOwnerOrgId:requested.targetOrgId}]},select:publicSelect});
 if(!target||requested.revision!==companyIdentityRevision(target))throw createHttpError(409,'COMPANY_CONNECTION_CHANGED');
 return target;
}
const publicProfile=(company:any)=>company?Object.fromEntries(['name','nameKo','nameVi','address','country','businessNumber','representative','phone','email'].map(key=>[key,company[key]??null])):{};
export async function attachLinkedCompanies(db:any,orgId:number,rows:any[]){
 if(!rows.length)return rows;
 const links=await db.companyPartnerLink.findMany({where:{orgId,entityId:{in:rows.map(row=>row.entityId)}},select:{entityId:true,target:{select:publicSelect}}});
 const common=await db.companyIdentityLink.findMany({where:{orgId,entityId:{in:rows.map(row=>row.entityId)}},include:{identity:true}});
 await Promise.all(common.map(async(link:any)=>{link.identity=await currentIdentity(db,link.identity);}));
 const targets=new Map<number,number>();for(const link of links)if(Number.isSafeInteger(link.target?.id))targets.set(link.entityId,link.target.id);for(const link of common)if(Number.isSafeInteger(link.identity.anchorEntityId))targets.set(link.entityId,link.identity.anchorEntityId);
 // Only self-declared public industries are shared. Local classifications and
 // billing codes remain private to the owning company.
 const profiles=db.partnerClassification&&targets.size?await db.partnerClassification.findMany({where:{OR:[...new Set(targets.values())].map(id=>({orgId:id,entityId:id}))},include:{industries:{include:{industry:{include:{partnerRole:true}}}}}}):[];
 return rows.map(row=>{const profile=profiles.find((p:any)=>p.orgId===targets.get(row.entityId)&&p.orgId===p.entityId),industries=profile?.industries.map((l:any)=>l.industry)||[];return {...row,...publicProfile(common.find((link:any)=>link.entityId===row.entityId)?.identity||links.find((link:any)=>link.entityId===row.entityId)?.target),officialClassification:profile?{revision:profile.revision,industryIds:industries.map((i:any)=>i.id),roleIds:[...new Set(industries.map((i:any)=>i.partnerRoleId))],industries}:null,linkedCompany:common.some((link:any)=>link.entityId===row.entityId)?identityDto(common.find((link:any)=>link.entityId===row.entityId).identity,true):links.find((link:any)=>link.entityId===row.entityId)?.target??null};});
}
