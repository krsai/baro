import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {Prisma} from '@prisma/client';
import {effectiveExpenseCode} from './expenseCodeLinkPolicy';
import {prepareCodeItemAttributes} from './codeItemAttributes';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
import {validLocalizedName,normalizeLocalizedName} from '../utils/localizedName';
import {materialMasterCode} from './materialCodeSettings';

const fail=(code:string):never=>{throw createHttpError(400,code);};
export const materialSnapshot=(row:any)=>({id:row.id,baseId:row.baseId,industryId:row.industryId,unitId:row.unitId,...row.data});
export async function prepareMaterialSelection(tx:any,orgId:number,code:any,body:any,previous?:any){
 const id=body.materialItemId===undefined?previous?.materialItemId??null:body.materialItemId||null;
 if(previous?.transactionCodeId===code.id&&!previous.materialItemId&&!id)return {};
 if(previous?.transactionCodeId===code.id&&id===(previous.materialItemId??null))return id?{materialItemId:id,materialItemSnapshot:previous.materialItemSnapshot}:{};
 if(!id){if(code.base?.materialSettings?.enabled)fail('MATERIAL_ITEM_REQUIRED');return previous?.materialItemId?{materialItemId:null,materialItemSnapshot:Prisma.DbNull}:{};}
 if(typeof id!=='string'||id.length>100)fail('INVALID_MATERIAL_ITEM');
 const row=await tx.materialItem.findFirst({where:{id,orgId,baseId:code.baseId}});
 if(!row||!code.base?.materialSettings?.enabled)fail('INVALID_MATERIAL_ITEM');
 return {materialItemId:id,materialItemSnapshot:materialSnapshot(row)};
}
export async function prepareLedgerMaterial(tx:any,orgId:number,body:any,previous?:any){
 if((body.evidenceType||'FILE')!=='FILE'||body.counterparty?.kind==='ACCOUNT'){
  if(body.materialItemId)fail('INVALID_MATERIAL_ITEM');return {};
 }
 const code=body.accountingCodeId?await tx.transactionCode.findFirst({where:{id:body.accountingCodeId,ownerOrgId:orgId},include:{base:true}}):null;
 if(!code)return {};
 const historical=previous?.evidenceType==='FILE'&&previous.accountingCodeId===code.id?{...previous,transactionCodeId:previous.accountingCodeId}:undefined;
 return prepareMaterialSelection(tx,orgId,code,body,historical);
}
export async function registerMaterialItem(tx:any,orgId:number,actorId:number,body:any){
 const named=['nameEn','nameKo','nameVi'].some(key=>typeof body[key]==='string'&&body[key].trim());
 if(named&&!validLocalizedName(body,100)||['nameEn','nameKo','nameVi'].some(key=>body[key]!=null&&typeof body[key]!=='string')||typeof body.clientKey!=='string'||!/^[\w-]{8,100}$/.test(body.clientKey))fail('INVALID_MATERIAL_ITEM');
 if(!Number.isSafeInteger(body.baseId)||body.baseId<=0||!Number.isSafeInteger(body.unitId)||body.unitId<=0||body.colorId!=null&&(!Number.isSafeInteger(body.colorId)||body.colorId<=0))fail('INVALID_MATERIAL_ITEM');
 const requestHash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const previous=await tx.materialItem.findUnique({where:{orgId_clientKey:{orgId,clientKey:body.clientKey}}});
 if(previous){if(previous.requestHash!==requestHash||previous.createdByEmployeeId!==actorId)fail('MATERIAL_RETRY_MISMATCH');return previous;}
 // Match catalogue writers; key-share the company before the FK/audited-policy work.
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR KEY SHARE',orgId);
 await tx.$queryRawUnsafe('LOCK TABLE "TransactionCodeBase", "SettingTransactionCodeDefault", "TransactionCode" IN SHARE ROW EXCLUSIVE MODE');
 await tx.$queryRawUnsafe('SELECT id FROM "TransactionCodeBase" WHERE id=$1 FOR UPDATE',body.baseId);
 const base=await tx.transactionCodeBase.findFirst({where:{id:body.baseId,isActive:true},include:{industryLinks:{include:{industry:{include:{retirement:true}}}}}});
 const industry=base?.industryLinks.find((link:any)=>link.industry.isActive&&!link.industry.retirement&&link.industry.materialManagement)?.industry;
 if(!base||!industry||!base.materialSettings?.enabled)fail('INVALID_MATERIAL_CODE');
 if(body.materialRevision!==base.materialRevision||body.industryRevision!==industry.materialManagementRevision)throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
 const local=await tx.transactionCode.findFirst({where:{baseId:base.id,ownerOrgId:orgId,isActive:true},include:{base:true}});
 if(!local)fail('INVALID_MATERIAL_CODE');
 const policy=await tx.expenseCodeLinkPolicy.findUnique({where:{orgId_baseId:{orgId,baseId:base.id}}});
 if(body.policyAuditId!==(policy?.auditId??null))throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
 const code=materialMasterCode(effectiveExpenseCode(local,policy)),attributes=await prepareCodeItemAttributes(tx,orgId,body,code);
 const details:any={};for(const key of ['length','width','height'])if(body.details?.[key])details[key]=String(body.details[key]).trim();
 const dimensions=code.base.requiredFields?.includes('length');
 if(dimensions){for(const key of ['length','width','height'])if(!/^\d{1,12}(\.\d{1,4})?$/.test(details[key]||'')||Number(details[key])<=0)fail('INVALID_MATERIAL_DIMENSIONS');}
 else if(Object.keys(details).length)fail('INVALID_MATERIAL_DIMENSIONS');
 const unit=await tx.expenseUnit.findFirst({where:{id:body.unitId,isActive:true}});if(!unit)fail('INVALID_EXPENSE_UNIT');
 const color=body.colorId?await tx.attrColor.findUnique({where:{id:body.colorId}}):null;
 const colorMode=code.base.materialSettings?.colorInput??'HIDDEN';
 if(body.colorId&&!color||colorMode==='REQUIRED'&&!color||colorMode==='HIDDEN'&&color)fail('INVALID_MATERIAL_COLOR');
 const data={...normalizeLocalizedName(named?body:base),...attributes,details,unit,color,baseSnapshot:{id:base.id,code:base.code,nameKo:base.nameKo,nameEn:base.nameEn,nameVi:base.nameVi},industrySnapshot:{id:industry.id,nameKo:industry.nameKo,nameEn:industry.nameEn,nameVi:industry.nameVi},policyAuditId:policy?.auditId??null,inputSettings:{attributeInputs:code.base.attributeInputs??{},requiredFields:code.base.requiredFields,materialSettings:code.base.materialSettings},materialRevision:base.materialRevision,industryRevision:industry.materialManagementRevision};
 const identityDetails=Object.fromEntries(Object.entries(details).map(([key,value])=>[key,new Prisma.Decimal(value as string).toString()]));
 const identityKey=createHash('sha256').update(JSON.stringify({name:data.nameEn.toUpperCase(),owner:attributes.itemOwnerOrgId,customer:attributes.itemCustomerId,type:attributes.itemTypeId,unitId:unit.id,colorId:color?.id??null,details:identityDetails})).digest('hex');
 return tx.materialItem.create({data:{id:randomUUID(),orgId,baseId:base.id,industryId:industry.id,unitId:unit.id,ownerOrgId:attributes.itemOwnerOrgId??null,customerId:attributes.itemCustomerId??null,typeId:attributes.itemTypeId??null,colorId:color?.id??null,policyAuditId:policy?.auditId??null,data,identityKey,clientKey:body.clientKey,requestHash,createdByEmployeeId:actorId}});
}
export function registerMaterialItemRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,feature:string)=>{
  const scope=await gates.requireOrgRole(req,res,{allowedRoles:feature==='BANK_LEDGER'?['ADMIN','ACCOUNTANT']:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!scope)return null;
  const employee=await db.employee.findFirst({where:{id:gates.actorId(),orgId:scope.organization.id,status:'ACTIVE'}});
  const roles=feature==='BANK_LEDGER'?['ADMIN','ACCOUNTANT']:['ADMIN','OPERATOR','ACCOUNTANT'];
  if(!employee||!roles.includes(employee.orgRole)||!(await companyIndustryMenuFeatures(db,scope.organization.id,scope.organization.type)).includes(feature)||!await gates.canAccessCodeItems?.({orgType:scope.organization.type,orgRole:employee.orgRole,feature}))throw createHttpError(403,'FEATURE_ACCESS_DENIED');
  return {orgId:scope.organization.id,actorId:employee.id};
 };
 app.get('/material-items/options',async(req:any,res:any)=>{
  const scope=await access(req,res,req.query?.context==='LEDGER'?'BANK_LEDGER':'OUTSOURCING_RECORD');if(!scope)return;
  const baseId=Number(req.query.baseId);if(!Number.isSafeInteger(baseId)||baseId<=0)fail('INVALID_MATERIAL_CODE');
  res.json(await db.materialItem.findMany({where:{orgId:scope.orgId,baseId},orderBy:{createdAt:'desc'}}));
 });
 app.get('/material-items',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  res.json(await db.materialItem.findMany({where:{orgId:scope.orgId},orderBy:{createdAt:'desc'}}));
 });
 app.get('/material-items/catalogue',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  const codes=await db.transactionCode.findMany({where:{ownerOrgId:scope.orgId,isActive:true,base:{isActive:true}},include:{base:{include:{industryLinks:{include:{industry:{include:{retirement:true}}}}}}}});
  const policies=await db.expenseCodeLinkPolicy.findMany({where:{orgId:scope.orgId}});
 const seen=new Set();res.json({codes:codes.filter((code:any)=>code.base?.materialSettings?.enabled&&!seen.has(code.baseId)&&seen.add(code.baseId)).map((code:any)=>materialMasterCode(effectiveExpenseCode(code,policies.find((p:any)=>p.baseId===code.baseId)))),units:await db.expenseUnit.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}}),colors:await db.attrColor.findMany({orderBy:{code:'asc'}})});
 });
 app.post('/material-items',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  try{res.status(201).json(await db.$transaction((tx:any)=>registerMaterialItem(tx,scope.orgId,scope.actorId,req.body),{isolationLevel:'Serializable'}));}
  catch(error:any){if(error.code==='P2002')throw createHttpError(409,'MATERIAL_ITEM_DUPLICATE');throw error;}
 });
}
