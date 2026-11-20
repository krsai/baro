import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {resolveSystemMaterialMaster}=require('../../backend/dist/services/materialItems');
export async function seedExpenseVariant(db,seed,masterId,actorId=seed.people.admin.id){
 return db.$transaction(async tx=>{
  const org=seed.company.id;
  const master=masterId.startsWith('system:')?await resolveSystemMaterialMaster(tx,org,masterId,true,actorId):await tx.materialItem.findFirst({where:{id:masterId,orgId:org}});
  let [variant]=await tx.$queryRaw`SELECT id,revision FROM "InventoryVariant" WHERE "orgId"=${org} AND "masterId"=${master.id} AND "ownerId"=${org} ORDER BY id LIMIT 1`;
  if(!variant){
   const owner=await tx.organization.findUnique({where:{id:org},select:{id:true,name:true,code:true}}),dimensions={};
   const identity=createHash('sha256').update(JSON.stringify([org,null,null,dimensions])).digest('hex'),id=randomUUID();
   await tx.$queryRaw`SELECT set_config('baro.variant_actor',${String(actorId)},true)`;
   await tx.$executeRaw`INSERT INTO "InventoryVariant"(id,"orgId","masterId","baseId","ownerId",attributes,identity,managed) VALUES(${id},${org},${master.id},${master.baseId},${org},${JSON.stringify({owner,type:null,color:null,dimensions})}::jsonb,${identity},true)`;
   variant={id,revision:1};
  }
  return {materialItemId:master.id,materialVariantId:variant.id,materialVariantRevision:variant.revision};
 });
}
