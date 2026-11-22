import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
export async function stockColorVariant(tx:any,orgId:number,selected:any,colorId:any,fields:any){
 if(colorId==null){if(fields.color==='REQUIRED'&&!selected.colorId)fail('STOCK_COLOR_REQUIRED');return selected.id;}
 if(!Number.isSafeInteger(colorId)||fields.color==='HIDDEN')fail('STOCK_COLOR_INVALID');
 const color=await tx.attrColor.findUnique({where:{id:colorId}});if(!color)fail('STOCK_COLOR_INVALID');
 if(selected.colorId===colorId)return selected.id;
 if(selected.colorId!=null)fail('STOCK_COLOR_INVALID');
 const attributes={...selected.attributes,color};
 const identity=createHash('sha256').update(JSON.stringify([selected.ownerId,colorId,selected.typeId,selected.attributes.dimensions||{}])).digest('hex');
 const [existing]=await tx.$queryRaw`SELECT * FROM "InventoryVariant" WHERE "orgId"=${orgId} AND "masterId"=${selected.masterId} AND identity=${identity} FOR UPDATE`;
 const id=existing?.id||randomUUID();
 if(!existing)await tx.$executeRaw`INSERT INTO "InventoryVariant"(id,"orgId","masterId","baseId","ownerId","typeId","colorId",attributes,identity) VALUES(${id},${orgId},${selected.masterId},${selected.baseId},${selected.ownerId},${selected.typeId},${colorId},${JSON.stringify(attributes)}::jsonb,${identity})`;
 // A historical independently registered colored item is not silently merged.
 if(existing?.managed)fail('STOCK_COLOR_EXISTING_ITEM',409);
 const [link]=await tx.$queryRaw`SELECT "definitionId" FROM "InventoryStockItem" WHERE "orgId"=${orgId} AND "variantId"=${id}`;
 if(link&&link.definitionId!==selected.id)fail('STOCK_COLOR_EXISTING_ITEM',409);
 if(!link)await tx.$executeRaw`INSERT INTO "InventoryStockItem"("orgId","variantId","definitionId") VALUES(${orgId},${id},${selected.id})`;
 return id;
}
export function registerStockColorRoutes(app:any,db:any,access:any){
 app.post('/inventory-entry/color-transfers',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_STOCK');if(!scope)return;
  const {orgId,actorId}=scope,b=req.body||{};
  if(typeof b.clientKey!=='string'||!/^[-\w]{8,100}$/.test(b.clientKey)||typeof b.sourceId!=='string'||!Number.isSafeInteger(b.revision)||typeof b.quantity!=='string'||!/^\d{1,16}(\.\d{1,4})?$/.test(b.quantity)||Number(b.quantity)<=0)fail('STOCK_COLOR_INVALID');
  const hash=createHash('sha256').update(JSON.stringify(b)).digest('hex');
  const saved=await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
   if(!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}}}))fail('ACTIVE_EMPLOYEE_REQUIRED',403);
   await tx.$queryRaw`SELECT set_config('baro.inventory_actor',${String(actorId)},true)`;
   const [prior]=await tx.$queryRaw`SELECT id,"requestHash","actorId" FROM "InventoryColorTransfer" WHERE "orgId"=${orgId} AND "clientKey"=${b.clientKey}`;
   if(prior){if(prior.requestHash!==hash||prior.actorId!==actorId)fail('INVENTORY_RETRY_MISMATCH',409);return {id:prior.id};}
   const [source]=await tx.$queryRaw`SELECT * FROM "InventoryVariant" WHERE "orgId"=${orgId} AND id=${b.sourceId} FOR UPDATE`;
   if(!source||source.revision!==b.revision||source.colorId!=null)fail('VARIANT_CHANGED',409);
   const base=await tx.transactionCodeBase.findFirst({where:{id:source.baseId,isActive:true}});
   if(!base?.materialSettings?.enabled)fail('STOCK_COLOR_INVALID');
   const fields={color:base.materialSettings.masterInputs?.color??base.materialSettings.colorInput??'HIDDEN'};
   const targetId=await stockColorVariant(tx,orgId,source,b.colorId,fields);
   if(targetId===source.id)fail('STOCK_COLOR_INVALID');
   const id=randomUUID();
   await tx.$executeRaw`INSERT INTO "InventoryColorTransfer"(id,"orgId","sourceId","targetId",quantity,"actorId","clientKey","requestHash") VALUES(${id},${orgId},${source.id},${targetId},${b.quantity}::numeric,${actorId},${b.clientKey},${hash})`;
   return {id};
  },{isolationLevel:'Serializable'}).catch((error:any)=>{
   const message=String(error.meta?.message||error.message||'');
   const code=['STOCK_COLOR_BALANCE_CHANGED','STOCK_COLOR_APPROVAL_PENDING','STOCK_COLOR_INVALID','STOCK_COLOR_DISABLED'].find(code=>message.includes(code));
   if(code)fail(code,409);throw error;
  });
  res.json(saved);
 });
 app.get('/inventory-entry/color-transfers',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_STOCK');if(!scope)return;
  res.json(await db.$queryRaw`SELECT t.id,t."sourceId",t."targetId",t.quantity::text,t."createdAt",e.name AS "actorName",v.attributes FROM "InventoryColorTransfer" t JOIN "InventoryVariant" v ON v.id=t."targetId" AND v."orgId"=t."orgId" JOIN "Employee" e ON e.id=t."actorId" AND e."orgId"=t."orgId" WHERE t."orgId"=${scope.orgId} ORDER BY t."createdAt" DESC LIMIT 200`);
 });
}
