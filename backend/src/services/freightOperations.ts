import {registerJobRoutes} from './freightJobs';
import {attachLinkedCompanies} from './companyConnections';
import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';

const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const tables={jobs:'FreightJob',masters:'FreightMaster',dispatches:'FreightDispatch'} as const;
const clean=(v:any,max=500)=>{if(typeof v!=='string'||v.length>max)fail('FREIGHT_INVALID_INPUT');return v.trim();};
const optional=(v:any,max=500)=>v==null?'':clean(v,max);
const member=(v:any,values:string[])=>values.includes(v)?v:fail('FREIGHT_INVALID_INPUT');
const key=(v:any)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(v)?v:fail('INVALID_TRANSACTION_KEY');
const hash=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const date=(v:any)=>{const value=optional(v,10);if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))fail('FREIGHT_INVALID_INPUT');return value;};
const decimal=(v:any,precision=4)=>{const s=String(v??'0');if(!new RegExp(precision?'^\\d{1,12}(?:\\.\\d{1,'+precision+'})?$':'^\\d{1,12}$').test(s))fail('FREIGHT_INVALID_INPUT');return s;};
const canonical=(v:any)=>{const s=String(v).replace(/^0+(?=\d)/,'');return s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s;};
export async function freightActor(db:any,orgId:number,actorId:number){
 const actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}},select:{id:true,name:true,orgRole:true}});
 if(!actor)fail('ACTIVE_EMPLOYEE_REQUIRED',403);return actor;
}
// Keep party lookup independent of Prisma relation aliases used by other modules.
export async function scopedParty(db:any,orgId:number,id:number){
 const rows=await db.$queryRawUnsafe(`SELECT p.id,p.code,p.name,p."nameKo",p."nameVi",p.address,p.country,p."businessNumber" FROM "Organization" p WHERE p.id=$1 AND p.id<>$2 AND p."isActive" AND (p."ownerOrgId"=$2 OR p."dataOwnerOrgId"=$2 OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=$2 AND r."brandOrgId"=p.id))`,id,orgId);
 if(!rows.length)fail('FREIGHT_PARTY_SCOPE',403);return (await freightParties(db,orgId,rows))[0];
}
async function freightParties(db:any,orgId:number,rows:any[]){
 const values=await attachLinkedCompanies(db,orgId,rows.map(row=>({...row,entityId:row.id})));
 return values.map(row=>({id:row.id,code:row.linkedCompany?.code||row.code||null,name:row.name,nameKo:row.nameKo,nameVi:row.nameVi,address:row.address,country:row.country,businessNumber:row.businessNumber}));
}
export async function freightOptions(db:any,orgId:number,actorId:number){
 await freightActor(db,orgId,actorId);
 const rows=await db.$queryRawUnsafe(`SELECT p.id,p.code,p.name,p."nameKo",p."nameVi",p.address,p.country,p."businessNumber",p."ownerOrgId",p."dataOwnerOrgId" FROM "Organization" p WHERE p.id<>$1 AND p."isActive" AND (p."ownerOrgId"=$1 OR p."dataOwnerOrgId"=$1 OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=$1 AND r."brandOrgId"=p.id)) ORDER BY p.name,p.id`,orgId);
 return freightParties(db,orgId,rows);
}
async function audit(tx:any,orgId:number,entity:string,row:any,before:any,actorId:number){await tx.$executeRawUnsafe(`INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,randomUUID(),orgId,entity,row.id,row.version,actorId,before?JSON.stringify(before):null,JSON.stringify(row));}
async function get(tx:any,orgId:number,type:keyof typeof tables,id:string,lock=false){
 const rows=await tx.$queryRawUnsafe(`SELECT * FROM "${tables[type]}" WHERE id=$1 AND "orgId"=$2${lock?' FOR UPDATE':''}`,id,orgId);
 if(!rows.length)fail('FREIGHT_NOT_FOUND',404);return rows[0];
}
async function normalize(tx:any,orgId:number,type:keyof typeof tables,input:any){
 const d=input.data||{},mode=member(input.mode||'AIR',['SEA','AIR','ROAD']);
 const data:any={origin:optional(d.origin,160),destination:optional(d.destination,160),etd:date(d.etd),eta:date(d.eta),vessel:optional(d.vessel,160),voyage:optional(d.voyage,100),remark:optional(d.remark,2000)};
 if(type==='masters'){
  const number=clean(input.number,120);if(!number)fail('FREIGHT_REQUIRED');data.carrier=optional(d.carrier,200);data.issuer=optional(d.issuer,200);return {number,mode,data};
 }
 if(type==='dispatches'){
  const masterId=input.masterId?clean(input.masterId,80):null;if(masterId)await get(tx,orgId,'masters',masterId,true);
  return {masterId,data};
 }
 const customerId=Number(input.customerId);if(!Number.isSafeInteger(customerId)||customerId<=0)fail('FREIGHT_REQUIRED');data.customer=await scopedParty(tx,orgId,customerId);
 const masterId=input.masterId?clean(input.masterId,80):null;if(masterId&&(await get(tx,orgId,'masters',masterId,true)).mode!==mode)fail('FREIGHT_MASTER_MODE');
 const houseStatus=member(input.houseStatus||'NONE',['NONE','HOUSE','UNKNOWN']),houseNumber=houseStatus==='HOUSE'?clean(input.houseNumber||'',120):null;if(houseStatus==='HOUSE'&&!houseNumber)fail('FREIGHT_REQUIRED');
 const assigneeId=d.assigneeId==null||d.assigneeId===''?null:Number(d.assigneeId);
 if(assigneeId!==null&&(!Number.isSafeInteger(assigneeId)||!await tx.employee.findFirst({where:{id:assigneeId,orgId,status:'ACTIVE'}})))fail('FREIGHT_ASSIGNEE_SCOPE',403);
 Object.assign(data,{assigneeId,jobType:member(d.jobType||'OTHER',['IMPORT','EXPORT','DOMESTIC','OTHER']),plannedDate:date(d.plannedDate)});
 for(const role of ['shipper','consignee','notify']){
  const id=d[role+'Id'];
  if(id!=null&&id!==''){if(!Number.isSafeInteger(id)||id<=0)fail('FREIGHT_PARTY_SCOPE',403);data[role+'Id']=id;data[role+'Party']=await scopedParty(tx,orgId,id);}
 }
 if(d.customerRole!==undefined){
  data.customerRole=member(d.customerRole,['shipper','consignee']);
  if(data[data.customerRole+'Id']!==customerId)fail('FREIGHT_CUSTOMER_ROLE');
 }
 if(d.workScope!==undefined&&d.workScope!==null){
  const nodes=mode==='ROAD'?['ORIGIN_DOOR','DESTINATION_DOOR']:['ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR'];
  if(typeof d.workScope!=='object'||Array.isArray(d.workScope))fail('FREIGHT_INVALID_INPUT');
  const start=nodes.indexOf(d.workScope.start),end=nodes.indexOf(d.workScope.end);
  if(start<0||end<=start)fail('FREIGHT_INVALID_INPUT');
  data.workScope={start:nodes[start],end:nodes[end]};
  if(d.pickupRequired===true&&(start!==0||!optional(d.pickupAddress,1000)))fail('FREIGHT_PICKUP_REQUIRED');
 }
 if(d.pickupPartyId!=null){
  if(!Number.isSafeInteger(d.pickupPartyId)||d.pickupPartyId<=0)fail('FREIGHT_PARTY_SCOPE',403);
  await scopedParty(tx,orgId,d.pickupPartyId);data.pickupPartyId=d.pickupPartyId;
 }
 data.incotermsPlace=optional(d.incotermsPlace,200);
 const shipmentType=member(d.shipmentType||(mode==='SEA'?'FCL':mode==='AIR'?'AIR':'ROAD'),['FCL','LCL','AIR','ROAD']);
 if((['FCL','LCL'].includes(shipmentType)?'SEA':shipmentType)!==mode)fail('FREIGHT_INVALID_INPUT');
 for(const key of ['pickupRequired','dangerousGoods'])if(d[key]!==undefined&&typeof d[key]!=='boolean')fail('FREIGHT_INVALID_INPUT');
 Object.assign(data,{shipmentType,incoterms:optional(d.incoterms,80),pickupRequired:d.pickupRequired===true,pickupAddress:optional(d.pickupAddress,1000),dangerousGoods:d.dangerousGoods===true,dangerousGoodsDetails:optional(d.dangerousGoodsDetails,500),containerType:optional(d.containerType,40),containerCount:decimal(d.containerCount||undefined,0)});
 Object.assign(data,{direction:member(d.direction||'OTHER',['IMPORT','EXPORT','OTHER']),shipper:optional(d.shipper,1000),consignee:optional(d.consignee,1000),notify:optional(d.notify,1000),billTo:optional(d.billTo,1000),cargo:optional(d.cargo,2000),marks:optional(d.marks,1000),quantity:decimal(d.quantity||undefined,0),unit:optional(d.unit||'PKG',30),weightKg:decimal(d.weightKg||undefined),cbm:decimal(d.cbm||undefined,6),freightTerms:optional(d.freightTerms,100),deliveryDate:date(d.deliveryDate),recipient:optional(d.recipient,200)});
 for(const role of ['shipper','consignee','notify'])if(data[role+'Party'])data[role]=[data[role+'Party'].name,data[role+'Party'].address].filter(Boolean).join('\n');
 return {customerId,masterId,mode,service:member(input.service||'GENERAL',['GENERAL','EXPRESS']),houseStatus,houseNumber,status:member(input.status||'DRAFT',['DRAFT','BOOKED','IN_TRANSIT','ARRIVED','DELIVERED','CANCELLED']),data};
}
export async function saveFreight(db:any,orgId:number,actorId:number,type:keyof typeof tables,input:any,id?:string){
 if(!tables[type])fail('FREIGHT_NOT_FOUND',404);await freightActor(db,orgId,actorId);
 return retryEditTransaction(db,async(tx:any)=>{
  await freightActor(tx,orgId,actorId);const clientKey=key(input.clientKey),requestHash=hash({id:id||null,input});
  // Serialize retries before reading either the current row or the audit chain.
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`freight:${orgId}:${type}:${clientKey}`);
  if(!id){const previous=await tx.$queryRawUnsafe(`SELECT * FROM "${tables[type]}" WHERE "orgId"=$1 AND "clientKey"=$2`,orgId,clientKey);if(previous.length){if(previous[0].requestHash!==requestHash)fail('FREIGHT_KEY_CONFLICT',409);return previous[0];}}
  const before=id?await get(tx,orgId,type,id,true):null;
  if(before&&before.version!==input.version){
   const prior=await tx.$queryRawUnsafe('SELECT "after" FROM "FreightAudit" WHERE "orgId"=$1 AND entity=$2 AND "sourceId"=$3 AND version=$4',orgId,type,id,input.version+1);
   if(prior[0]?.after?.requestHash===requestHash)return prior[0].after;
   fail('FREIGHT_CHANGED',409);
  }
  const value=await normalize(tx,orgId,type,input);
  // A status is an operational observation, not an automatically signed POD.
  if(type==='jobs'&&value.status==='DELIVERED'&&(!value.data.deliveryDate||!value.data.recipient))fail('FREIGHT_DELIVERY_REQUIRED');
  const sourceId=id||randomUUID(),columns=Object.keys(value),params=columns.map(k=>k==='data'?JSON.stringify((value as any)[k]):(value as any)[k]);
  let rows;
  if(before){
   rows=await tx.$queryRawUnsafe(`UPDATE "${tables[type]}" SET ${columns.map((k,i)=>`"${k}"=$${i+1}${k==='data'?'::jsonb':''}`).join(',')},version=version+1,"requestHash"=$${params.length+1},"updatedByEmployeeId"=$${params.length+2},"updatedAt"=CURRENT_TIMESTAMP WHERE id=$${params.length+3} AND "orgId"=$${params.length+4} RETURNING *`,...params,requestHash,actorId,sourceId,orgId);
  }else{
   let number=type==='masters'?(value as any).number:`DSP-${sourceId.slice(0,8).toUpperCase()}`;
   if(type==='jobs'){
    // Job history cannot be physically deleted. Serialize company numbering,
    // including cancelled jobs, instead of relying on a short UUID collision.
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`freight-job-number:${orgId}`);
    const count=await tx.$queryRawUnsafe('SELECT count(*)::integer AS count FROM "FreightJob" WHERE "orgId"=$1',orgId);
    number=`JOB-${String(count[0].count+1).padStart(6,'0')}`;
   }
   const values:any={id:sourceId,orgId,clientKey,requestHash,...value,...(type!=='masters'?{number}:{}),createdByEmployeeId:actorId,updatedByEmployeeId:actorId};
   const cols=Object.keys(values);rows=await tx.$queryRawUnsafe(`INSERT INTO "${tables[type]}"(${cols.map(k=>`"${k}"`).join(',')}) VALUES(${cols.map((k,i)=>`$${i+1}${k==='data'?'::jsonb':''}`).join(',')}) RETURNING *`,...cols.map(k=>k==='data'?JSON.stringify(values[k]):values[k]));
  }
  await audit(tx,orgId,type,rows[0],before,actorId);return rows[0];
 });
}
export async function listFreight(db:any,orgId:number,actorId:number,type:keyof typeof tables,input:any={}){
 await freightActor(db,orgId,actorId);if(!tables[type])fail('FREIGHT_NOT_FOUND',404);
 const search=optional(input.search,160),offset=Number(input.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('FREIGHT_INVALID_INPUT');
 const result=await db.$queryRawUnsafe(`SELECT q.*,${type==='jobs'?'(SELECT m.number FROM "FreightMaster" m WHERE m.id=q."masterId" AND m."orgId"=q."orgId") AS "masterNumber",':''}count(*) OVER()::integer AS "totalCount" FROM "${tables[type]}" q WHERE "orgId"=$1 AND ($2='' OR concat_ws(' ',number,data->>'origin',data->>'destination',data->'customer'->>'name'${type==='jobs'?',"houseNumber"':''}) ILIKE '%'||replace(replace(replace($2,'\\','\\\\'),'%','\\%'),'_','\\_')||'%') ORDER BY "createdAt" DESC,id LIMIT 50 OFFSET $3`,orgId,search,offset);
 return {rows:result.map(({totalCount,...row}:any)=>row),total:result[0]?.totalCount||0,offset};
}
export async function freightDetail(db:any,orgId:number,actorId:number,type:keyof typeof tables,id:string){
 await freightActor(db,orgId,actorId);if(!tables[type])fail('FREIGHT_NOT_FOUND',404);const row=await get(db,orgId,type,id);
 const jobs=type==='masters'?await db.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE "orgId"=$1 AND "masterId"=$2 ORDER BY "createdAt",id',orgId,id):[];
 const packages=type==='jobs'?await db.$queryRawUnsafe('SELECT * FROM "FreightPackage" WHERE "orgId"=$1 AND "jobId"=$2 ORDER BY label,id',orgId,id):type==='dispatches'?await db.$queryRawUnsafe('SELECT p.*,j.number AS "jobNumber",j."houseNumber",j.data AS "jobData" FROM "FreightPackage" p JOIN "FreightJob" j ON j.id=p."jobId" AND j."orgId"=p."orgId" WHERE p."orgId"=$1 AND p."dispatchId"=$2 ORDER BY j.number,p.label',orgId,id):[];
 const documents=type==='masters'?[]:await db.$queryRawUnsafe(`SELECT id,kind,number,"sourceVersion","createdAt" FROM "FreightDocument" WHERE "orgId"=$1 AND "${type==='jobs'?'jobId':'dispatchId'}"=$2 ORDER BY "createdAt" DESC`,orgId,id);
 const history=await db.$queryRawUnsafe('SELECT a.version,a."createdAt",e.name AS actor FROM "FreightAudit" a JOIN "Employee" e ON e.id=a."actorId" AND e."orgId"=a."orgId" WHERE a."orgId"=$1 AND a.entity=$2 AND a."sourceId"=$3 ORDER BY version DESC',orgId,type,id);
 const master=row.masterId?await get(db,orgId,'masters',row.masterId):null;
 return {...row,jobs,packages,documents,history,master,revision:hash({version:row.version,masterVersion:master?.version,packages:packages.map((p:any)=>[p.id,p.version,p.dispatchId])})};
}
export async function saveFreightPackage(db:any,orgId:number,actorId:number,jobId:string,input:any){
 await freightActor(db,orgId,actorId);return retryEditTransaction(db,async(tx:any)=>{
  await freightActor(tx,orgId,actorId);const job=await get(tx,orgId,'jobs',jobId,true);if(job.status==='CANCELLED')fail('FREIGHT_CHANGED',409);
  const id=key(input.id||input.clientKey),label=clean(input.label||'',100),quantity=Number(input.quantity),weightKg=decimal(input.weightKg),cbm=decimal(input.cbm,6),dispatchId=input.dispatchId?clean(input.dispatchId,80):null;
  if(!label||!Number.isSafeInteger(quantity)||quantity<=0||quantity>1000000)fail('FREIGHT_INVALID_INPUT');
  if(dispatchId)await get(tx,orgId,'dispatches',dispatchId,true);
  const old=(await tx.$queryRawUnsafe('SELECT * FROM "FreightPackage" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId))[0];
  if(old&&old.jobId!==jobId)fail('FREIGHT_NOT_FOUND',404);
  if(old&&old.label===label&&old.quantity===quantity&&canonical(old.weightKg)===canonical(weightKg)&&canonical(old.cbm)===canonical(cbm)&&old.dispatchId===dispatchId)return old;
  if(old&&old.version!==input.version)fail('FREIGHT_CHANGED',409);
  const rows=old?await tx.$queryRawUnsafe('UPDATE "FreightPackage" SET label=$1,quantity=$2,"weightKg"=$3::numeric,cbm=$4::numeric,"dispatchId"=$5,version=version+1,"updatedByEmployeeId"=$6 WHERE id=$7 AND "orgId"=$8 RETURNING *',label,quantity,weightKg,cbm,dispatchId,actorId,id,orgId):await tx.$queryRawUnsafe('INSERT INTO "FreightPackage"(id,"orgId","jobId","dispatchId",label,quantity,"weightKg",cbm,"createdByEmployeeId","updatedByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9,$9) RETURNING *',id,orgId,jobId,dispatchId,label,quantity,weightKg,cbm,actorId);
  await audit(tx,orgId,'packages',rows[0],old,actorId);return rows[0];
 });
}
export async function issueFreightDocument(db:any,orgId:number,actorId:number,type:'jobs'|'dispatches',id:string,input:any){
 await freightActor(db,orgId,actorId);const kind=member(input.kind,['AN','DO','POD','MANIFEST','HOUSE_DRAFT']),clientKey=key(input.clientKey);
 return retryEditTransaction(db,async(tx:any)=>{
  await freightActor(tx,orgId,actorId);await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`freight-document:${orgId}:${clientKey}`);
  const old=(await tx.$queryRawUnsafe('SELECT * FROM "FreightDocument" WHERE "orgId"=$1 AND "clientKey"=$2',orgId,clientKey))[0];
  if(old){if(old.kind!==kind||old[type==='jobs'?'jobId':'dispatchId']!==id||old.sourceVersion!==input.version||old.snapshot.source.revision!==input.revision)fail('FREIGHT_KEY_CONFLICT',409);return old;}
  const source=await get(tx,orgId,type,id,true);if(source.version!==input.version)fail('FREIGHT_CHANGED',409);
  if(source.status==='CANCELLED')fail('FREIGHT_CHANGED',409);if(type==='dispatches'&&kind!=='MANIFEST')fail('FREIGHT_INVALID_INPUT');
  const detail=await freightDetail(tx,orgId,actorId,type,id);
  if(detail.revision!==input.revision)fail('FREIGHT_CHANGED',409);
  if(!source.data.origin||!source.data.destination)fail('FREIGHT_DOCUMENT_REQUIRED');
  if(kind==='HOUSE_DRAFT'&&(source.houseStatus!=='HOUSE'||!source.data.shipper||!source.data.consignee))fail('FREIGHT_DOCUMENT_REQUIRED');
  const issuer=await tx.organization.findFirst({where:{id:orgId},select:{name:true,nameKo:true,nameVi:true,address:true}}),documentId=randomUUID();
  const snapshot={issuer,source:detail,draft:true,deliveryConfirmed:false,createdByEmployeeId:actorId};
  const rows=await tx.$queryRawUnsafe('INSERT INTO "FreightDocument"(id,"orgId","jobId","dispatchId","clientKey",kind,number,"sourceVersion",snapshot,"createdByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *',documentId,orgId,type==='jobs'?id:null,type==='dispatches'?id:null,clientKey,kind,`${kind}-${documentId.slice(0,8).toUpperCase()}`,source.version,JSON.stringify(snapshot),actorId);return rows[0];
 });
}
export function registerFreightRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!ctx)return null;const orgId=ctx.organization.id,actorId=gates.actorId();await freightActor(db,orgId,actorId);const setting=await gates.loadPolicy();if(!setting.policy?.[ctx.organization.type]?.[ctx.employee.orgRole]?.includes('FREIGHT'))fail('FREIGHT_ACCESS_DENIED',403);return {orgId,actorId};};
 registerJobRoutes(app,db,access);
 const route=(method:string,path:string,work:any)=>app[method](path,async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await work(scope,req));});
 route('get','/freight/options',({orgId,actorId}:any)=>freightOptions(db,orgId,actorId));
 for(const type of Object.keys(tables) as (keyof typeof tables)[]){
  route('get',`/freight/${type}`,({orgId,actorId}:any,req:any)=>listFreight(db,orgId,actorId,type,req.query));
  route('get',`/freight/${type}/:id`,({orgId,actorId}:any,req:any)=>freightDetail(db,orgId,actorId,type,req.params.id));
  route('post',`/freight/${type}`,({orgId,actorId}:any,req:any)=>saveFreight(db,orgId,actorId,type,req.body));
  route('put',`/freight/${type}/:id`,({orgId,actorId}:any,req:any)=>saveFreight(db,orgId,actorId,type,req.body,req.params.id));
 }
 route('post','/freight/jobs/:id/packages',({orgId,actorId}:any,req:any)=>saveFreightPackage(db,orgId,actorId,req.params.id,req.body));
 for(const type of ['jobs','dispatches'] as const)route('post',`/freight/${type}/:id/documents`,({orgId,actorId}:any,req:any)=>issueFreightDocument(db,orgId,actorId,type,req.params.id,req.body));
 route('get','/freight/documents/:id',async({orgId}:any,req:any)=>{const rows=await db.$queryRawUnsafe('SELECT * FROM "FreightDocument" WHERE id=$1 AND "orgId"=$2',req.params.id,orgId);if(!rows.length)fail('FREIGHT_NOT_FOUND',404);return rows[0];});
}
