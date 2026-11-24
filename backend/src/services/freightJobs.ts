import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {freightActor,freightForwarder,listFreight,saveFreight} from './freightOperations';
import {saveJobProgress,createJobDocument} from './freightJobWorkflow';
import {saveShippingTradeDocument} from './shippingTradeDocuments';
import {billData} from './freightBillData';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const text=(v:any,max=120)=>typeof v==='string'&&v.trim().length<=max?v.trim():fail('FREIGHT_INVALID_INPUT');
async function job(db:any,orgId:number,id:string,lock=false){
 const rows=await db.$queryRawUnsafe(`SELECT * FROM "FreightJob" WHERE id=$1 AND "orgId"=$2${lock?' FOR UPDATE':''}`,id,orgId);
 if(!rows.length)fail('FREIGHT_NOT_FOUND',404);return rows[0];
}
export async function jobDetail(db:any,orgId:number,actorId:number,id:string){
 await freightActor(db,orgId,actorId);const row=await job(db,orgId,id);
 const bills=await db.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE "orgId"=$1 AND "jobId"=$2 AND "deletedAt" IS NULL ORDER BY "createdAt",id',orgId,id);
 const documents=await db.$queryRawUnsafe('SELECT id,kind,number,"sourceVersion","createdAt",snapshot->\'tradeDocument\'->>\'sourceMode\' AS "sourceMode" FROM "FreightDocument" WHERE "orgId"=$1 AND "jobId"=$2 ORDER BY "createdAt" DESC,id',orgId,id);
 return {...row,bills,documents};
}
export async function saveJobBill(db:any,orgId:number,actorId:number,jobId:string,input:any,id?:string,remove=false){
 await freightForwarder(db,orgId,actorId);
 return retryEditTransaction(db,async(tx:any)=>{
  await freightForwarder(tx,orgId,actorId);const current=await job(tx,orgId,jobId,true);
  if(current.receiptStatus!=='ACCEPTED'||current.status==='CANCELLED')fail('SHIPPING_NOT_ACCEPTED',409);
  const before=id?(await tx.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1 AND "orgId"=$2 AND "jobId"=$3 AND "deletedAt" IS NULL',id,orgId,jobId))[0]:null;
  if(id&&!before)fail('FREIGHT_NOT_FOUND',404);
  const kind=before?.kind||input.kind;if(!['MASTER','HOUSE'].includes(kind)||before&&input.kind&&input.kind!==kind||input.masterIds!==undefined)fail('FREIGHT_INVALID_INPUT');
  const number=remove?before.number:text(input.number),issuer=remove?before.issuer:text(input.issuer??'',200);
  if(!number)fail('FREIGHT_REQUIRED');
  const masterId=remove?before.masterId:input.masterId==null||input.masterId===''?null:text(input.masterId,100);

  const data=remove?before.data:input.data===undefined?before?.data||{}:billData(input.data);
  if(before&&!remove&&before.number===number&&before.issuer===issuer&&before.masterId===masterId&&JSON.stringify(billData(before.data||{}))===JSON.stringify(data)){
   if(before.version===input.version||before.version===input.version+1)return before;
  }
  if(before&&before.version!==input.version)fail('FREIGHT_CHANGED',409);
  if(masterId&&(kind!=='HOUSE'||!(await tx.$queryRawUnsafe('SELECT id FROM "FreightBill" WHERE id=$1 AND "orgId"=$2 AND "jobId"=$3 AND kind=\'MASTER\' AND "deletedAt" IS NULL',masterId,orgId,jobId)).length))fail('FREIGHT_MASTER_SCOPE');
  if(remove&&kind==='MASTER'&&(await tx.$queryRawUnsafe('SELECT id FROM "FreightBill" WHERE "masterId"=$1 AND "orgId"=$2 AND "deletedAt" IS NULL',id,orgId)).length)fail('FREIGHT_MASTER_HAS_HOUSES',409);
  if(remove&&(await tx.$queryRawUnsafe('SELECT id FROM "ShippingChargeDraft" WHERE "billId"=$1 AND "jobId"=$2 AND "orgId"=$3 LIMIT 1',id,jobId,orgId)).length)fail('FREIGHT_BILL_HAS_CHARGES',409);
  if(remove&&(await tx.$queryRawUnsafe(`SELECT id FROM "FreightDocument" WHERE "orgId"=$1 AND "jobId"=$2 AND (snapshot->'source'->'bill'->>'id'=$3 OR snapshot->'source'->'master'->>'id'=$3) LIMIT 1`,orgId,jobId,id)).length)fail('FREIGHT_BILL_HAS_DOCUMENTS',409);
  // A client-generated ID makes creation safely retryable, without number merging.
  const billId=id||text(input.id,80);if(!billId)fail('FREIGHT_REQUIRED');
  let rows;
  if(before)rows=await tx.$queryRawUnsafe('UPDATE "FreightBill" SET number=$1,issuer=$2,"masterId"=$3,"deletedAt"=$4,version=version+1,"updatedByEmployeeId"=$5,"updatedAt"=CURRENT_TIMESTAMP,data=$8::jsonb WHERE id=$6 AND "orgId"=$7 RETURNING *',number,issuer,masterId,remove?new Date():null,actorId,billId,orgId,JSON.stringify(data));
  else{
   const previous=(await tx.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1',billId))[0];
   if(previous){if(previous.orgId!==orgId||previous.jobId!==jobId||previous.kind!==kind||previous.number!==number||previous.issuer!==issuer||previous.masterId!==masterId||JSON.stringify(billData(previous.data||{}))!==JSON.stringify(data)||previous.deletedAt)fail('FREIGHT_CHANGED',409);return previous;}
   rows=await tx.$queryRawUnsafe('INSERT INTO "FreightBill"(id,"orgId","jobId",kind,number,issuer,"masterId",data,"createdByEmployeeId","updatedByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$9::jsonb,$8,$8) RETURNING *',billId,orgId,jobId,kind,number,issuer,masterId,actorId,JSON.stringify(data));
  }
  await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,\'bills\',$3,$4,$5,$6::jsonb,$7::jsonb)',randomUUID(),orgId,billId,rows[0].version,actorId,before?JSON.stringify(before):null,JSON.stringify(rows[0]));
  return rows[0];
 });
}
// Legacy maintenance/test compatibility only; no public route uses composition setup.
export async function saveDocumentSetup(db:any,orgId:number,actorId:number,jobId:string,input:any){
 await freightForwarder(db,orgId,actorId);
 if(!input||Object.keys(input).some(key=>!['version','composition','documentType'].includes(key))||!['MASTER_ONLY','MASTER_HOUSE','HOUSE_ONLY'].includes(input.composition))fail('FREIGHT_INVALID_INPUT');
 return retryEditTransaction(db,async(tx:any)=>{
  await freightForwarder(tx,orgId,actorId);const current=await job(tx,orgId,jobId,true);
  if(current.receiptStatus!=='ACCEPTED'||current.status==='CANCELLED')fail('SHIPPING_NOT_ACCEPTED',409);
  const allowed=current.service==='EXPRESS'?['WAYBILL']:current.mode==='SEA'?['BILL_OF_LADING','SEA_WAYBILL']:current.mode==='AIR'?['AIR_WAYBILL']:['WAYBILL'];
  if(!allowed.includes(input.documentType))fail('FREIGHT_INVALID_INPUT');
  const setup={composition:input.composition,documentType:input.documentType};
  if(JSON.stringify(current.data.documentSetup)===JSON.stringify(setup))return current;
  if(current.version!==input.version)fail('FREIGHT_CHANGED',409);
  // Changing a display preference must never remove or reclassify saved bills.
  const bills=await tx.$queryRawUnsafe('SELECT kind FROM "FreightBill" WHERE "orgId"=$1 AND "jobId"=$2 AND "deletedAt" IS NULL',orgId,jobId);
  if(bills.some((bill:any)=>input.composition==='MASTER_ONLY'&&bill.kind==='HOUSE'||input.composition==='HOUSE_ONLY'&&bill.kind==='MASTER'))fail('FREIGHT_COMPOSITION_HAS_BILLS',409);
  if(input.composition==='MASTER_ONLY'&&bills.filter((bill:any)=>bill.kind==='MASTER').length>1)fail('FREIGHT_COMPOSITION_HAS_BILLS',409);
  if(bills.length&&current.data.documentSetup?.documentType&&current.data.documentSetup.documentType!==input.documentType)fail('FREIGHT_COMPOSITION_HAS_BILLS',409);
  const rows=await tx.$queryRawUnsafe('UPDATE "FreightJob" SET data=$1::jsonb,version=version+1,"updatedByEmployeeId"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$3 AND "orgId"=$4 RETURNING *',JSON.stringify({...current.data,documentSetup:setup}),actorId,jobId,orgId);
  await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,\'document-setup\',$3,$4,$5,$6::jsonb,$7::jsonb)',randomUUID(),orgId,jobId,rows[0].version,actorId,JSON.stringify(current),JSON.stringify(rows[0]));
  return rows[0];
 });
}
export function registerJobRoutes(app:any,db:any,access:any){
 const route=(method:string,path:string,work:any)=>app[method]('/freight/transport-jobs'+path,async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await work(scope,req));});
 route('get','',({orgId,actorId}:any,req:any)=>listFreight(db,orgId,actorId,'jobs',req.query));
 route('get','/options',async({orgId}:any)=>({forwarder:await db.organization.findUnique({where:{id:orgId},select:{id:true,code:true,name:true,nameKo:true,nameVi:true}}),employees:await db.employee.findMany({where:{orgId,status:'ACTIVE'},select:{id:true,name:true,employeeNo:true},orderBy:{name:'asc'}}),currencies:await db.currency.findMany({select:{code:true,name:true},orderBy:{code:'asc'}})}));
 route('get','/:id',({orgId,actorId}:any,req:any)=>jobDetail(db,orgId,actorId,req.params.id));
 const save=async({orgId,actorId}:any,req:any)=>{
  const previous=req.params.id?await job(db,orgId,req.params.id):null;
  // The new editor never writes legacy BL columns; preserve their historical values.
  if(!['shipper','consignee'].every(role=>req.body?.data?.[role+'Id']||req.body?.data?.[role+'Party']?.name?.trim()))fail('FREIGHT_PARTIES_REQUIRED');
  const general=req.body.service==='EXPRESS'&&req.body.data.generalCustomer===true;
  const role=general?null:req.body.data.customerRole||(req.body.customerId===req.body.data.shipperId?'shipper':req.body.customerId===req.body.data.consigneeId?'consignee':null);
  if(general?req.body.data.customerRole!=null:!role||!['shipper','consignee','notify'].includes(role)||req.body.data[role+'Id']!==req.body.customerId)fail('FREIGHT_CUSTOMER_ROLE');
  if(!req.body.data.workScope)fail('FREIGHT_SCOPE_REQUIRED');
  req.body={...req.body,data:{...req.body.data,customerRole:role}};
  // Registration receives the job; progress is owned by operational workflows.
  return saveFreight(db,orgId,actorId,'jobs',{...req.body,status:previous?.status??'DRAFT',masterId:previous?.masterId??null,houseStatus:previous?.houseStatus??'NONE',houseNumber:previous?.houseNumber??null},req.params.id);
 };
 route('post','',save);route('put','/:id',save);
 // Legacy documentSetup remains readable for old records; new composition writes are retired.
 route('put','/:id/progress',({orgId,actorId}:any,req:any)=>saveJobProgress(db,orgId,actorId,req.params.id,req.body));
 route('post','/:id/documents',({orgId,actorId}:any,req:any)=>createJobDocument(db,orgId,actorId,req.params.id,req.body));
 route('post','/:id/trade-documents',({orgId,actorId}:any,req:any)=>saveShippingTradeDocument(db,orgId,actorId,req.params.id,req.body));
 route('post','/:id/bills',({orgId,actorId}:any,req:any)=>saveJobBill(db,orgId,actorId,req.params.id,req.body));
 route('put','/:id/bills/:billId',({orgId,actorId}:any,req:any)=>saveJobBill(db,orgId,actorId,req.params.id,req.body,req.params.billId));
 route('delete','/:id/bills/:billId',({orgId,actorId}:any,req:any)=>saveJobBill(db,orgId,actorId,req.params.id,req.body,req.params.billId,true));
}
