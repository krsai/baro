import {createHttpError} from '../utils/http';
import {entityProfile} from './entityProfile';
import type {Prisma} from '@prisma/client';
import {partnerRoleCatalogue} from './partnerRoleCatalogue';

export const CLASSIFICATION_INCLUDE={industries:{include:{industry:{include:{partnerRole:true}}}}} satisfies Prisma.PartnerClassificationInclude;
const vendorTypes=['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'];
const uniqueIds=(value:any)=>{
  if(!Array.isArray(value)||!value.length||value.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(value).size!==value.length)throw createHttpError(400,'PARTNER_CLASSIFICATION_REQUIRED');
  return value as number[];
};
export async function classificationTarget(db:any,orgId:number,entityId:number){
  const vendor=await db.organization.findFirst({where:{id:entityId,ownerOrgId:orgId,type:{in:vendorTypes}},include:{outsourcingServiceAssignments:{include:{serviceType:{include:{systemDefault:{include:{partnerRole:true}}}}}}}});
  if(vendor)return {kind:'BUSINESS',entity:vendor,legacy:vendor.outsourcingServiceAssignments.map((row:any)=>row.serviceType.systemDefault).filter(Boolean)};
  const relationship=await db.orgRelationship.findFirst({where:{OR:[{manufacturerOrgId:orgId,brandOrgId:entityId},{brandOrgId:orgId,manufacturerOrgId:entityId}]},include:{brand:true,manufacturer:true,systemIndustry:{include:{partnerRole:true}}}});
  if(!relationship)throw createHttpError(404,'PARTNER_NOT_FOUND');
  return {kind:'CUSTOMER',relationshipId:relationship.id,entity:relationship.manufacturerOrgId===orgId?relationship.brand:relationship.manufacturer,legacy:relationship.systemIndustry?[relationship.systemIndustry]:[]};
}
export function effectiveClassification(stored:any,legacy:any[]=[]){
  const industries=stored?stored.industries.map((row:any)=>row.industry):legacy.filter(row=>row?.code!=='GENERAL'&&row?.partnerRoleId);
  return {revision:stored?.revision??0,roleIds:[...new Set(industries.map((row:any)=>row.partnerRoleId))],industryIds:industries.map((row:any)=>row.id),industries,legacyGeneral:legacy.filter(row=>row?.code==='GENERAL').map(row=>({id:row.id,code:row.code})),explicit:Boolean(stored)};
}
export async function readClassification(db:any,orgId:number,entityId:number,legacy?:any[]){
  const target=legacy?null:await classificationTarget(db,orgId,entityId);
  const stored=await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId,entityId}},include:CLASSIFICATION_INCLUDE});
  return effectiveClassification(stored,legacy||target?.legacy||[]);
}
export async function attachPartnerClassifications(db:any,orgId:number,rows:any[]){
  if(!rows.length)return rows;
  const legacyIds=[...new Set(rows.flatMap(row=>[row.systemIndustryId,...(row.serviceTypes||[]).map((s:any)=>s.systemDefaultId)].filter(Boolean)))];
  const [stored,sources]=await Promise.all([db.partnerClassification.findMany({where:{orgId,entityId:{in:rows.map(row=>row.entityId)}},include:CLASSIFICATION_INCLUDE}),db.settingServiceDefault.findMany({where:{id:{in:legacyIds}},include:{partnerRole:true}})]);
  return rows.map(row=>({...row,classification:effectiveClassification(stored.find((s:any)=>s.entityId===row.entityId),sources.filter((s:any)=>s.id===row.systemIndustryId||(row.serviceTypes||[]).some((local:any)=>local.systemDefaultId===s.id)))}));
}
export async function validateClassification(db:any,body:any,orgId:number,entityId?:number){
  if(!body||!Number.isSafeInteger(body.revision)||body.revision<0)throw createHttpError(400,'PARTNER_CLASSIFICATION_REQUIRED');
  const roleIds=uniqueIds(body.roleIds),industryIds=uniqueIds(body.industryIds);
  const stored=entityId?await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId,entityId}},include:CLASSIFICATION_INCLUDE}):null;
  if((stored?.revision??0)!==body.revision)throw createHttpError(409,'PARTNER_CLASSIFICATION_CHANGED');
  const retained=new Set(stored?stored.industries.map((row:any)=>row.systemIndustryId):entityId?(await classificationTarget(db,orgId,entityId)).legacy.filter((row:any)=>row.code!=='GENERAL').map((row:any)=>row.id):[]);
  const industries=await db.settingServiceDefault.findMany({where:{id:{in:industryIds}},include:{partnerRole:true}});
  if(industries.length!==industryIds.length||industries.some((row:any)=>row.code==='GENERAL'||!row.partnerRoleId||!row.isActive&&!retained.has(row.id))||
    roleIds.some(id=>!industries.some((row:any)=>row.partnerRoleId===id))||industries.some((row:any)=>!roleIds.includes(row.partnerRoleId)))throw createHttpError(400,'PARTNER_CLASSIFICATION_REQUIRED');
  return {revision:body.revision,roleIds,industryIds};
}
export async function saveClassification(db:any,orgId:number,entityId:number,employeeId:number|null,body:any){
  await classificationTarget(db,orgId,entityId);
  await requireClassificationActor(db,orgId,employeeId);
  await db.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
  const data=await validateClassification(db,body,orgId,entityId);
  if(data.revision){
    const updated=await db.partnerClassification.updateMany({where:{orgId,entityId,revision:data.revision},data:{revision:{increment:1},updatedByEmployeeId:employeeId}});
    if(updated.count!==1)throw createHttpError(409,'PARTNER_CLASSIFICATION_CHANGED');
  }else await db.partnerClassification.create({data:{orgId,entityId,updatedByEmployeeId:employeeId}});
  await db.partnerClassificationIndustry.deleteMany({where:{orgId,entityId}});
  await db.partnerClassificationIndustry.createMany({data:data.industryIds.map(systemIndustryId=>({orgId,entityId,systemIndustryId}))});
  return readClassification(db,orgId,entityId);
}
export async function requireClassificationActor(db:any,orgId:number,employeeId:number|null){
  if(!employeeId||!await db.employee.findFirst({where:{id:employeeId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}}))throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
}

export function registerPartnerClassificationRoutes(app:any,db:any,gates:any){
  const access=(req:any,res:any)=>gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});
  app.get('/partner-classifications/options',async(req:any,res:any)=>{
    if(!await access(req,res))return;
    const [roles,industries]=await Promise.all([partnerRoleCatalogue(db),db.settingServiceDefault.findMany({where:{isActive:true,code:{not:'GENERAL'}},include:{partnerRole:true},orderBy:[{sortOrder:'asc'},{id:'asc'}]})]);
    res.json({roles,industries});
  });
  app.get('/partner-classifications/:entityId',async(req:any,res:any)=>{
    const ctx=await access(req,res);if(!ctx)return;
    const entityId=Number(req.params.entityId);if(!Number.isSafeInteger(entityId)||entityId<=0)throw createHttpError(400,'INVALID_PARTNER_ID');
    res.json(await readClassification(db,ctx.organization.id,entityId));
  });
  app.get('/partner-directory',async(req:any,res:any)=>{
    const ctx=await access(req,res);if(!ctx)return;const orgId=ctx.organization.id;
    const [vendors,customers,stored,roles]=await Promise.all([
      db.organization.findMany({where:{ownerOrgId:orgId,type:{in:vendorTypes}},include:{outsourcingServiceAssignments:{include:{serviceType:{include:{systemDefault:{include:{partnerRole:true}}}}}}},orderBy:{name:'asc'}}),
      db.orgRelationship.findMany({where:{OR:[{manufacturerOrgId:orgId},{brandOrgId:orgId}]},include:{brand:true,manufacturer:true,systemIndustry:{include:{partnerRole:true}}}}),
      db.partnerClassification.findMany({where:{orgId},include:CLASSIFICATION_INCLUDE}),partnerRoleCatalogue(db)]);
    const documents=new Map(stored.map((row:any)=>[row.entityId,row]));
    const rows=[...vendors.map((entity:any)=>({entity,kind:'BUSINESS',legacy:entity.outsourcingServiceAssignments.map((a:any)=>a.serviceType.systemDefault).filter(Boolean)})),
      ...customers.map((r:any)=>{const entity=r.manufacturerOrgId===orgId?r.brand:r.manufacturer;return {entity:{...entity,code:entity.code||r.customerCode,representative:entity.representative||r.managerName,phone:entity.phone||r.managerPhone,email:entity.email||r.managerEmail,createdAt:r.createdAt},kind:'CUSTOMER',relationshipId:r.id,legacy:r.systemIndustry?[r.systemIndustry]:[]};})]
      .map((row:any)=>({...row,classification:effectiveClassification(documents.get(row.entity.id),row.legacy)}));
    const [vendorUsage,customerUsage,pricing]=await Promise.all([gates.getBusinessPartnerUsage(db,vendors.map((row:any)=>row.id)),gates.getCustomerUsage(db,customers.map((row:any)=>row.id)),gates.loadCustomerPricingCounts?.(ctx.organization,customers.map((row:any)=>row.id))||new Map()]);
    res.json({roles,rows:rows.map(({legacy,...row}:any)=>({...row,entity:{...entityProfile(row.entity),id:row.entity.id,type:row.entity.type,isActive:row.entity.isActive,createdAt:row.entity.createdAt,representative:row.entity.representative,phone:row.entity.phone,outsourcingServiceAssignments:row.kind==='BUSINESS'?row.entity.outsourcingServiceAssignments:undefined},hasUsageHistory:row.kind==='CUSTOMER'?customerUsage.has(row.relationshipId):vendorUsage.has(row.entity.id),missingSalesPriceStyleCount:row.kind==='CUSTOMER'?pricing.get(row.relationshipId)??0:0}))});
  });
}
