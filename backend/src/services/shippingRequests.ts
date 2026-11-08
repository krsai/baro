import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {freightActor,freightOptions} from './freightOperations';
import {transportSnapshot,transportPartners} from './transportExchange';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
async function actor(db:any,orgId:number,actorId:number){
 await freightActor(db,orgId,actorId);
 const org=await db.organization.findFirst({where:{id:orgId,isActive:true,ownerOrgId:null,OR:[{dataOwnerOrgId:null},{dataOwnerOrgId:orgId}],type:{in:['SERVICE','MANUFACTURER']}},select:{id:true,type:true,name:true}});
 if(!org)fail('SHIPPING_ACCESS_DENIED',403);return org;
}
const requestFields=(input:any)=>{
 if(Object.keys(input||{}).some(key=>!['mode','data','clientKey','forwarderOrgId','version'].includes(key)))fail('SHIPPING_INVALID');
 const value=transportSnapshot({...input,status:'DRAFT'});
 for(const key of ['origin','destination','shipper','consignee','cargo'])if(!value.data[key]?.trim())fail('TRANSPORT_REQUIRED');
 if(!value.data.workScope)fail('TRANSPORT_REQUIRED');
 return value;
};
const projection=(row:any)=>({id:row.id,number:row.number,ownerOrgId:row.orgId,company:row.company,receiptStatus:row.receiptStatus,version:row.version,updatedAt:row.updatedAt,request:row.requestSnapshot?transportSnapshot(row.requestSnapshot):null,shared:row.sharedSnapshot?transportSnapshot(row.sharedSnapshot):null});
async function memberJob(tx:any,orgId:number,id:string,lock=false){
 const row=(await tx.$queryRawUnsafe(`SELECT j.*,o.name AS company FROM "FreightJob" j JOIN "Organization" o ON o.id=j."orgId" WHERE j.id=$1 AND (j."orgId"=$2 OR j."requesterOrgId"=$2)${lock?' FOR UPDATE OF j':''}`,id,orgId))[0];
 if(!row)fail('SHIPPING_NOT_FOUND',404);return row;
}
export async function listShippingRequests(db:any,orgId:number,actorId:number){
 const org=await actor(db,orgId,actorId);
 if(org.type==='SERVICE')return db.$queryRawUnsafe('SELECT j.* FROM "FreightJob" j WHERE j."orgId"=$1 ORDER BY j."createdAt" DESC,j.id LIMIT 500',orgId);
 const rows=await db.$queryRawUnsafe('SELECT j.id,j.number,j."orgId",j."receiptStatus",j.version,j."updatedAt",j."requestSnapshot",j."sharedSnapshot",o.name AS company FROM "FreightJob" j JOIN "Organization" o ON o.id=j."orgId" WHERE j."requesterOrgId"=$1 ORDER BY j."createdAt" DESC,j.id LIMIT 500',orgId);
 return rows.map(projection);
}
export async function readShippingRequest(db:any,orgId:number,actorId:number,id:string){
 await actor(db,orgId,actorId);const row=await memberJob(db,orgId,id);
 if(row.orgId===orgId)return {...row,events:await db.$queryRawUnsafe('SELECT version,action,"actorOrgId","actorId","createdAt" FROM "ShippingRequestEvent" WHERE "jobId"=$1 AND "orgId"=$2 ORDER BY version',id,orgId)};
 return {...projection(row),documents:await db.$queryRawUnsafe('SELECT id,snapshot,"createdAt" FROM "ShippingDocumentShare" WHERE "jobId"=$1 AND "orgId"=$2 ORDER BY "createdAt",id',id,row.orgId)};
}
export async function shareShippingDocument(db:any,orgId:number,actorId:number,id:string,input:any){
 if(typeof input.documentId!=='string'||Object.keys(input).some(key=>key!=='documentId'))fail('SHIPPING_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  await actor(tx,orgId,actorId);const job=await memberJob(tx,orgId,id,true);
  if(job.orgId!==orgId)fail('SHIPPING_ACCESS_DENIED',403);
  if(job.receiptStatus!=='ACCEPTED'||!job.requesterOrgId)fail('SHIPPING_NOT_ACCEPTED',409);
  const old=(await tx.$queryRawUnsafe('SELECT id FROM "ShippingDocumentShare" WHERE "jobId"=$1 AND "documentId"=$2',id,input.documentId))[0];if(old)return old;
  const document=(await tx.$queryRawUnsafe('SELECT * FROM "FreightDocument" WHERE id=$1 AND "orgId"=$2 AND "jobId"=$3',input.documentId,orgId,id))[0];
  if(!document)fail('SHIPPING_NOT_FOUND',404);
  const original=document.snapshot,source=transportSnapshot(original.source);
  const snapshot={number:document.number,kind:document.kind,sourceVersion:document.sourceVersion,snapshot:{issuer:Object.fromEntries(['name','nameKo','nameVi','address'].map(key=>[key,original.issuer?.[key]??''])),source:{...source,number:job.number},draft:true,deliveryConfirmed:false}};
  const shareId=randomUUID();
  await tx.$executeRawUnsafe('INSERT INTO "ShippingDocumentShare"(id,"orgId","jobId","documentId",snapshot,"createdByEmployeeId") VALUES($1,$2,$3,$4,$5::jsonb,$6)',shareId,orgId,id,input.documentId,JSON.stringify(snapshot),actorId);
  return {id:shareId};
 });
}
export async function submitShippingRequest(db:any,orgId:number,actorId:number,input:any){
 const value=requestFields(input);
 if(typeof input.clientKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientKey)||!Number.isSafeInteger(input.forwarderOrgId))fail('SHIPPING_INVALID');
 const digest=createHash('sha256').update(JSON.stringify({forwarder:input.forwarderOrgId,value})).digest('hex');
 return retryEditTransaction(db,async (tx:any)=>{
  const org=await actor(tx,orgId,actorId);if(org.type!=='MANUFACTURER')fail('SHIPPING_ACCESS_DENIED',403);
  if(!(await transportPartners(tx,orgId)).some((p:any)=>p.id===input.forwarderOrgId&&p.type==='SERVICE'))fail('TRANSPORT_PARTNER_REQUIRED',403);
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`shipping:${orgId}:${input.clientKey}`);
  const key=`shipping:${orgId}:${input.clientKey}`;
  const previous=(await tx.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE "orgId"=$1 AND "clientKey"=$2',input.forwarderOrgId,key))[0];
  if(previous){if(previous.requestHash!==digest||previous.requesterOrgId!==orgId)fail('SHIPPING_CHANGED',409);return projection(previous);}
  // Resolve the forwarder's own local customer by explicit company connections.
  // Never infer identity from names or copy the sender's foreign IDs.
  const customers=await tx.$queryRawUnsafe(`SELECT p.id,p.name FROM "Organization" p WHERE p."isActive" AND p.id<>$1 AND (p."ownerOrgId"=$1 OR p."dataOwnerOrgId"=$1 OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=$1 AND r."brandOrgId"=p.id)) AND baro_shipping_customer_org($1::integer,p.id)=$2 ORDER BY p.id LIMIT 2`,input.forwarderOrgId,orgId);
  if(customers.length!==1)fail('SHIPPING_CUSTOMER_MAPPING_REQUIRED',409);
  const customer=customers[0],id=randomUUID();
  await tx.$queryRawUnsafe("SELECT set_config('baro.shipping_actor_org',$1,true),set_config('baro.shipping_actor_id',$2,true)",String(orgId),String(actorId));
  const row=(await tx.$queryRawUnsafe(`INSERT INTO "FreightJob"(id,"orgId","clientKey","requestHash",number,"customerId",mode,service,"houseStatus",status,data,"receiptStatus","requesterOrgId","requestCreatedByOrgId","requestCreatedByEmployeeId","requestSnapshot")
   VALUES($1,$2,$3,$4,$5,$6,$7,'GENERAL','NONE','DRAFT',$8::jsonb,'PENDING',$9,$9,$10,$11::jsonb) RETURNING *`,id,input.forwarderOrgId,key,digest,`SR-${id.slice(0,8).toUpperCase()}`,customer.id,value.mode,JSON.stringify({...value.data,customer:{name:customer.name}}),orgId,actorId,JSON.stringify(value)))[0];
  return projection(row);
 });
}
export async function actOnShippingRequest(db:any,orgId:number,actorId:number,id:string,input:any){
 if(!['EDIT','ACCEPT','PUBLISH'].includes(input.action)||!Number.isSafeInteger(input.version)||Object.keys(input).some(key=>!['action','version','mode','data'].includes(key)))fail('SHIPPING_INVALID');
 return retryEditTransaction(db,async (tx:any)=>{
  await actor(tx,orgId,actorId);const row=await memberJob(tx,orgId,id,true),owner=row.orgId===orgId;
  if(input.action==='ACCEPT'&&owner&&row.receiptStatus==='ACCEPTED'&&row.version===input.version+1)return {id,version:row.version};
  if(row.version!==input.version)fail('SHIPPING_CHANGED',409);
  if(!owner&&(input.action!=='EDIT'||row.receiptStatus!=='PENDING'))fail('SHIPPING_ACCESS_DENIED',403);
  await tx.$queryRawUnsafe("SELECT set_config('baro.shipping_actor_org',$1,true),set_config('baro.shipping_actor_id',$2,true)",String(orgId),String(actorId));
  let updated;
  if(input.action==='ACCEPT'&&owner&&row.receiptStatus==='PENDING'){
   updated=await tx.$queryRawUnsafe(`UPDATE "FreightJob" SET "receiptStatus"='ACCEPTED',"updatedByEmployeeId"=$1,version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,actorId,id);
  }else if(input.action==='PUBLISH'&&owner&&row.receiptStatus==='ACCEPTED'){
   const snapshot=transportSnapshot(row);
   updated=await tx.$queryRawUnsafe('UPDATE "FreightJob" SET "sharedSnapshot"=$1::jsonb,"updatedByEmployeeId"=$2,version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *',JSON.stringify(snapshot),actorId,id);
  }else if(input.action==='EDIT'&&row.receiptStatus==='PENDING'){
   const value=requestFields({mode:input.mode,data:input.data});
   const oldPublic=transportSnapshot(row).data;
   const privateData=Object.fromEntries(Object.entries(row.data).filter(([key])=>!(key in oldPublic)));
   updated=await tx.$queryRawUnsafe(`UPDATE "FreightJob" SET mode=$1,data=$2::jsonb,"requestSnapshot"=$3::jsonb,"updatedByEmployeeId"=CASE WHEN $5 THEN $6::integer ELSE "updatedByEmployeeId" END,version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,value.mode,JSON.stringify({...privateData,...value.data}),JSON.stringify(value),id,owner,actorId);
  }else fail('SHIPPING_ACTION_INVALID',409);
  return {id,version:updated[0].version};
 });
}
export async function shippingCharges(db:any,orgId:number,actorId:number,id:string){
 await actor(db,orgId,actorId);const row=await memberJob(db,orgId,id);
 if(row.orgId!==orgId)fail('SHIPPING_ACCESS_DENIED',403);
 return {rows:await db.$queryRawUnsafe('SELECT id,direction,description,"currencyCode",amount::text,version FROM "ShippingChargeDraft" WHERE "jobId"=$1 AND "orgId"=$2 ORDER BY "createdAt",id',id,orgId),currencies:await db.currency.findMany({select:{code:true,name:true},orderBy:{code:'asc'}})};
}
export async function saveShippingCharge(db:any,orgId:number,actorId:number,id:string,input:any){
 if(typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.id)||!['PURCHASE','SALES'].includes(input.direction)||typeof input.description!=='string'||!input.description.trim()||input.description.length>500||typeof input.amount!=='string'||!/^\d{1,20}(?:\.\d{1,4})?$/.test(input.amount)||typeof input.currencyCode!=='string'||Object.keys(input).some(key=>!['id','direction','description','currencyCode','amount','version'].includes(key)))fail('SHIPPING_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  await actor(tx,orgId,actorId);const job=await memberJob(tx,orgId,id,true);
  if(job.orgId!==orgId)fail('SHIPPING_ACCESS_DENIED',403);
  if(job.receiptStatus!=='ACCEPTED'||job.status==='CANCELLED')fail('SHIPPING_NOT_ACCEPTED',409);
  if(!await tx.currency.findUnique({where:{code:input.currencyCode},select:{id:true}}))fail('SHIPPING_INVALID');
  const old=(await tx.$queryRawUnsafe('SELECT *,amount=$2::numeric AS matches FROM "ShippingChargeDraft" WHERE id=$1 FOR UPDATE',input.id,input.amount))[0];
  if(old&&(old.orgId!==orgId||old.jobId!==id))fail('SHIPPING_NOT_FOUND',404);
  if(old&&old.matches&&old.direction===input.direction&&old.description===input.description.trim()&&old.currencyCode===input.currencyCode)return {id:old.id,version:old.version};
  if(old&&old.version!==input.version)fail('SHIPPING_CHANGED',409);
  const updated=old?await tx.$queryRawUnsafe('UPDATE "ShippingChargeDraft" SET direction=$1,description=$2,"currencyCode"=$3,amount=$4::numeric,version=version+1,"updatedByEmployeeId"=$5,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$6 RETURNING *',input.direction,input.description.trim(),input.currencyCode,input.amount,actorId,input.id):await tx.$queryRawUnsafe('INSERT INTO "ShippingChargeDraft"(id,"orgId","jobId",direction,description,"currencyCode",amount,"createdByEmployeeId","updatedByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7::numeric,$8,$8) RETURNING *',input.id,orgId,id,input.direction,input.description.trim(),input.currencyCode,input.amount,actorId);
  await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,\'charge-drafts\',$3,$4,$5,$6::jsonb,$7::jsonb)',randomUUID(),orgId,input.id,updated[0].version,actorId,old?JSON.stringify(old):null,JSON.stringify(updated[0]));
  return {id:input.id,version:updated[0].version};
 });
}
export function registerShippingRequestRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!ctx)return null;
  const orgId=ctx.organization.id,actorId=gates.actorId(),org=await actor(db,orgId,actorId),policy=(await gates.loadPolicy()).policy;
  const feature=org.type==='SERVICE'?'FREIGHT':'CUSTOMER';
  if(!policy?.[org.type]?.[ctx.employee.orgRole]?.includes(feature)||org.type==='SERVICE'&&!(await companyIndustryMenuFeatures(db,orgId,'SERVICE')).includes('FREIGHT'))fail('SHIPPING_ACCESS_DENIED',403);
  return {orgId,actorId,org};
 };
 const route=(method:string,path:string,work:any)=>app[method]('/shipping-requests'+path,async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await work(scope,req));});
 route('get','',({orgId,actorId}:any)=>listShippingRequests(db,orgId,actorId));
 route('get','/options',async({orgId,actorId,org}:any)=>org.type==='SERVICE'?{customers:await freightOptions(db,orgId,actorId),forwarders:[]}:{customers:[],forwarders:(await transportPartners(db,orgId)).filter((p:any)=>p.type==='SERVICE')});
 route('get','/:id',({orgId,actorId}:any,req:any)=>readShippingRequest(db,orgId,actorId,req.params.id));
 route('get','/:id/charges',({orgId,actorId}:any,req:any)=>shippingCharges(db,orgId,actorId,req.params.id));
 route('post','/:id/charges',({orgId,actorId}:any,req:any)=>saveShippingCharge(db,orgId,actorId,req.params.id,req.body));
 route('post','/:id/documents/share',({orgId,actorId}:any,req:any)=>shareShippingDocument(db,orgId,actorId,req.params.id,req.body));
 route('post','',({orgId,actorId}:any,req:any)=>submitShippingRequest(db,orgId,actorId,req.body));
 route('post','/:id',({orgId,actorId}:any,req:any)=>actOnShippingRequest(db,orgId,actorId,req.params.id,req.body));
}
