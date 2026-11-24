import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {freightForwarder} from './freightOperations';
const fail=(message:string,status=400):never=>{throw createHttpError(status,message);};

export async function linkedJobBills(db:any,orgId:number,jobId:string){
 return db.$queryRawUnsafe(`SELECT b.*,
  CASE WHEN b.kind='MASTER' THEN (SELECT count(*)::int FROM "FreightJobMaster" l WHERE l."masterBillId"=b.id AND l."orgId"=b."orgId" AND l."deletedAt" IS NULL) ELSE 0 END AS "linkedJobCount"
  FROM "FreightBill" b WHERE b."orgId"=$1 AND b."deletedAt" IS NULL AND
  (b.kind='HOUSE' AND b."jobId"=$2 OR b.kind='MASTER' AND EXISTS(SELECT 1 FROM "FreightJobMaster" l WHERE l."jobId"=$2 AND l."orgId"=$1 AND l."masterBillId"=b.id AND l."deletedAt" IS NULL))
  ORDER BY b."createdAt",b.id`,orgId,jobId);
}

export async function searchJobMasters(db:any,orgId:number,actorId:number,jobId:string,query:any){
 await freightForwarder(db,orgId,actorId);
 if(typeof query!=='string'||query.length>160)fail('FREIGHT_INVALID_INPUT');
 const rows=await db.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1 AND "orgId"=$2',jobId,orgId);
 if(!rows.length)fail('FREIGHT_NOT_FOUND',404);
 const row=rows[0],pattern='%'+query.trim().replace(/[\\%_]/g,'\\$&')+'%';
 const masters=await db.$queryRawUnsafe(`SELECT b.id,b."jobId",b.number,b.issuer,b.data,b.version,
  EXISTS(SELECT 1 FROM "FreightJobMaster" l WHERE l."jobId"=$2 AND l."orgId"=$1 AND l."masterBillId"=b.id AND l."deletedAt" IS NULL) AS linked,
  (SELECT count(*)::int FROM "FreightJobMaster" l WHERE l."masterBillId"=b.id AND l."orgId"=$1 AND l."deletedAt" IS NULL) AS "linkedJobCount"
  FROM "FreightBill" b JOIN "FreightJob" j ON j.id=b."jobId" AND j."orgId"=b."orgId"
  WHERE b."orgId"=$1 AND b.kind='MASTER' AND b."deletedAt" IS NULL AND j.mode=$3 AND j.service=$4 AND (b.number ILIKE $5 OR b.issuer ILIKE $5)
  ORDER BY b."updatedAt" DESC,b.id LIMIT 201`,orgId,jobId,row.mode,row.service,pattern);
 return {rows:masters.slice(0,200),hasMore:masters.length>200};
}

export async function changeJobMasterLink(db:any,orgId:number,actorId:number,jobId:string,masterId:string,input:any,remove=false){
 await freightForwarder(db,orgId,actorId);
 if(!input||Object.keys(input).some(key=>!['version','requestId'].includes(key))||!Number.isSafeInteger(input.version)||typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId)||typeof masterId!=='string'||!masterId||masterId.length>100)fail('FREIGHT_INVALID_INPUT');
 const requestHash=createHash('sha256').update(JSON.stringify({jobId,masterId,version:input.version,remove})).digest('hex');
 return retryEditTransaction(db,async(tx:any)=>{
  await freightForwarder(tx,orgId,actorId);
  const jobs=await tx.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',jobId,orgId);
  if(!jobs.length)fail('FREIGHT_NOT_FOUND',404);const row=jobs[0];
  if(row.receiptStatus!=='ACCEPTED'||row.status==='CANCELLED')fail('SHIPPING_NOT_ACCEPTED',409);
  const prior=await tx.$queryRawUnsafe('SELECT "after" FROM "FreightAudit" WHERE "orgId"=$1 AND entity=\'master-links\' AND "sourceId"=$2 AND "after"->>\'jobId\'=$3 AND "after"->>\'requestId\'=$4',orgId,`${jobId}:${masterId}`,jobId,input.requestId);
  if(prior.length){if(prior[0].after.requestHash!==requestHash)fail('FREIGHT_CHANGED',409);return row;}
  if(row.version!==input.version)fail('FREIGHT_CHANGED',409);
  const masters=await tx.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1 AND "orgId"=$2 AND kind=\'MASTER\' AND "deletedAt" IS NULL FOR SHARE',masterId,orgId);
  if(!masters.length)fail('FREIGHT_MASTER_SCOPE');
  const source=(await tx.$queryRawUnsafe('SELECT mode,service FROM "FreightJob" WHERE id=$1 AND "orgId"=$2',masters[0].jobId,orgId))[0];if(!source||source.mode!==row.mode||source.service!==row.service)fail('FREIGHT_MASTER_MODE');
  const links=await tx.$queryRawUnsafe('SELECT * FROM "FreightJobMaster" WHERE "jobId"=$1 AND "orgId"=$2 AND "masterBillId"=$3 FOR UPDATE',jobId,orgId,masterId),link=links[0];
  if(remove&&!link||remove&&link.deletedAt)fail('FREIGHT_NOT_FOUND',404);
  if(!remove&&link&&!link.deletedAt)return row;
  if(remove&&(await tx.$queryRawUnsafe('SELECT id FROM "FreightBill" WHERE "jobId"=$1 AND "orgId"=$2 AND "masterId"=$3 AND "deletedAt" IS NULL LIMIT 1',jobId,orgId,masterId)).length)fail('FREIGHT_MASTER_HAS_HOUSES',409);
  if(remove&&(await tx.$queryRawUnsafe('SELECT id FROM "ShippingChargeDraft" WHERE "jobId"=$1 AND "orgId"=$2 AND "billId"=$3 LIMIT 1',jobId,orgId,masterId)).length)fail('FREIGHT_BILL_HAS_CHARGES',409);
  if(link)await tx.$executeRawUnsafe('UPDATE "FreightJobMaster" SET "deletedAt"=$1,version=version+1,"updatedByEmployeeId"=$2,"updatedAt"=CURRENT_TIMESTAMP,"requestId"=$3,"requestHash"=$4 WHERE "jobId"=$5 AND "masterBillId"=$6',remove?new Date():null,actorId,input.requestId,requestHash,jobId,masterId);
  else await tx.$executeRawUnsafe('INSERT INTO "FreightJobMaster"("jobId","orgId","masterBillId","createdByEmployeeId","updatedByEmployeeId","requestId","requestHash") VALUES($1,$2,$3,$4,$4,$5,$6)',jobId,orgId,masterId,actorId,input.requestId,requestHash);
  return (await tx.$queryRawUnsafe('UPDATE "FreightJob" SET version=version+1,"updatedByEmployeeId"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$2 AND "orgId"=$3 RETURNING *',actorId,jobId,orgId))[0];
 });
}
