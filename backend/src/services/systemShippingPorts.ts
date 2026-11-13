import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
async function actor(db:any,email:string){const row=await db.systemUser.findUnique({where:{email},select:{id:true,systemRole:true}});if(row?.systemRole!=='SYSTEM_ADMIN')fail('SYSTEM_ADMIN_REQUIRED',403);return row;}
const usage=`EXISTS(SELECT 1 FROM "FreightJob" j WHERE j."originPortCode"=p.code OR j."destinationPortCode"=p.code)`;
export async function listSystemShippingPorts(db:any,email:string,input:any){
 await actor(db,email);const q=String(input.q||'').trim(),page=Number(input.page||0),state=input.state||'ALL';
 if(q.length>160||!Number.isSafeInteger(page)||page<0||page>100000||!['ALL','ACTIVE','INACTIVE','DELETED'].includes(state))fail('SHIPPING_INVALID');
 const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%',where=`(p.code ILIKE $1 OR p.name ILIKE $1 OR p."asciiName" ILIKE $1 OR p.country ILIKE $1) AND ($2='ALL' AND p."deletedAt" IS NULL OR $2='ACTIVE' AND p."isActive" AND p."deletedAt" IS NULL OR $2='INACTIVE' AND NOT p."isActive" AND p."deletedAt" IS NULL OR $2='DELETED' AND p."deletedAt" IS NOT NULL)`;
 const [rows,counts]=await Promise.all([
  db.$queryRawUnsafe(`SELECT p.code,p.name,p."asciiName",p.country,p.iata,p."sourceVersion",p."isActive",p.version,p."deletedAt",${usage} AS "inUse" FROM "ShippingPort" p WHERE ${where} ORDER BY p.country,p.name,p.code LIMIT 50 OFFSET $3`,pattern,state,page*50),
  db.$queryRawUnsafe(`SELECT count(*)::int AS total FROM "ShippingPort" p WHERE ${where}`,pattern,state),
 ]);
 return {rows,total:counts[0].total,page};
}
export async function changeSystemShippingPort(db:any,email:string,code:string,input:any){
 if(!/^[A-Z]{2}[A-Z0-9]{3}$/.test(code)||!input||Object.keys(input).some(key=>!['action','version','clientKey'].includes(key))||!['ACTIVATE','DEACTIVATE','DELETE','RESTORE'].includes(input.action)||!Number.isSafeInteger(input.version)||input.version<1||typeof input.clientKey!=='string'||!/^[-\w]{8,80}$/.test(input.clientKey))fail('SHIPPING_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  const user=await actor(tx,email),hash=createHash('sha256').update(JSON.stringify({code,action:input.action,version:input.version})).digest('hex');
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text','shipping-port:'+input.clientKey);
  const receipt=(await tx.$queryRawUnsafe('SELECT * FROM "ShippingPortChange" WHERE "clientKey"=$1',input.clientKey))[0];
  if(receipt){if(receipt.actorId!==user.id||receipt.requestHash!==hash)fail('SHIPPING_PORT_CHANGED',409);return receipt.after;}
  const before=(await tx.$queryRawUnsafe('SELECT * FROM "ShippingPort" WHERE code=$1 FOR UPDATE',code))[0];if(!before)fail('SHIPPING_PORT_NOT_FOUND',404);
  if(before.version!==input.version)fail('SHIPPING_PORT_CHANGED',409);
  const remove=input.action==='DELETE',restore=input.action==='RESTORE';
  if(restore?!before.deletedAt:!!before.deletedAt)fail('SHIPPING_PORT_CHANGED',409);
  if(remove&&(await tx.$queryRawUnsafe('SELECT '+usage+' AS used FROM "ShippingPort" p WHERE code=$1',code))[0].used)fail('SHIPPING_PORT_IN_USE',409);
  const after=(await tx.$queryRawUnsafe('UPDATE "ShippingPort" SET "isActive"=$2,"deletedAt"=CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END,version=version+1,"updatedBySystemUserId"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE code=$1 RETURNING *',code,input.action==='ACTIVATE'||restore,remove,user.id))[0];
  await tx.$executeRawUnsafe('INSERT INTO "ShippingPortChange"("clientKey","requestHash",code,version,"actorId",action,"before","after") VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',input.clientKey,hash,code,after.version,user.id,input.action,JSON.stringify(before),JSON.stringify(after));
  return after;
 });
}
export function registerSystemShippingPortRoutes(app:any,db:any,gates:any){
 app.get('/system/shipping-ports',async(req:any,res:any)=>{const user=await gates.requireSystemAdmin(req,res);if(user)res.json(await listSystemShippingPorts(db,user.requesterEmail,req.query));});
 app.put('/system/shipping-ports/:code',async(req:any,res:any)=>{const user=await gates.requireSystemAdmin(req,res);if(user)res.json(await changeSystemShippingPort(db,user.requesterEmail,req.params.code,req.body));});
}
