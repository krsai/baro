import {createHttpError} from '../utils/http';
import {editRevision} from '../utils/editRevision';
export const identityFields={id:true,name:true,nameKo:true,nameVi:true,code:true,country:true,businessNumber:true,address:true};
export const publicCompanyFields={...identityFields,businessLegalForm:true,industry:true,representative:true,phone:true,email:true};
export const numberKey=(value:any)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const publicIdentityRevision=(row:any)=>editRevision(Object.fromEntries(Object.keys(identityFields).map(key=>[key,row[key]??null])));
export const identityDto=(row:any,common=false)=>({...Object.fromEntries([...Object.keys(publicCompanyFields),'industryLabels','officialClassification'].map(key=>[key,row[key]??null])),...(common?{identityId:row.id}:{sourceEntityId:row.id}),revision:publicIdentityRevision(row)});
export async function publicCompanyDetails(db:any,row:any){
 const industryLabels=row.industry?await db.partnerRole.findUnique({where:{code:row.industry},select:{nameKo:true,nameEn:true,nameVi:true}}):null;
 const companyId=row.anchorEntityId||row.id;
 const profile=db.partnerClassification?await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId:companyId,entityId:companyId}},include:{industries:{include:{industry:{include:{partnerRole:true}}}}}}):null;
 const industries=profile?.industries.map((link:any)=>link.industry)||[];
 return {...row,industryLabels,officialClassification:profile?{revision:profile.revision,industries,industryIds:industries.map((i:any)=>i.id),roleIds:[...new Set(industries.map((i:any)=>i.partnerRoleId))]}:null};
}
// Read public names/address from the owning profile without rewriting local rows or snapshots.
export async function currentIdentity(db:any,row:any){
 if(!row?.anchorEntityId)return row;
 const anchor=await db.organization.findFirst({where:{id:row.anchorEntityId,isActive:true},select:publicCompanyFields});
 return anchor?publicCompanyDetails(db,{...row,...Object.fromEntries(['name','nameKo','nameVi','address','businessLegalForm','industry','representative','phone','email'].map(key=>[key,anchor[key]??null]))}):row;
}
export async function identityCandidates(db:any,orgId:number,input:any){
 const number=numberKey(input.businessNumber),country=String(input.country||'').trim();
 if(number.length<3||number.length>100||!country||country.length>10)throw createHttpError(400,'COMPANY_LOOKUP_COUNTRY_NUMBER_REQUIRED');
 const common=await db.companyIdentity.findMany({where:{country,businessNumber:number},take:21,orderBy:{id:'asc'}});
 const sources=await db.$queryRawUnsafe(`SELECT id,name,"nameKo","nameVi",code,country,"businessNumber",address,industry,representative,phone,email FROM "Organization" o WHERE id<>$1 AND "isActive" AND "partyKind" IS DISTINCT FROM 'INDIVIDUAL' AND code IS NOT NULL AND country=$3 AND regexp_replace(upper("businessNumber"),'[^A-Z0-9]','','g')=$2 AND NOT EXISTS(SELECT 1 FROM "CompanyIdentity" c WHERE (c."anchorEntityId"=o.id OR c.code=o.code)) AND NOT EXISTS(SELECT 1 FROM "CompanyIdentityLink" l WHERE l."entityId"=o.id) ORDER BY id LIMIT 21`,orgId,number,country);
 return [...(await Promise.all(common.map((r:any)=>currentIdentity(db,r)))).map((r:any)=>identityDto(r,true)),...(await Promise.all(sources.map((r:any)=>publicCompanyDetails(db,r)))).map((r:any)=>identityDto(r))].slice(0,21);
}
export async function resolveIdentityChoice(db:any,orgId:number,entityId:number|undefined,requested:any,profile:any){
 const existing=entityId?await db.companyIdentityLink.findUnique({where:{orgId_entityId:{orgId,entityId}},include:{identity:true}}):null;
 if(existing){
  existing.identity=await currentIdentity(db,existing.identity);
  if(requested&&(requested.separate||requested.identityId&&requested.identityId!==existing.identityId||requested.sourceEntityId&&requested.sourceEntityId!==existing.identity.anchorEntityId))throw createHttpError(409,'COMPANY_CONNECTION_ALREADY_LINKED');
  const number=numberKey(profile?.businessNumber),country=profile?.country;
  if(number&&number!==existing.identity.businessNumber||country&&country!==existing.identity.country)throw createHttpError(409,'COMPANY_CONNECTION_IDENTITY_MISMATCH');
  return {...identityDto(existing.identity,true),anchorEntityId:existing.identity.anchorEntityId};
 }
 if(requested?.separate){
  if(numberKey(requested.businessNumber)!==numberKey(profile?.businessNumber)||requested.country!==profile?.country)throw createHttpError(409,'COMPANY_CONNECTION_CHANGED');
  return null;
 }
 if(!requested){
  if(numberKey(profile?.businessNumber)&&profile?.country){const candidates=await identityCandidates(db,orgId,profile);if(candidates.some((r:any)=>r.sourceEntityId!==entityId))throw createHttpError(409,'COMPANY_CONNECTION_CONFIRMATION_REQUIRED');}
  return null;
 }
 const common=Number.isSafeInteger(requested.identityId),id=common?requested.identityId:requested.sourceEntityId;
 if(!Number.isSafeInteger(id)||id<=0||!common&&id===orgId)throw createHttpError(400,'INVALID_COMPANY_CONNECTION');
 const row=common?await currentIdentity(db,await db.companyIdentity.findUnique({where:{id}})):await db.organization.findFirst({where:{id,isActive:true,OR:[{partyKind:null},{partyKind:'CORPORATE'}]},select:identityFields});
 if(!row||!row.code||requested.revision!==publicIdentityRevision(row))throw createHttpError(409,'COMPANY_CONNECTION_CHANGED');
 if(!profile?.country||profile.country!==row.country||!numberKey(profile.businessNumber)||numberKey(profile.businessNumber)!==numberKey(row.businessNumber))throw createHttpError(409,'COMPANY_CONNECTION_IDENTITY_MISMATCH');
 return {...identityDto(row,common),...(common?{anchorEntityId:row.anchorEntityId}:{})};
}
export async function saveIdentityChoice(tx:any,orgId:number,entityId:number,actorId:number,choice:any){
 let identityId=choice.identityId;
 if(!identityId){
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',choice.sourceEntityId);
  const current=await tx.organization.findFirst({where:{id:choice.sourceEntityId,isActive:true,OR:[{partyKind:null},{partyKind:'CORPORATE'}]},select:identityFields});
  if(!current||publicIdentityRevision(current)!==choice.revision)throw createHttpError(409,'COMPANY_CONNECTION_CHANGED');
 const {sourceEntityId}=choice;
 const profile=Object.fromEntries(Object.keys(identityFields).filter(key=>key!=='id').map(key=>[key,choice[key]??null]));
  const canonical=await tx.companyIdentity.findUnique({where:{anchorEntityId:sourceEntityId}})||await tx.companyIdentity.create({data:{anchorEntityId:sourceEntityId,...profile,businessNumber:numberKey(profile.businessNumber)}});
  if(canonical.code!==choice.code||canonical.country!==choice.country||canonical.businessNumber!==numberKey(choice.businessNumber))throw createHttpError(409,'COMPANY_CONNECTION_CHANGED');
  identityId=canonical.id;
 }
 const existing=await tx.companyIdentityLink.findUnique({where:{orgId_entityId:{orgId,entityId}}});
 if(existing){if(existing.identityId!==identityId)throw createHttpError(409,'COMPANY_CONNECTION_ALREADY_LINKED');return existing;}
 return tx.companyIdentityLink.create({data:{orgId,entityId,identityId,createdByEmployeeId:actorId}});
}
