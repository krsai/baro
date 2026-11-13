import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {freightActor,freightOptions,saveFreight,scopedParty} from './freightOperations';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';

const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
// Positive list only: never serialize a job, invoice, cost, document or arbitrary JSON.
const strings=['origin','destination','etd','eta','plannedDate','vessel','voyage','shipmentType','incoterms','incotermsPlace','pickupAddress','shipper','consignee','notify','cargo','marks','quantity','unit','weightKg','cbm','containerType','containerCount','dangerousGoodsDetails','deliveryDate','recipient'];
export function transportSnapshot(input:any){
 if(!input||!['SEA','AIR','ROAD'].includes(input.mode))fail('TRANSPORT_INVALID');
 const data:any={};
 for(const key of strings){const value=input.data?.[key];if(value!==undefined&&value!==null){if(typeof value!=='string'||value.length>2000)fail('TRANSPORT_INVALID');data[key]=value;}}
 for(const key of ['pickupRequired','dangerousGoods'])if(input.data?.[key]!==undefined){if(typeof input.data[key]!=='boolean')fail('TRANSPORT_INVALID');data[key]=input.data[key];}
 for(const key of ['quantity','containerCount'])if(data[key]&&!/^\d{1,12}$/.test(data[key]))fail('TRANSPORT_INVALID');
 for(const key of ['weightKg','cbm'])if(data[key]&&!new RegExp('^\\d{1,12}(?:\\.\\d{1,'+(key==='weightKg'?4:6)+'})?$').test(data[key]))fail('TRANSPORT_INVALID');
 for(const [key,max] of Object.entries({origin:160,destination:160,vessel:160,voyage:100,incoterms:80,incotermsPlace:200,pickupAddress:1000,shipper:1000,consignee:1000,notify:1000,marks:1000,unit:30,containerType:40,dangerousGoodsDetails:500,recipient:200}))if(data[key]?.length>max)fail('TRANSPORT_INVALID');
 for(const key of ['etd','eta','plannedDate','deliveryDate'])if(data[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(data[key])||!Number.isFinite(Date.parse(data[key]))||new Date(data[key]+'T00:00:00Z').toISOString().slice(0,10)!==data[key]))fail('TRANSPORT_INVALID');
 if(data.shipmentType&&(input.mode==='SEA'?!['FCL','LCL'].includes(data.shipmentType):data.shipmentType!==input.mode))fail('TRANSPORT_INVALID');
 const scope=input.data?.workScope,nodes=input.mode==='ROAD'?['ORIGIN_DOOR','DESTINATION_DOOR']:['ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR'];
 if(scope){if(nodes.indexOf(scope.start)<0||nodes.indexOf(scope.end)<=nodes.indexOf(scope.start))fail('TRANSPORT_INVALID');data.workScope={start:scope.start,end:scope.end};}
 if(data.pickupRequired&&(!data.pickupAddress||scope?.start!=='ORIGIN_DOOR'))fail('FREIGHT_PICKUP_REQUIRED');
 const status=['DRAFT','BOOKED','IN_TRANSIT','ARRIVED','DELIVERED','CANCELLED'].includes(input.status)?input.status:'DRAFT';
 return {mode:input.mode,status,data};
}
async function actor(db:any,orgId:number,actorId:number){
 await freightActor(db,orgId,actorId);
 const org=await db.organization.findFirst({where:{id:orgId,isActive:true,ownerOrgId:null,OR:[{dataOwnerOrgId:null},{dataOwnerOrgId:orgId}],type:{in:['MANUFACTURER','SERVICE']}},select:{id:true,name:true,type:true}});
 if(!org)fail('TRANSPORT_ACCESS_DENIED',403);return org;
}
export async function transportPartners(db:any,orgId:number){
 return db.$queryRawUnsafe(`SELECT DISTINCT o.id,o.code,o.name,o."nameKo",o."nameVi",o.type FROM "Organization" o WHERE o.id<>$1 AND o."isActive" AND o."ownerOrgId" IS NULL AND (o."dataOwnerOrgId" IS NULL OR o."dataOwnerOrgId"=o.id) AND o.type::text IN ('MANUFACTURER','SERVICE') AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=o.id AND e.status::text='ACTIVE') AND EXISTS(SELECT 1 FROM "Organization" own WHERE own.id=$1 AND own.type<>o.type) AND (EXISTS(SELECT 1 FROM "CompanyPartnerLink" l WHERE l."orgId"=$1 AND l."targetOrgId"=o.id) OR EXISTS(SELECT 1 FROM "CompanyIdentityLink" l JOIN "CompanyIdentity" c ON c.id=l."identityId" WHERE l."orgId"=$1 AND c."anchorEntityId"=o.id)) ORDER BY o.name,o.id`,orgId);
}
async function ownJob(db:any,orgId:number,id:string){
 const rows=await db.$queryRawUnsafe('SELECT mode,status,data FROM "FreightJob" WHERE id=$1 AND "orgId"=$2',id,orgId);
 if(!rows.length)fail('FREIGHT_NOT_FOUND',404);return transportSnapshot(rows[0]);
}
// Explicit projection: foreign job IDs, client keys, hashes and audit identities stay private.
function dto(row:any,orgId:number){
 const incoming=row.receiverOrgId===orgId;
 const sender=row.senderSnapshot?transportSnapshot(row.senderSnapshot):null,receiver=row.receiverSnapshot?transportSnapshot(row.receiverSnapshot):null;
 return {id:row.id,incoming,company:row.company,status:row.status,version:row.version,createdAt:row.createdAt,updatedAt:row.updatedAt,ownJobId:incoming?row.receiverJobId:row.senderJobId,sent:incoming?receiver:sender,received:incoming?sender:receiver};
}
export async function listTransportExchanges(db:any,orgId:number,actorId:number){
 await actor(db,orgId,actorId);
 const rows=await db.$queryRawUnsafe(`SELECT x.*,o.name AS company FROM "TransportExchange" x JOIN "Organization" o ON o.id=CASE WHEN x."senderOrgId"=$1 THEN x."receiverOrgId" ELSE x."senderOrgId" END WHERE x."senderOrgId"=$1 OR x."receiverOrgId"=$1 ORDER BY x."updatedAt" DESC,x.id LIMIT 200`,orgId);
 return rows.map((row:any)=>dto(row,orgId));
}
async function event(tx:any,row:any,orgId:number,actorId:number,action:string,snapshot:any){
 await tx.$executeRawUnsafe('INSERT INTO "TransportExchangeEvent"(id,"exchangeId","orgId","actorId",version,action,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',randomUUID(),row.id,orgId,actorId,row.version,action,JSON.stringify(snapshot));
}
export async function sendTransport(db:any,orgId:number,actorId:number,input:any){
 await actor(db,orgId,actorId);
 return retryEditTransaction(db,async(tx:any)=>{
  const org=await actor(tx,orgId,actorId),target=Number(input.targetOrgId);
  if(!(await transportPartners(tx,orgId)).some((p:any)=>p.id===target))fail('TRANSPORT_PARTNER_REQUIRED',403);
  if(typeof input.clientKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientKey))fail('TRANSPORT_INVALID');
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`transport:${orgId}:${input.clientKey}`);
  const snapshot=input.jobId?await ownJob(tx,orgId,input.jobId):transportSnapshot(input);
  if(org.type==='SERVICE'&&!input.jobId)fail('TRANSPORT_JOB_REQUIRED');
  if(!snapshot.data.cargo?.trim()||!snapshot.data.origin?.trim()||!snapshot.data.destination?.trim()||!snapshot.data.shipper?.trim()||!snapshot.data.consignee?.trim()||!snapshot.data.workScope||snapshot.status==='CANCELLED')fail('TRANSPORT_REQUIRED');
  const previous=(await tx.$queryRawUnsafe('SELECT *,"senderSnapshot"=$3::jsonb AS matches FROM "TransportExchange" WHERE "senderOrgId"=$1 AND "clientKey"=$2',orgId,input.clientKey,JSON.stringify(snapshot)))[0];
  if(previous){if(previous.receiverOrgId!==target||previous.senderJobId!==(input.jobId||null)||!previous.matches)fail('TRANSPORT_CHANGED',409);return {id:previous.id};}
  const row=(await tx.$queryRawUnsafe('INSERT INTO "TransportExchange"(id,"senderOrgId","receiverOrgId","senderJobId","clientKey","senderSnapshot","createdBy") VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *',randomUUID(),orgId,target,input.jobId||null,input.clientKey,JSON.stringify(snapshot),actorId))[0];
  await event(tx,row,orgId,actorId,'SENT',snapshot);return {id:row.id};
 });
}
export async function actOnTransport(db:any,orgId:number,actorId:number,id:string,input:any){
 await actor(db,orgId,actorId);
 return retryEditTransaction(db,async(tx:any)=>{
  const org=await actor(tx,orgId,actorId);
  const row=(await tx.$queryRawUnsafe('SELECT * FROM "TransportExchange" WHERE id=$1 AND ("senderOrgId"=$2 OR "receiverOrgId"=$2) FOR UPDATE',id,orgId))[0];
  if(!row)fail('TRANSPORT_NOT_FOUND',404);
  if(row.version!==input.version)fail('TRANSPORT_CHANGED',409);
  const incoming=row.receiverOrgId===orgId,action=input.action;
  let status=row.status,jobId=incoming?row.receiverJobId:row.senderJobId,snapshot=null;
  if(action==='ACCEPT'&&incoming&&status==='PENDING'){
   status='ACCEPTED';
   if(org.type==='SERVICE'){
    const customerId=Number(input.customerId);await scopedParty(tx,orgId,customerId);
    if(!['shipper','consignee'].includes(input.customerRole))fail('TRANSPORT_REQUIRED');
    const source=transportSnapshot(row.senderSnapshot);
    // Join the enclosing serializable transaction: Prisma transaction clients cannot nest.
    const joined=new Proxy(tx,{get:(target,key)=>key==='$transaction'?(fn:any)=>fn(tx):Reflect.get(target,key)});
    const saved=await saveFreight(joined,orgId,actorId,'jobs',{...source,status:'DRAFT',customerId,clientKey:randomUUID(),data:{...source.data,customerRole:input.customerRole,[input.customerRole+'Id']:customerId}});
    jobId=saved.id;
   }
  }else if(action==='DECLINE'&&incoming&&status==='PENDING')status='DECLINED';
  else if(action==='CANCEL'&&!incoming&&status==='PENDING')status='CANCELLED';
  else if(action==='PUBLISH'&&status==='ACCEPTED')snapshot=jobId?await ownJob(tx,orgId,jobId):transportSnapshot(input);
  else fail('TRANSPORT_ACTION_INVALID',409);
  const column=incoming?'receiverSnapshot':'senderSnapshot',jobColumn=incoming?'receiverJobId':'senderJobId';
  const updated=(await tx.$queryRawUnsafe(`UPDATE "TransportExchange" SET status=$1,"${jobColumn}"=$2,"${column}"=COALESCE($3::jsonb,"${column}"),version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,status,jobId,snapshot?JSON.stringify(snapshot):null,id))[0];
  await event(tx,updated,orgId,actorId,action,snapshot||{status});return {id,version:updated.version};
 });
}
export function registerTransportExchangeRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!ctx)return null;const orgId=ctx.organization.id,actorId=gates.actorId();await actor(db,orgId,actorId);const setting=await gates.loadPolicy();if(!setting.policy?.[ctx.organization.type]?.[ctx.employee.orgRole]?.includes('CUSTOMER'))fail('TRANSPORT_ACCESS_DENIED',403);return {orgId,actorId};};
 const route=(method:string,path:string,fn:any)=>app[method]('/transport-exchanges'+path,async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await fn(scope,req));});
 const canWork=async(orgId:number,actorId:number)=>{const org=await actor(db,orgId,actorId),employee=await freightActor(db,orgId,actorId),setting=await gates.loadPolicy();return org.type==='SERVICE'&&setting.policy?.SERVICE?.[employee.orgRole]?.includes('FREIGHT')&&(await companyIndustryMenuFeatures(db,orgId,'SERVICE')).includes('FREIGHT');};
 route('get','',({orgId,actorId}:any)=>listTransportExchanges(db,orgId,actorId));
 route('get','/options',async({orgId,actorId}:any)=>({partners:await transportPartners(db,orgId),customers:await freightOptions(db,orgId,actorId),jobs:await canWork(orgId,actorId)?await db.$queryRawUnsafe('SELECT id,number FROM "FreightJob" WHERE "orgId"=$1 AND status<>\'CANCELLED\' ORDER BY "createdAt" DESC LIMIT 500',orgId):[]}));
 route('post','',async({orgId,actorId}:any,req:any)=>{if(req.body.jobId&&!await canWork(orgId,actorId))fail('TRANSPORT_ACCESS_DENIED',403);return sendTransport(db,orgId,actorId,req.body);});
 route('post','/:id',async({orgId,actorId}:any,req:any)=>{if(['ACCEPT','PUBLISH'].includes(req.body.action)&&(await actor(db,orgId,actorId)).type==='SERVICE'&&!await canWork(orgId,actorId))fail('TRANSPORT_ACCESS_DENIED',403);return actOnTransport(db,orgId,actorId,req.params.id,req.body);});
}
