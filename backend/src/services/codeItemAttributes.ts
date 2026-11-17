import {createHttpError} from '../utils/http';
import {Prisma} from '@prisma/client';
import {normalizeLocalizedName,validLocalizedName} from '../utils/localizedName';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
import {prepareMaterialOwner,materialOwnerScope,MATERIAL_OWNER_SELECT} from './materialOwner';
const fail=(message:string):never=>{throw createHttpError(400,message);};
const names={id:true,code:true,name:true,nameKo:true,nameVi:true};
export async function prepareCodeItemAttributes(tx:any,orgId:number,body:any,code:any,previous?:any){
 const result:any={...await prepareMaterialOwner(tx,orgId,body,code,previous)};
 for(const [key,field] of [['customer','itemCustomerId'],['type','itemTypeId']] as const){
  const value=body[field]===undefined?previous?.[field]??null:body[field]||null;
  if(value!=null&&(!Number.isSafeInteger(value)||value<=0))fail('INVALID_ITEM_'+key.toUpperCase());
  result[field]=value;
 }
 const same=previous?.transactionCodeId===code.id&&(previous.itemCustomerId??null)===result.itemCustomerId&&(previous.itemTypeId??null)===result.itemTypeId;
 if(same)return {...result,itemAttributeSnapshot:previous.itemAttributeSnapshot??undefined};
 for(const [key,field] of [['customer','itemCustomerId'],['type','itemTypeId']] as const){
  const mode=code.base.attributeInputs?.[key]??'HIDDEN',value=result[field];
  if(mode==='REQUIRED'&&!value)fail('REQUIRED_ITEM_'+key.toUpperCase());
  if(mode==='HIDDEN'&&value&&previous?.[field]!==value)fail('UNEXPECTED_ITEM_'+key.toUpperCase());
 }
 const customer=result.itemCustomerId?await tx.orgRelationship.findFirst({where:{OR:[{manufacturerOrgId:orgId,brandOrgId:result.itemCustomerId},{brandOrgId:orgId,manufacturerOrgId:result.itemCustomerId}]},select:{id:true}}):null;
 if(result.itemCustomerId&&!customer)fail('INVALID_ITEM_CUSTOMER');
 const type=result.itemTypeId?await tx.codeItemType.findFirst({where:{id:result.itemTypeId,orgId,baseId:code.baseId}}):null;
 if(result.itemTypeId&&!type)fail('INVALID_ITEM_TYPE');
 const entity=customer?await tx.organization.findUnique({where:{id:result.itemCustomerId},select:names}):null;
 return {...result,...(entity||type?{itemAttributeSnapshot:{customer:entity,type:type?{id:type.id,nameKo:type.nameKo,nameEn:type.nameEn,nameVi:type.nameVi}:null}}:previous?.itemAttributeSnapshot?{itemAttributeSnapshot:Prisma.DbNull}:{})};
}
export function registerCodeItemAttributeRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const scope=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!scope)return null;
  const employee=await db.employee.findFirst({where:{id:gates.actorId(),orgId:scope.organization.id,status:'ACTIVE'},select:{orgRole:true}});
  if(!employee||!gates.canAccessCodeItems||!(await companyIndustryMenuFeatures(db,scope.organization.id,scope.organization.type)).includes('OUTSOURCING_RECORD')||!await gates.canAccessCodeItems({orgType:scope.organization.type,orgRole:employee.orgRole,feature:'OUTSOURCING_RECORD'}))throw createHttpError(403,'ITEM_ATTRIBUTE_ACCESS_DENIED');
  return scope;
 };
 app.get('/code-item-options',async(req:any,res:any)=>{
  const scope=await access(req,res);if(!scope)return;
  const orgId=scope.organization.id,baseId=Number(req.query.baseId);
  if(!Number.isSafeInteger(baseId)||baseId<=0)fail('INVALID_EXPENSE_CODE_BASE');
  if(!await db.transactionCode.findFirst({where:{ownerOrgId:orgId,baseId,isActive:true}}))fail('INVALID_EXPENSE_CODE_BASE');
  const [links,types]=await Promise.all([db.orgRelationship.findMany({where:{OR:[{manufacturerOrgId:orgId},{brandOrgId:orgId}]},include:{manufacturer:{select:names},brand:{select:names}}}),db.codeItemType.findMany({where:{orgId,baseId},orderBy:{id:'asc'}})]);
  const owners=await db.organization.findMany({where:materialOwnerScope(orgId),select:MATERIAL_OWNER_SELECT,orderBy:[{name:'asc'},{id:'asc'}]});
  res.json({customers:[...new Map(links.map((link:any)=>{const entity=link.manufacturerOrgId===orgId?link.brand:link.manufacturer;return [entity.id,entity];})).values()],owners,types});
 });
 app.post('/code-item-types',async(req:any,res:any)=>{
  const scope=await access(req,res);if(!scope)return;
  const orgId=scope.organization.id,actorId=gates.actorId(),body=req.body,baseId=body?.baseId;
  if(!Number.isSafeInteger(baseId)||baseId<=0||!validLocalizedName(body,100)||['nameEn','nameKo','nameVi'].some(key=>typeof body?.[key]!=='string'||!body[key].trim()))fail('INVALID_ITEM_TYPE');
  const {nameEn,nameKo,nameVi}=normalizeLocalizedName(body),data={nameEn,nameKo,nameVi},nameKey=nameEn.normalize('NFKC').trim().toLocaleLowerCase();
  res.json(await db.$transaction(async(tx:any)=>{
   if(!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}}))throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
   if(!await tx.transactionCode.findFirst({where:{ownerOrgId:orgId,baseId,isActive:true}}))fail('INVALID_EXPENSE_CODE_BASE');
   await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
   const existing=await tx.codeItemType.findUnique({where:{orgId_baseId_nameKey:{orgId,baseId,nameKey}}});
   return existing??tx.codeItemType.create({data:{...data,nameKey,orgId,baseId,createdByEmployeeId:actorId}});
  }));
 });
}
