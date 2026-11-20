import {createHash,randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {materialOwnerScope,MATERIAL_OWNER_SELECT} from './materialOwner';

const invalid=()=>createHttpError(400,'INVALID_INVENTORY_MOVEMENT');
const axes=['length','width','height'];
const quantityPattern=/^-?\d{1,16}(\.\d{1,4})?$/;
const digest=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modes=(base:any)=>({
 dimensions:false,
 color:base.materialSettings?.masterInputs?.color??base.materialSettings?.colorInput??'HIDDEN',
 type:base.materialSettings?.masterInputs?.type??base.attributeInputs?.type??'HIDDEN',
});
const masterOptions=(db:any,orgId:number)=>db.materialItem.findMany({where:{orgId},orderBy:{createdAt:'asc'}});
async function readMaster(db:any,orgId:number,id:string){
 const master=await db.materialItem.findFirst({where:{id,orgId}});
 if(!master)throw invalid();
 const base=await db.transactionCodeBase.findFirst({where:{id:master.baseId,isActive:true}});
 if(!base?.materialSettings?.enabled)throw invalid();
 return {master,fields:modes(base)};
}

export function registerInventoryMovementRoutes(app:any,db:any,access:any){
 app.get('/inventory-entry/masters',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  const masters=await masterOptions(db,scope.orgId);
  const active=await db.transactionCodeBase.findMany({where:{id:{in:masters.map((row:any)=>row.baseId)},isActive:true,materialSettings:{path:['enabled'],equals:true}},select:{id:true}});
  const activeIds=new Set(active.map((row:any)=>row.id));
  const sharedBaseIds=new Set(masters.filter((row:any)=>row.data.sharedMaster).map((row:any)=>row.baseId));
  const unique=new Map<string,any>();
  for(const row of masters){
   if(!activeIds.has(row.baseId)||(!row.data.sharedMaster&&sharedBaseIds.has(row.baseId)))continue;
   const key=row.baseId+':'+row.unitId;
   if(!unique.has(key))unique.set(key,row);
  }
  res.json([...unique.values()]);
 });
 app.get('/inventory-entry/options',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  const {orgId}=scope,{master,fields}=await readMaster(db,orgId,String(req.query.masterId||''));
  const [variants,owners,colors,types]=await Promise.all([
   db.$queryRaw`SELECT id,attributes FROM "InventoryVariant" WHERE "orgId"=${orgId} AND "masterId"=${master.id} ORDER BY id`,
   db.organization.findMany({where:materialOwnerScope(orgId),select:MATERIAL_OWNER_SELECT,orderBy:{name:'asc'}}),
   fields.color!=='HIDDEN'?db.attrColor.findMany({orderBy:{code:'asc'}}):[],
   fields.type!=='HIDDEN'?db.codeItemType.findMany({where:{orgId,baseId:master.baseId},orderBy:{id:'asc'}}):[],
  ]);
  res.json({fields,variants,owners,colors,types});
 });
 app.post('/inventory-entry',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  const {orgId,actorId}=scope,body=req.body??{};
  if(typeof body.clientKey!=='string'||!/^[\w-]{8,100}$/.test(body.clientKey)||typeof body.masterId!=='string'||typeof body.quantity!=='string'||!quantityPattern.test(body.quantity)||Number(body.quantity)===0||!/^\d{4}-\d{2}-\d{2}$/.test(body.date||'')||typeof body.remark!=='string'||body.remark.length>500)throw invalid();
  const date=new Date(body.date+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==body.date||date.getUTCFullYear()<1900)throw invalid();
  const hash=digest(body);
  const result=await db.$transaction(async(tx:any)=>{
   // Serialize company stock writes so retries and simultaneous variant creation reuse one identity.
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
   const [prior]=await tx.$queryRaw`SELECT id,"actorId","requestHash" FROM "InventoryMovement" WHERE "orgId"=${orgId} AND "clientKey"=${body.clientKey}`;
   if(prior){
    if(prior.actorId!==actorId||prior.requestHash!==hash)throw createHttpError(409,'INVENTORY_RETRY_MISMATCH');
    return {id:prior.id};
   }
   const {master,fields}=await readMaster(tx,orgId,body.masterId);
   let variantId=body.variantId;
   if(variantId){
    if(typeof variantId!=='string'||!(await tx.$queryRaw`SELECT id FROM "InventoryVariant" WHERE id=${variantId} AND "orgId"=${orgId} AND "masterId"=${master.id}`).length)throw invalid();
   }else{
    if(!Number.isSafeInteger(body.ownerId)||body.ownerId<=0)throw invalid();
    const owner=await tx.organization.findFirst({where:{AND:[materialOwnerScope(orgId),{id:body.ownerId}]},select:MATERIAL_OWNER_SELECT});
    if(!owner)throw invalid();
    const colorId=body.colorId??null,typeId=body.typeId??null;
    if((fields.color==='REQUIRED'&&!colorId)||(fields.color==='HIDDEN'&&colorId)||(fields.type==='REQUIRED'&&!typeId)||(fields.type==='HIDDEN'&&typeId))throw invalid();
    if((colorId!==null&&!Number.isSafeInteger(colorId))||(typeId!==null&&!Number.isSafeInteger(typeId)))throw invalid();
    const color=colorId?await tx.attrColor.findUnique({where:{id:colorId}}):null;
    const type=typeId?await tx.codeItemType.findFirst({where:{id:typeId,orgId,baseId:master.baseId}}):null;
    if(colorId&&!color||typeId&&!type)throw invalid();
    const dimensions:Record<string,string>={};
    if(fields.dimensions)for(const axis of axes){
     const value=body.dimensions?.[axis];
     if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,4})?$/.test(value)||Number(value)<=0)throw invalid();
     dimensions[axis]=new Prisma.Decimal(value).toString();
    }
    const identity=digest([owner.id,colorId,typeId,dimensions]);
    const [existing]=await tx.$queryRaw`SELECT id FROM "InventoryVariant" WHERE "orgId"=${orgId} AND "masterId"=${master.id} AND identity=${identity}`;
    variantId=existing?.id??randomUUID();
    if(!existing)await tx.$executeRaw`INSERT INTO "InventoryVariant" (id,"orgId","masterId","baseId","ownerId","colorId","typeId",attributes,identity)
     VALUES (${variantId},${orgId},${master.id},${master.baseId},${owner.id},${colorId},${typeId},${JSON.stringify({owner,color,type,dimensions})}::jsonb,${identity})`;
   }
   const id=randomUUID();
   await tx.$executeRaw`INSERT INTO "InventoryMovement" (id,"orgId","variantId","actorId","clientKey","requestHash","movementDate",quantity,remark)
    VALUES (${id},${orgId},${variantId},${actorId},${body.clientKey},${hash},${body.date}::date,${body.quantity}::numeric,${body.remark.trim()})`;
   return {id};
  });
  res.status(201).json(result);
 });
 app.get('/inventory-entry/history',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  res.json(await db.$queryRaw`SELECT m.id,m."movementDate"::text AS date,m.quantity::text,m.remark,v.attributes,i.data AS master
   FROM "InventoryMovement" m JOIN "InventoryVariant" v ON v.id=m."variantId"
   JOIN "MaterialItem" i ON i.id=v."masterId" WHERE m."orgId"=${scope.orgId} ORDER BY m."movementDate" DESC,m."createdAt" DESC`);
 });
 app.get('/inventory-entry/stock',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_STOCK');if(!scope)return;
  res.json(await db.$queryRaw`SELECT v.id,v.attributes,i.data AS master,SUM(m.quantity)::text AS quantity
   FROM "InventoryVariant" v JOIN "MaterialItem" i ON i.id=v."masterId" JOIN "InventoryMovement" m ON m."variantId"=v.id
   WHERE v."orgId"=${scope.orgId} GROUP BY v.id,i.id ORDER BY v.id`);
 });
}
