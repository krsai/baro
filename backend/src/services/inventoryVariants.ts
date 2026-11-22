import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {systemMaterialOptions,resolveSystemMaterialMaster} from './materialItems';
import {materialOwnerScope,MATERIAL_OWNER_SELECT} from './materialOwner';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const inputMode=(value:any)=>value==='REQUIRED'?'REQUIRED':value==='OPTIONAL'?'OPTIONAL':'HIDDEN';
const requirements=(base:any)=>{const settings=base.materialSettings??{},inputs=settings.masterInputs;return {type:inputMode(inputs===undefined?base.attributeInputs?.type:inputs.type),color:'HIDDEN'};};
export function registerInventoryVariantRoutes(app:any,db:any,access:any){
 app.get('/material-items/variant-options',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  const baseId=Number(req.query.baseId);if(!Number.isSafeInteger(baseId)||baseId<=0)fail('INVALID_MATERIAL_CODE');
  const [master]=await systemMaterialOptions(db,scope.orgId,baseId);if(!master)fail('INVALID_MATERIAL_CODE');
  const base=await db.transactionCodeBase.findUnique({where:{id:master.baseId}});
  res.json({master,fields:requirements(base),colors:[]});
 });
 for(const method of ['post','put','delete'])app[method]('/material-items/variants'+(method==='post'?'':'/:id'),async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  const {orgId,actorId}=scope,body=req.body||{},id=method==='post'?body.clientKey:String(req.params.id);
  if(typeof id!=='string'||!/^[\w-]{8,100}$/.test(id)||method!=='post'&&(!Number.isSafeInteger(body.revision)||body.revision<1)||method==='post'&&(!Number.isSafeInteger(body.baseId)||body.baseId<=0)||method!=='delete'&&(!Number.isSafeInteger(body.ownerId)||body.ownerId<=0||['typeId','colorId'].some(key=>body[key]!=null&&(!Number.isSafeInteger(body[key])||body[key]<=0))))fail('VARIANT_INVALID');
  try{const result=await db.$transaction(async(tx:any)=>{
   return writeInventoryVariant(tx,scope,body,method,id);
  },{isolationLevel:'Serializable'});res.json(result);}catch(error:any){if(error.code==='P2002'||error.meta?.code==='23505')fail('VARIANT_DUPLICATE',409);throw error;}
 });
}

export async function writeInventoryVariant(tx:any,scope:any,body:any,method:string,id:string){
 const {orgId,actorId}=scope;
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
   if(!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}}))fail('ACTIVE_EMPLOYEE_REQUIRED',403);
   await tx.$queryRaw`SELECT set_config('baro.variant_actor',${String(actorId)},true)`;
   const [old]=await tx.$queryRaw`SELECT * FROM "InventoryVariant" WHERE id=${id} AND "orgId"=${orgId} FOR UPDATE`;
   if(old&&(method==='put'||method==='delete')&&(await tx.$queryRaw`SELECT "variantId" AS id FROM "InventoryStockItem" WHERE "orgId"=${orgId} AND ("variantId"=${id} OR "definitionId"=${id}) UNION ALL SELECT id FROM "PartnerTransactionCost" WHERE "orgId"=${orgId} AND "materialVariantId"=${id} UNION ALL SELECT id FROM "MaterialRegistrationRequest" WHERE "orgId"=${orgId} AND "resultVariantId"=${id} UNION ALL SELECT id FROM "BankLedgerEntry" WHERE "orgId"=${orgId} AND "materialVariantId"=${id} LIMIT 1`).length)fail('VARIANT_IN_USE',409);
   if(method==='delete'){
    if(!old){const [prior]=await tx.$queryRaw`SELECT id FROM "InventoryVariantEvent" WHERE "orgId"=${orgId} AND "originalId"=${id} AND action='DELETE' AND "actorId"=${actorId} AND revision=${body.revision+1}`;if(prior)return {deleted:true};fail('VARIANT_NOT_FOUND',404);}
    if(old.revision!==body.revision)fail('VARIANT_CHANGED',409);
    if((await tx.$queryRaw`SELECT id FROM "InventoryMovement" WHERE "orgId"=${orgId} AND "variantId"=${id} LIMIT 1`).length)fail('VARIANT_IN_USE',409);
    await tx.$executeRaw`DELETE FROM "InventoryVariant" WHERE id=${id} AND "orgId"=${orgId}`;return {deleted:true};
   }
   if(method==='put'&&!old)fail('VARIANT_NOT_FOUND',404);
   if(method==='post'&&!old&&(await tx.$queryRaw`SELECT id FROM "InventoryVariantEvent" WHERE "orgId"=${orgId} AND "originalId"=${id} LIMIT 1`).length)fail('VARIANT_CHANGED',409);
   const baseId=method==='put'?old.baseId:body.baseId;
   const [option]=await systemMaterialOptions(tx,orgId,baseId);if(!option)fail('INVALID_MATERIAL_CODE');
   const master=method==='put'?await tx.materialItem.findFirst({where:{id:old.masterId,orgId}}):String(body.masterId).startsWith('system:')?await resolveSystemMaterialMaster(tx,orgId,body.masterId,true,actorId):await tx.materialItem.findFirst({where:{id:body.masterId,orgId,baseId,unitId:option.unitId}});
   if(!master||master.baseId!==baseId)fail('VARIANT_CHANGED',409);
   const owner=Number.isSafeInteger(body.ownerId)?await tx.organization.findFirst({where:{AND:[materialOwnerScope(orgId),{id:body.ownerId}]},select:MATERIAL_OWNER_SELECT}):null;
   const type=body.typeId==null?null:await tx.codeItemType.findFirst({where:{id:body.typeId,orgId,baseId}}),color=body.colorId==null?null:await tx.attrColor.findUnique({where:{id:body.colorId}});
   if(!owner||body.typeId!=null&&!type||body.colorId!=null&&!color)fail('VARIANT_INVALID');
   const base=await tx.transactionCodeBase.findUnique({where:{id:baseId}}),fields=requirements(base);
   if(fields.type==='REQUIRED'&&!type||fields.color==='REQUIRED'&&!color)fail('VARIANT_INVALID');
   if(fields.type==='HIDDEN'&&type&&type.id!==old?.attributes?.type?.id||fields.color==='HIDDEN'&&color&&color.id!==old?.attributes?.color?.id)fail('VARIANT_INVALID');
   const dimensions=old?.attributes?.dimensions||{},attributes={owner,type,color,dimensions};
   const identity=createHash('sha256').update(JSON.stringify([owner.id,color?.id??null,type?.id??null,dimensions])).digest('hex');
   if(old){
    if(old.identity===identity&&(method==='post'||old.revision===body.revision+1)&&old.managed)return {id,revision:old.revision};
    if(method==='post'||old.revision!==body.revision)fail('VARIANT_CHANGED',409);
    if((await tx.$queryRaw`SELECT id FROM "InventoryMovement" WHERE "orgId"=${orgId} AND "variantId"=${id} LIMIT 1`).length)fail('VARIANT_IN_USE',409);
    await tx.$executeRaw`UPDATE "InventoryVariant" SET "ownerId"=${owner.id},"typeId"=${type?.id??null},"colorId"=${color?.id??null},attributes=${JSON.stringify(attributes)}::jsonb,identity=${identity},managed=true,revision=revision+1 WHERE id=${id} AND "orgId"=${orgId}`;
    return {id,revision:old.revision+1};
   }
   await tx.$executeRaw`INSERT INTO "InventoryVariant" (id,"orgId","masterId","baseId","ownerId","typeId","colorId",attributes,identity,managed) VALUES (${id},${orgId},${master.id},${baseId},${owner.id},${type?.id??null},${color?.id??null},${JSON.stringify(attributes)}::jsonb,${identity},true)`;
   return {id,revision:1};
}
