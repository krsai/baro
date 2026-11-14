import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {scopedParty} from './freightOperations';
const fail=(code='SHIPPING_INVALID',status=400):never=>{throw createHttpError(status,code);};
const clean=(value:any,max:number)=>{if(typeof value!=='string'||value.length>max)fail();return value.trim();};
async function bucket(db:any,scope:any,customerId:number){
 if(!Number.isSafeInteger(customerId))fail();
 if(scope.org.type==='SERVICE')await scopedParty(db,scope.orgId,customerId);
 else if(customerId!==scope.orgId)fail('SHIPPING_ACCESS_DENIED',403);
}
export function presetFields(kind:string,value:any,partyId:number|null=null){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const keys=kind==='PARTY'?{...(partyId==null?{name:200}:{}),address:1000,contactName:320,phone:320,email:320}:kind==='LOCATION'?{address:160,contactName:320,phone:320}:fail();
 const data:any={};for(const [key,max] of Object.entries(keys))data[key]=clean(value[key]??'',max);
 if(kind==='LOCATION'&&!data.address)fail();return data;
}
export async function listShippingPresets(db:any,scope:any,customerId:number,kind:string){
 await bucket(db,scope,customerId);if(!['PARTY','LOCATION'].includes(kind))fail();
 return db.$queryRawUnsafe('SELECT id,label,kind,data,"partyId",version FROM "ShippingPreset" WHERE "orgId"=$1 AND "customerId"=$2 AND kind=$3 AND "deletedAt" IS NULL ORDER BY label,id',scope.orgId,customerId,kind);
}
export async function saveShippingPreset(db:any,scope:any,input:any,remove=false){
 return retryEditTransaction(db,async(tx:any)=>{
  await bucket(tx,scope,input.customerId);
  if(typeof input.id!=='string'||!/^[-\w]{8,80}$/.test(input.id))fail();
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',scope.orgId);
  const old=(await tx.$queryRawUnsafe('SELECT * FROM "ShippingPreset" WHERE id=$1',input.id))[0];
  if(old&&(old.orgId!==scope.orgId||old.customerId!==input.customerId))fail('SHIPPING_NOT_FOUND',404);
  if(remove&&!old)fail('SHIPPING_NOT_FOUND',404);
  if(remove&&old.deletedAt)return {id:old.id,version:old.version};
  const partyId=remove?old.partyId:input.partyId??null;
  if(partyId!=null){if(!Number.isSafeInteger(partyId))fail();if(partyId!==scope.orgId)await scopedParty(tx,scope.orgId,partyId);}
  const kind=remove?old.kind:input.kind,data=remove?old.data:presetFields(kind,input.data,partyId),label=remove?old.label:clean(input.label,200);
  if(!label)fail();
  if(!remove&&old&&!old.deletedAt&&old.partyId===partyId&&old.kind===kind&&old.label===label&&JSON.stringify(presetFields(kind,old.data,partyId))===JSON.stringify(data))return old;
  if(old&&(old.deletedAt||old.version!==input.version))fail('SHIPPING_CHANGED',409);
  const rows=old?await tx.$queryRawUnsafe('UPDATE "ShippingPreset" SET label=$1,data=$2::jsonb,"deletedAt"=$3,version=version+1,"updatedByEmployeeId"=$4,"updatedAt"=CURRENT_TIMESTAMP,"partyId"=$6 WHERE id=$5 RETURNING *',label,JSON.stringify(data),remove?new Date():null,scope.actorId,input.id,partyId):await tx.$queryRawUnsafe('INSERT INTO "ShippingPreset"(id,"orgId","customerId",kind,label,data,"partyId","createdByEmployeeId","updatedByEmployeeId") VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8) RETURNING *',input.id,scope.orgId,input.customerId,kind,label,JSON.stringify(data),partyId,scope.actorId);
  await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,\'shipping-presets\',$3,$4,$5,$6::jsonb,$7::jsonb)',randomUUID(),scope.orgId,input.id,rows[0].version,scope.actorId,old?JSON.stringify(old):null,JSON.stringify(rows[0]));
  return rows[0];
 });
}
