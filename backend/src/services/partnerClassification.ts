import {attachLinkedCompanies} from './companyConnections';
import {createHttpError} from '../utils/http';
import {entityProfile} from './entityProfile';
import type {Prisma} from '@prisma/client';
import {partnerRoleCatalogue} from './partnerRoleCatalogue';

export const CLASSIFICATION_INCLUDE={industries:{include:{industry:{include:{partnerRole:true}}}}} satisfies Prisma.PartnerClassificationInclude;
const vendorTypes=['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'];
export function mergePartnerRelationships(rows:any[]){
 const grouped=new Map<number,any>();
 for(const row of rows){const previous=grouped.get(row.entity.id);if(!previous){grouped.set(row.entity.id,{...row,relationshipIds:row.relationshipId?[row.relationshipId]:[]});continue;}
  const preferred=row.relationshipRoles.includes('CUSTOMER')&&!previous.relationshipRoles.includes('CUSTOMER')?row:previous;
  grouped.set(row.entity.id,{...preferred,relationshipRoles:['CUSTOMER','SUPPLIER'].filter(role=>previous.relationshipRoles.includes(role)||row.relationshipRoles.includes(role)),relationshipIds:[...new Set([...previous.relationshipIds,...(row.relationshipId?[row.relationshipId]:[])])],hasUsageHistory:previous.hasUsageHistory||row.hasUsageHistory});
 }
 return [...grouped.values()];
}
const uniqueIds=(value:any)=>{
  if(!Array.isArray(value)||!value.length||value.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(value).size!==value.length)throw createHttpError(400,'PARTNER_CLASSIFICATION_REQUIRED');
  return value as number[];
};
export async function classificationTarget(db:any,orgId:number,entityId:number){
  if(orgId===entityId){const entity=await db.organization.findFirst({where:{id:orgId,ownerOrgId:null,isActive:true,type:{in:['MANUFACTURER','BRAND','SERVICE']}}});if(!entity)throw createHttpError(404,'PARTNER_NOT_FOUND');return {kind:'COMPANY',entity};}
  const vendor=await db.organization.findFirst({where:{id:entityId,ownerOrgId:orgId,type:{in:vendorTypes}}});
  if(vendor)return {kind:'BUSINESS',entity:vendor};
  const relationship=await db.orgRelationship.findFirst({where:{OR:[{manufacturerOrgId:orgId,brandOrgId:entityId},{brandOrgId:orgId,manufacturerOrgId:entityId}]},include:{brand:true,manufacturer:true}});
  if(!relationship)throw createHttpError(404,'PARTNER_NOT_FOUND');
  return {kind:'CUSTOMER',relationshipId:relationship.id,entity:relationship.manufacturerOrgId===orgId?relationship.brand:relationship.manufacturer};
}
export function effectiveClassification(stored:any){
  const industries=stored?.industries.map((row:any)=>row.industry)||[];
  return {revision:stored?.revision??0,roleIds:[...new Set(industries.map((row:any)=>row.partnerRoleId))],industryIds:industries.map((row:any)=>row.id),industries,explicit:Boolean(stored)};
}
export async function readClassification(db:any,orgId:number,entityId:number){
  await classificationTarget(db,orgId,entityId);
  const stored=await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId,entityId}},include:CLASSIFICATION_INCLUDE});
  return effectiveClassification(stored);
}
export async function attachPartnerClassifications(db:any,orgId:number,rows:any[]){
  if(!rows.length)return rows;
  const stored=await db.partnerClassification.findMany({where:{orgId,entityId:{in:rows.map(row=>row.entityId)}},include:CLASSIFICATION_INCLUDE});
  return attachLinkedCompanies(db,orgId,rows.map(row=>{const classification=effectiveClassification(stored.find((s:any)=>s.entityId===row.entityId));return {...row,classification,serviceTypes:classification.industries};}));
}
export async function validateClassification(db:any,body:any,orgId:number,entityId?:number){
  if(!body||!Number.isSafeInteger(body.revision)||body.revision<0)throw createHttpError(400,'PARTNER_CLASSIFICATION_REQUIRED');
  const roleIds=uniqueIds(body.roleIds),industryIds=uniqueIds(body.industryIds);
  const stored=entityId?await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId,entityId}},include:CLASSIFICATION_INCLUDE}):null;
  if((stored?.revision??0)!==body.revision)throw createHttpError(409,'PARTNER_CLASSIFICATION_CHANGED');
  const retained=new Set(stored?.industries.map((row:any)=>row.systemIndustryId)||[]);
  const industries=await db.settingServiceDefault.findMany({where:{id:{in:industryIds}},include:{partnerRole:true}});
  if(industries.length!==industryIds.length||industries.some((row:any)=>row.code==='GENERAL'||!row.partnerRoleId||!row.isActive&&!retained.has(row.id))||
    roleIds.some(id=>!industries.some((row:any)=>row.partnerRoleId===id))||industries.some((row:any)=>!roleIds.includes(row.partnerRoleId)))throw createHttpError(400,'PARTNER_CLASSIFICATION_REQUIRED');
  return {revision:body.revision,roleIds,industryIds};
}
export async function saveClassification(db:any,orgId:number,entityId:number,employeeId:number|null,body:any){
  const target=await classificationTarget(db,orgId,entityId);
  await requireClassificationActor(db,orgId,employeeId);
  if(entityId===orgId&&!await db.employee.findFirst({where:{id:employeeId,orgId,status:'ACTIVE',orgRole:'ADMIN'}}))throw createHttpError(403,'COMPANY_INDUSTRY_ADMIN_REQUIRED');
  await db.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
  const data=await validateClassification(db,body,orgId,entityId);
  if(data.revision){
    const updated=await db.partnerClassification.updateMany({where:{orgId,entityId,revision:data.revision},data:{revision:{increment:1},updatedByEmployeeId:employeeId,updatedBySystemUserId:null}});
    if(updated.count!==1)throw createHttpError(409,'PARTNER_CLASSIFICATION_CHANGED');
  }else await db.partnerClassification.create({data:{orgId,entityId,updatedByEmployeeId:employeeId}});
  await db.partnerClassificationIndustry.deleteMany({where:{orgId,entityId}});
  await db.partnerClassificationIndustry.createMany({data:data.industryIds.map(systemIndustryId=>({orgId,entityId,systemIndustryId}))});
  // Explicit classification replaces the old single customer type. Retaining
  // that duplicate FK keeps removed types falsely in use after an edit.
  if(target.kind==='CUSTOMER')await db.orgRelationship.update({where:{id:target.relationshipId},data:{systemIndustryId:null}});
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
      db.organization.findMany({where:{ownerOrgId:orgId,type:{in:vendorTypes}},orderBy:{name:'asc'}}),
      db.orgRelationship.findMany({where:{OR:[{manufacturerOrgId:orgId},{brandOrgId:orgId}]},include:{brand:true,manufacturer:true}}),
      db.partnerClassification.findMany({where:{orgId},include:CLASSIFICATION_INCLUDE}),partnerRoleCatalogue(db)]);
    const documents=new Map(stored.map((row:any)=>[row.entityId,row]));
    const rows=[...vendors.map((entity:any)=>({entity,kind:'BUSINESS',relationshipRoles:['SUPPLIER']})),
      ...customers.map((r:any)=>{const entity=r.manufacturerOrgId===orgId?r.brand:r.manufacturer;return {entity:{...entity,code:entity.code||r.customerCode,representative:entity.representative||r.managerName,phone:entity.phone||r.managerPhone,email:entity.email||r.managerEmail,createdAt:r.createdAt},kind:'CUSTOMER',relationshipRoles:[r.manufacturerOrgId===orgId?'CUSTOMER':'SUPPLIER'],relationshipId:r.id};})]
      .map((row:any)=>({...row,classification:effectiveClassification(documents.get(row.entity.id))}));
    const [vendorUsage,customerUsage,pricing]=await Promise.all([gates.getBusinessPartnerUsage(db,vendors.map((row:any)=>row.id)),gates.getCustomerUsage(db,customers.map((row:any)=>row.id)),gates.loadCustomerPricingCounts?.(ctx.organization,customers.map((row:any)=>row.id))||new Map()]);
    const linkedRows=await attachLinkedCompanies(db,orgId,rows.map((row:any)=>({...row,entityId:row.entity.id})));
    res.json({roles,rows:mergePartnerRelationships(linkedRows.map((row:any)=>({...row,entity:{...entityProfile({...row.entity,...Object.fromEntries(['name','nameKo','nameVi','address','country','businessNumber','code','representative','phone','email'].filter(key=>key in row).map(key=>[key,row[key]]))}),id:row.entity.id,linkedCompany:row.linkedCompany,type:row.entity.type,isActive:row.entity.isActive,createdAt:row.entity.createdAt,representative:'representative' in row?row.representative:row.entity.representative,phone:'phone' in row?row.phone:row.entity.phone},hasUsageHistory:row.kind==='CUSTOMER'?customerUsage.has(row.relationshipId):vendorUsage.has(row.entity.id),missingSalesPriceStyleCount:row.kind==='CUSTOMER'?pricing.get(row.relationshipId)??0:0})))});
  });
}
