import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {freightActor,listFreight,saveFreight} from './freightOperations';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const text=(v:any,max=120)=>typeof v==='string'&&v.trim().length<=max?v.trim():fail('FREIGHT_INVALID_INPUT');
async function job(db:any,orgId:number,id:string,lock=false){
 const rows=await db.$queryRawUnsafe(`SELECT * FROM "FreightJob" WHERE id=$1 AND "orgId"=$2${lock?' FOR UPDATE':''}`,id,orgId);
 if(!rows.length)fail('FREIGHT_NOT_FOUND',404);return rows[0];
}
export async function jobDetail(db:any,orgId:number,actorId:number,id:string){
 await freightActor(db,orgId,actorId);const row=await job(db,orgId,id);
 const bills=await db.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE "orgId"=$1 AND "jobId"=$2 AND "deletedAt" IS NULL ORDER BY "createdAt",id',orgId,id);
 return {...row,bills};
}
export async function saveJobBill(db:any,orgId:number,actorId:number,jobId:string,input:any,id?:string,remove=false){
 await freightActor(db,orgId,actorId);
 return retryEditTransaction(db,async(tx:any)=>{
  await freightActor(tx,orgId,actorId);await job(tx,orgId,jobId,true);
  const before=id?(await tx.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1 AND "orgId"=$2 AND "jobId"=$3 AND "deletedAt" IS NULL',id,orgId,jobId))[0]:null;
  if(id&&!before)fail('FREIGHT_NOT_FOUND',404);
  if(before&&before.version!==input.version)fail('FREIGHT_CHANGED',409);
  const kind=before?.kind||input.kind;if(!['MASTER','HOUSE'].includes(kind)||before&&input.kind&&input.kind!==kind||input.masterIds!==undefined)fail('FREIGHT_INVALID_INPUT');
  const number=remove?before.number:text(input.number),issuer=remove?before.issuer:text(input.issuer??'',200);
  if(!number)fail('FREIGHT_REQUIRED');
  const masterId=remove?before.masterId:input.masterId==null||input.masterId===''?null:text(input.masterId,100);
  if(masterId&&(kind!=='HOUSE'||!(await tx.$queryRawUnsafe('SELECT id FROM "FreightBill" WHERE id=$1 AND "orgId"=$2 AND "jobId"=$3 AND kind=\'MASTER\' AND "deletedAt" IS NULL',masterId,orgId,jobId)).length))fail('FREIGHT_MASTER_SCOPE');
  if(remove&&kind==='MASTER'&&(await tx.$queryRawUnsafe('SELECT id FROM "FreightBill" WHERE "masterId"=$1 AND "orgId"=$2 AND "deletedAt" IS NULL',id,orgId)).length)fail('FREIGHT_MASTER_HAS_HOUSES',409);
  // A client-generated ID makes creation safely retryable, without number merging.
  const billId=id||text(input.id,80);if(!billId)fail('FREIGHT_REQUIRED');
  let rows;
  if(before)rows=await tx.$queryRawUnsafe('UPDATE "FreightBill" SET number=$1,issuer=$2,"masterId"=$3,"deletedAt"=$4,version=version+1,"updatedByEmployeeId"=$5,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$6 AND "orgId"=$7 RETURNING *',number,issuer,masterId,remove?new Date():null,actorId,billId,orgId);
  else{
   const previous=(await tx.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1',billId))[0];
   if(previous){if(previous.orgId!==orgId||previous.jobId!==jobId||previous.kind!==kind||previous.number!==number||previous.issuer!==issuer||previous.masterId!==masterId||previous.deletedAt)fail('FREIGHT_CHANGED',409);return previous;}
   rows=await tx.$queryRawUnsafe('INSERT INTO "FreightBill"(id,"orgId","jobId",kind,number,issuer,"masterId","createdByEmployeeId","updatedByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *',billId,orgId,jobId,kind,number,issuer,masterId,actorId);
  }
  await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,\'bills\',$3,$4,$5,$6::jsonb,$7::jsonb)',randomUUID(),orgId,billId,rows[0].version,actorId,before?JSON.stringify(before):null,JSON.stringify(rows[0]));
  return rows[0];
 });
}
export function registerJobRoutes(app:any,db:any,access:any){
 const route=(method:string,path:string,work:any)=>app[method]('/freight/transport-jobs'+path,async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await work(scope,req));});
 route('get','',({orgId,actorId}:any,req:any)=>listFreight(db,orgId,actorId,'jobs',req.query));
 route('get','/options',async({orgId}:any)=>({employees:await db.employee.findMany({where:{orgId,status:'ACTIVE'},select:{id:true,name:true},orderBy:{name:'asc'}})}));
 route('get','/:id',({orgId,actorId}:any,req:any)=>jobDetail(db,orgId,actorId,req.params.id));
 const save=async({orgId,actorId}:any,req:any)=>{
  const previous=req.params.id?await job(db,orgId,req.params.id):null;
  // The new editor never writes legacy BL columns; preserve their historical values.
  return saveFreight(db,orgId,actorId,'jobs',{...req.body,masterId:previous?.masterId??null,houseStatus:previous?.houseStatus??'NONE',houseNumber:previous?.houseNumber??null},req.params.id);
 };
 route('post','',save);route('put','/:id',save);
 route('post','/:id/bills',({orgId,actorId}:any,req:any)=>saveJobBill(db,orgId,actorId,req.params.id,req.body));
 route('put','/:id/bills/:billId',({orgId,actorId}:any,req:any)=>saveJobBill(db,orgId,actorId,req.params.id,req.body,req.params.billId));
 route('delete','/:id/bills/:billId',({orgId,actorId}:any,req:any)=>saveJobBill(db,orgId,actorId,req.params.id,req.body,req.params.billId,true));
}
