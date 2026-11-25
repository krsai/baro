import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {Prisma} from '@prisma/client';
import {effectiveExpenseCode} from './expenseCodeLinkPolicy';
import {prepareCodeItemAttributes} from './codeItemAttributes';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
import {normalizeLocalizedName} from '../utils/localizedName';
import {registerInventoryMovementRoutes} from './inventoryMovements';
import {materialMasterCode} from './materialCodeSettings';
import {registerInventoryVariantRoutes} from './inventoryVariants';

const fail=(code:string):never=>{throw createHttpError(400,code);};
export const materialSnapshot=(row:any)=>({id:row.id,baseId:row.baseId,industryId:row.industryId,unitId:row.unitId,...row.data});
export async function prepareMaterialSelection(tx:any,orgId:number,code:any,body:any,previous?:any,actorId?:number){
 const id=body.materialItemId===undefined?previous?.materialItemId??null:body.materialItemId||null;
 const variantId=body.materialVariantId===undefined?previous?.materialItemSnapshot?.variantId??null:body.materialVariantId;
 const unchangedVariant=variantId===(previous?.materialItemSnapshot?.variantId??null);
 if(variantId&&!id)fail('INVALID_MATERIAL_ITEM');
 if(unchangedVariant&&variantId&&body.materialVariantRevision!=null&&body.materialVariantRevision!==previous?.materialItemSnapshot?.variantRevision)throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
 if(previous?.transactionCodeId===code.id&&!previous.materialItemId&&!id)return {};
 if(previous?.transactionCodeId===code.id&&id===(previous.materialItemId??null)&&unchangedVariant)return id?{materialItemId:id,materialItemSnapshot:previous.materialItemSnapshot}:{};
 if(!id){if(code.base?.materialSettings?.enabled)fail('MATERIAL_ITEM_REQUIRED');return previous?.materialItemId?{materialItemId:null,materialItemSnapshot:Prisma.DbNull}:{};}
 if(typeof id!=='string'||id.length>100)fail('INVALID_MATERIAL_ITEM');
 const row=id.startsWith('system:')?await resolveSystemMaterialMaster(tx,orgId,id,true,actorId):await tx.materialItem.findFirst({where:{id,orgId,baseId:code.baseId}});
 if(!row||row.baseId!==code.baseId||!code.base?.materialSettings?.enabled)fail('INVALID_MATERIAL_ITEM');
 if(body.materialVariantRequired||variantId){
  if(typeof variantId!=='string'||!Number.isSafeInteger(body.materialVariantRevision))fail('MATERIAL_ITEM_REQUIRED');
  const [variant]=await tx.$queryRaw`SELECT id,revision,attributes FROM "InventoryVariant" WHERE id=${variantId} AND "orgId"=${orgId} AND "masterId"=${row.id} AND "baseId"=${code.baseId} FOR SHARE`;
  if(!variant||variant.revision!==body.materialVariantRevision)throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
  const a=variant.attributes;
  return {materialItemId:row.id,materialItemSnapshot:{...materialSnapshot(row),variantId:variant.id,variantRevision:variant.revision,itemOwnerOrgId:a.owner.id,itemOwnerSnapshot:a.owner,itemTypeId:a.type?.id??null,itemAttributeSnapshot:{type:a.type??null},color:a.color??null,details:a.dimensions??{}}};
 }
 return {materialItemId:row.id,materialItemSnapshot:materialSnapshot(row)};
}
export async function prepareLedgerMaterial(tx:any,orgId:number,body:any,previous?:any){
 if((body.evidenceType||'FILE')!=='FILE'||body.counterparty?.kind==='ACCOUNT'){
  if(body.materialItemId)fail('INVALID_MATERIAL_ITEM');return {};
 }
 const code=body.accountingCodeId?await tx.transactionCode.findFirst({where:{id:body.accountingCodeId,ownerOrgId:orgId},include:{base:true}}):null;
 if(!code)return {};
 const historical=previous?.evidenceType==='FILE'&&previous.accountingCodeId===code.id?{...previous,transactionCodeId:previous.accountingCodeId}:undefined;
 return prepareMaterialSelection(tx,orgId,code,{...body,materialVariantRequired:true},historical);
}
export async function registerMaterialItem(tx:any,orgId:number,actorId:number,body:any,systemDefault=false){
 if(typeof body.clientKey!=='string'||!/^[\w-]{8,100}$/.test(body.clientKey))fail('INVALID_MATERIAL_ITEM');
 if(!Number.isSafeInteger(body.baseId)||body.baseId<=0||!Number.isSafeInteger(body.unitId)||body.unitId<=0||body.colorId!=null&&(!Number.isSafeInteger(body.colorId)||body.colorId<=0))fail('INVALID_MATERIAL_ITEM');
 const requestHash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const previous=await tx.materialItem.findUnique({where:{orgId_clientKey:{orgId,clientKey:body.clientKey}}});
 if(previous){if(previous.requestHash!==requestHash||previous.createdByEmployeeId!==actorId)fail('MATERIAL_RETRY_MISMATCH');return previous;}
 if(body.colorId!=null)fail('INVALID_MATERIAL_COLOR');
 if(body.itemOwnerOrgId!=null||body.itemTypeId!=null)fail('INVALID_MATERIAL_ITEM');
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
 const sharedMaster=body.sharedMaster===true;
 if(sharedMaster&&await tx.materialItem.findFirst({where:{orgId,baseId:base.id,...(systemDefault?{unitId:body.unitId}:{})},select:{id:true}}))throw createHttpError(409,'MATERIAL_ITEM_DUPLICATE');
 const dimensions=!sharedMaster&&code.base.requiredFields?.includes('length');
 if(dimensions){for(const key of ['length','width','height'])if(!/^\d{1,12}(\.\d{1,4})?$/.test(details[key]||'')||Number(details[key])<=0)fail('INVALID_MATERIAL_DIMENSIONS');}
 else if(Object.keys(details).length)fail('INVALID_MATERIAL_DIMENSIONS');
 if(sharedMaster&&base.materialUnitId!=null&&body.unitId!==base.materialUnitId)throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
 const unit=await tx.expenseUnit.findFirst({where:{id:body.unitId,isActive:true}});if(!unit)fail('INVALID_EXPENSE_UNIT');
 const data={...normalizeLocalizedName(base),...attributes,details,unit,color:null,...(sharedMaster?{sharedMaster}:{}),baseSnapshot:{id:base.id,code:base.code,nameKo:base.nameKo,nameEn:base.nameEn,nameVi:base.nameVi},industrySnapshot:{id:industry.id,nameKo:industry.nameKo,nameEn:industry.nameEn,nameVi:industry.nameVi},policyAuditId:policy?.auditId??null,inputSettings:{attributeInputs:code.base.attributeInputs??{},requiredFields:sharedMaster?[]:code.base.requiredFields,materialSettings:code.base.materialSettings},materialRevision:base.materialRevision,industryRevision:industry.materialManagementRevision};
 const identityDetails=Object.fromEntries(Object.entries(details).map(([key,value])=>[key,new Prisma.Decimal(value as string).toString()]));
 const identityKey=createHash('sha256').update(JSON.stringify({name:data.nameEn.toUpperCase(),owner:attributes.itemOwnerOrgId,customer:attributes.itemCustomerId,type:attributes.itemTypeId,unitId:unit.id,colorId:null,details:identityDetails})).digest('hex');
 return tx.materialItem.create({data:{id:randomUUID(),orgId,baseId:base.id,industryId:industry.id,unitId:unit.id,ownerOrgId:attributes.itemOwnerOrgId??null,customerId:attributes.itemCustomerId??null,typeId:attributes.itemTypeId??null,colorId:null,policyAuditId:policy?.auditId??null,data,identityKey,clientKey:body.clientKey,requestHash,createdByEmployeeId:actorId}});
}
// Read-only system references; a real company FK is created only by a business save.
export async function systemMaterialOptions(db:any,orgId:number,baseId?:number){
 const codes=await db.transactionCode.findMany({where:{ownerOrgId:orgId,isActive:true,...(baseId?{baseId}:{}),base:{isActive:true}},include:{base:{include:{industryLinks:{include:{industry:{include:{retirement:true}}}}}}}});
 const [units,existing]=await Promise.all([db.expenseUnit.findMany({where:{isActive:true}}),db.materialItem.findMany({where:{orgId,...(baseId?{baseId}:{})},orderBy:{createdAt:'asc'}})]);
 const seen=new Set();return codes.filter((code:any)=>!seen.has(code.baseId)&&seen.add(code.baseId)).flatMap((code:any)=>{
  const base=code.base,industry=base.industryLinks.find((link:any)=>link.industry.isActive&&!link.industry.retirement&&link.industry.materialManagement)?.industry,unit=units.find((u:any)=>u.id===base.materialUnitId);
  if(!base.materialSettings?.enabled||!industry||!unit)return [];
  const saved=existing.find((row:any)=>row.baseId===base.id&&row.unitId===unit.id&&row.data.sharedMaster)||existing.find((row:any)=>row.baseId===base.id&&row.unitId===unit.id);
  return [saved||{id:`system:${base.id}:${unit.id}:${base.materialRevision}`,orgId,baseId:base.id,industryId:industry.id,unitId:unit.id,data:{...normalizeLocalizedName(base),sharedMaster:true,unit,details:{},baseSnapshot:{id:base.id,code:base.code,...normalizeLocalizedName(base)},materialRevision:base.materialRevision,industryRevision:industry.materialManagementRevision}}];
 });
}
export async function resolveSystemMaterialMaster(db:any,orgId:number,id:string,write=false,actorId?:number){
 const match=/^system:([1-9]\d*):([1-9]\d*):(\d+)$/.exec(id);if(!match)return fail('INVALID_MATERIAL_ITEM');
 if(write){if(!Number.isSafeInteger(actorId)||!await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}}))throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');await db.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;}
 const [row]=await systemMaterialOptions(db,orgId,Number(match[1]));
 const base=await db.transactionCodeBase.findFirst({where:{id:Number(match[1]),isActive:true}});
 if(!row||base?.materialUnitId!==Number(match[2])||base.materialRevision!==Number(match[3]))throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
 if(!write||!row.id.startsWith('system:'))return row;
 const policy=await db.expenseCodeLinkPolicy.findUnique({where:{orgId_baseId:{orgId,baseId:row.baseId}}});
 return registerMaterialItem(db,orgId,actorId!,{clientKey:randomUUID(),baseId:row.baseId,unitId:row.unitId,sharedMaster:true,details:{},policyAuditId:policy?.auditId??null,materialRevision:base.materialRevision,industryRevision:row.data.industryRevision},true);
}
export function registerMaterialItemRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,feature:string)=>{
  const scope=await gates.requireOrgRole(req,res,{allowedRoles:feature==='BANK_LEDGER'?['ADMIN','ACCOUNTANT']:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!scope)return null;
  const employee=await db.employee.findFirst({where:{id:gates.actorId(),orgId:scope.organization.id,status:'ACTIVE'}});
  const roles=feature==='BANK_LEDGER'?['ADMIN','ACCOUNTANT']:['ADMIN','OPERATOR','ACCOUNTANT'];
  if(!employee||!roles.includes(employee.orgRole)||!(await companyIndustryMenuFeatures(db,scope.organization.id,scope.organization.type)).includes(feature)||!await gates.canAccessCodeItems?.({orgType:scope.organization.type,orgRole:employee.orgRole,feature}))throw createHttpError(403,'FEATURE_ACCESS_DENIED');
  return {orgId:scope.organization.id,actorId:employee.id};
 };
 registerInventoryMovementRoutes(app,db,access);
 registerInventoryVariantRoutes(app,db,access);
 app.get('/material-items/options',async(req:any,res:any)=>{
  const scope=await access(req,res,req.query?.context==='LEDGER'?'BANK_LEDGER':req.query?.context==='INVOICE'?'INVOICE':'OUTSOURCING_RECORD');if(!scope)return;
  const baseId=Number(req.query.baseId);if(!Number.isSafeInteger(baseId)||baseId<=0)fail('INVALID_MATERIAL_CODE');
  if(req.query.variants==='1'){
   const rows=await db.$queryRaw`SELECT i.id,i."baseId",i."industryId",i."unitId",i.data,v.id AS "variantId",v.revision AS "variantRevision",v.attributes FROM "InventoryVariant" v JOIN "MaterialItem" i ON i.id=v."masterId" AND i."orgId"=v."orgId" AND i."baseId"=v."baseId" WHERE v."orgId"=${scope.orgId} AND v."baseId"=${baseId} AND (${req.query?.context==='INVOICE'} OR NOT EXISTS(SELECT 1 FROM "InventoryStockItem" stock WHERE stock."orgId"=v."orgId" AND stock."variantId"=v.id)) ORDER BY v.id`;
   return res.json(rows.map((row:any)=>({...row,data:{...row.data,variantId:row.variantId,variantRevision:row.variantRevision,itemOwnerOrgId:row.attributes.owner.id,itemOwnerSnapshot:row.attributes.owner,itemTypeId:row.attributes.type?.id??null,itemAttributeSnapshot:{type:row.attributes.type??null},color:row.attributes.color??null,details:row.attributes.dimensions??{}}})));
  }
  const rows=await db.materialItem.findMany({where:{orgId:scope.orgId,baseId},orderBy:{createdAt:'desc'}});
  const defaults=req.query?.context==='LEDGER'?[]:await systemMaterialOptions(db,scope.orgId,baseId);
  res.json([...rows,...defaults.filter((row:any)=>!rows.some((saved:any)=>saved.id===row.id))]);
 });
 app.get('/material-items',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  res.json(await db.materialItem.findMany({where:{orgId:scope.orgId},orderBy:{createdAt:'desc'}}));
 });
 app.get('/material-items/variants',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  res.json(await db.$queryRaw`SELECT v.id,v."masterId",i."baseId",v."ownerId",v.revision,v.managed,i.data->'baseSnapshot' AS "baseSnapshot",EXISTS(SELECT 1 FROM "InventoryMovement" m WHERE m."orgId"=v."orgId" AND m."variantId"=v.id) OR EXISTS(SELECT 1 FROM "PartnerTransactionCost" c WHERE c."orgId"=v."orgId" AND c."materialVariantId"=v.id) OR EXISTS(SELECT 1 FROM "BankLedgerEntry" ledger WHERE ledger."orgId"=v."orgId" AND ledger."materialVariantId"=v.id) OR EXISTS(SELECT 1 FROM "InvoiceGeneralLine" invoice WHERE invoice."sellerOrgId"=v."orgId" AND invoice."materialVariantId"=v.id) OR EXISTS(SELECT 1 FROM "MaterialRegistrationRequest" registration WHERE registration."orgId"=v."orgId" AND registration."resultVariantId"=v.id) OR EXISTS(SELECT 1 FROM "InventoryStockItem" stock WHERE stock."orgId"=v."orgId" AND (stock."variantId"=v.id OR stock."definitionId"=v.id)) AS used,jsonb_build_object('owner',v.attributes->'owner','type',v.attributes->'type','color',v.attributes->'color','dimensions',v.attributes->'dimensions') AS attributes,i.data->'unit' AS unit
   FROM "InventoryVariant" v JOIN "MaterialItem" i ON i.id=v."masterId" AND i."orgId"=v."orgId" AND i."baseId"=v."baseId"
   WHERE v."orgId"=${scope.orgId} AND NOT EXISTS(SELECT 1 FROM "InventoryStockItem" stock WHERE stock."orgId"=v."orgId" AND stock."variantId"=v.id) ORDER BY i."baseId",v.id`);
 });
 app.get('/material-items/catalogue',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  const codes=await db.transactionCode.findMany({where:{ownerOrgId:scope.orgId,isActive:true,base:{isActive:true}},include:{base:{include:{industryLinks:{include:{industry:{include:{retirement:true}}}}}}}});
  const policies=await db.expenseCodeLinkPolicy.findMany({where:{orgId:scope.orgId}});
 const seen=new Set();res.json({codes:codes.filter((code:any)=>code.base?.materialSettings?.enabled&&code.base.industryLinks.some((link:any)=>link.industry.isActive&&!link.industry.retirement&&link.industry.materialManagement)&&!seen.has(code.baseId)&&seen.add(code.baseId)).map((code:any)=>materialMasterCode(effectiveExpenseCode(code,policies.find((p:any)=>p.baseId===code.baseId)))),units:await db.expenseUnit.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}})});
 });
 app.post('/material-items',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  try{res.status(201).json(await db.$transaction((tx:any)=>registerMaterialItem(tx,scope.orgId,scope.actorId,req.body),{isolationLevel:'Serializable'}));}
  catch(error:any){if(error.code==='P2002')throw createHttpError(409,'MATERIAL_ITEM_DUPLICATE');throw error;}
 });
}
