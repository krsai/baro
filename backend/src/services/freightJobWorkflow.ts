import {prepareSharedJob,syncBillsFromJob} from './shippingSharedData';
import {linkedJobBills} from './freightMasterLinks';
import {Prisma} from '@prisma/client';
import {workFieldLimits,shippingWorkData} from './shippingWorkData';
import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {freightForwarder,scopedParty} from './freightOperations';
import {parseVolumeInput} from '../utils/volumeFormula';

const fail=(message:string,status=400):never=>{throw createHttpError(status,message);};
const text=(value:any,max:number)=>typeof value==='string'&&value.trim().length<=max?value.trim():fail('FREIGHT_INVALID_INPUT');
const stamp=(value:any)=>{if(value==null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value)||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail('FREIGHT_INVALID_INPUT');return new Date(value).toISOString();};
const hash=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function lockedJob(tx:any,orgId:number,id:string){const rows=await tx.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);if(!rows.length)fail('FREIGHT_NOT_FOUND',404);return rows[0];}
const writable=(row:any)=>{if(row.receiptStatus!=='ACCEPTED'||row.status==='CANCELLED')fail('SHIPPING_NOT_ACCEPTED',409);};

// Operational edits never resubmit or revalidate the customer's request form.
export async function saveJobOperationDetails(db:any,orgId:number,actorId:number,id:string,input:any){
 await freightForwarder(db,orgId,actorId);
 const keys=['customerId','assigneeId','vessel','voyage','etd','eta',...Object.keys(workFieldLimits),'containers','packages'];
 if(!input||Object.keys(input).some(key=>!['version','requestId','fields'].includes(key))||!Number.isSafeInteger(input.version)||typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId)||!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields)||!Object.keys(input.fields).length||Object.keys(input.fields).some(key=>!keys.includes(key)))fail('FREIGHT_INVALID_INPUT');
 const fields:any={};
 for(const key of keys)if(Object.hasOwn(input.fields,key)){
  const value=input.fields[key];
  if(key==='customerId'){if(!Number.isSafeInteger(value)||value<=0)fail('FREIGHT_INVALID_INPUT');fields[key]=value;}
  else if(key==='assigneeId'){if(value!==null&&(!Number.isSafeInteger(value)||value<=0))fail('FREIGHT_INVALID_INPUT');fields[key]=value;}
  else if(key==='packages'){
   if(!Array.isArray(value)||value.length>50||value.some((r:any)=>!r||Array.isArray(r)||typeof r!=='object'||Object.keys(r).some(k=>!['quantity','lengthM','widthM','heightM'].includes(k))||typeof r.quantity!=='string'||!/^\d{1,8}$/.test(r.quantity)||Number(r.quantity)<1||['lengthM','widthM','heightM'].some(k=>typeof r[k]!=='string'||r[k]!==''&&(!/^\d{1,10}(?:\.\d{1,6})?$/.test(r[k])||Number(r[k])<=0))))fail('FREIGHT_INVALID_INPUT');
   fields[key]=value.map((r:any)=>({quantity:r.quantity,lengthM:r.lengthM,widthM:r.widthM,heightM:r.heightM}));
   const volume=fields[key].reduce((sum:any,r:any)=>sum.add(new Prisma.Decimal(r.quantity).mul(r.lengthM||0).mul(r.widthM||0).mul(r.heightM||0)),new Prisma.Decimal(0));
   if(volume.gte('1000000000000'))fail('FREIGHT_INVALID_INPUT');
  }else if(key==='containers'){
   const allowed=['20DC','40DC','40HQ','45HQ','20RF','40RF','40RH','20OT','40OT','40OH','20FR','40FR','40FH','20TK'];
   if(!Array.isArray(value)||value.length>50||value.some((r:any)=>!r||Object.keys(r).some(k=>!['size','type','count'].includes(k))||!allowed.includes(String(r.size)+String(r.type))||!/^\d{1,6}$/.test(String(r.count))||Number(r.count)<1))fail('FREIGHT_INVALID_INPUT');
   fields[key]=value.map((r:any)=>({size:String(r.size),type:String(r.type),count:String(r.count)}));
  }else if(key==='etd'||key==='eta'||key==='plannedDate'||key.startsWith('routeDate')){
   if(value!==null&&(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail('FREIGHT_INVALID_INPUT');fields[key]=value;
  }else {fields[key]=text(value,workFieldLimits[key]??(key==='vessel'?160:100));if(['shipper','consignee','origin','destination'].includes(key)&&!fields[key])fail('FREIGHT_REQUIRED');if(['quantity','weightKg','cbm','chargeableWeightKg'].includes(key)&&fields[key]&&!new RegExp('^\\d{1,16}(?:\\.\\d{1,'+(key==='cbm'?6:4)+'})?$').test(fields[key]))fail('FREIGHT_INVALID_INPUT');}
 }
 const requestHash=hash({version:input.version,fields});
 return retryEditTransaction(db,async(tx:any)=>{
  await freightForwarder(tx,orgId,actorId);const row=await lockedJob(tx,orgId,id);writable(row);
  if(fields.cbmFormula){const parsed=parseVolumeInput(fields.cbmFormula),cbm=fields.cbm??shippingWorkData(row.data).cbm;if(!fields.cbmFormula.startsWith('=')||!parsed||typeof cbm!=='string'||!/^\d+(?:\.\d+)?$/.test(cbm)||!new Prisma.Decimal(cbm).equals(parsed.cbm))fail('FREIGHT_INVALID_INPUT');}
  if(fields.packages?.some((r:any)=>['lengthM','widthM','heightM'].some(k=>!r[k]))&&row.service!=='EXPRESS')fail('FREIGHT_INVALID_INPUT');
  const prior=await tx.$queryRawUnsafe('SELECT "after" FROM "FreightAudit" WHERE "orgId"=$1 AND entity=\'operation-details\' AND "sourceId"=$2 AND "after"->\'data\'->\'operationEdit\'->>\'id\'=$3',orgId,id,input.requestId);
  if(prior.length){if(prior[0].after.data.operationEdit.hash!==requestHash)fail('FREIGHT_CHANGED',409);return row;}
  if(row.version!==input.version)fail('FREIGHT_CHANGED',409);
  if(fields.assigneeId&&!await tx.employee.findFirst({where:{id:fields.assigneeId,orgId,status:'ACTIVE',orgRole:'OPERATOR'},select:{id:true}}))fail('FREIGHT_ASSIGNEE_SCOPE',403);
  const customer=fields.customerId!==undefined&&fields.customerId!==row.customerId?await scopedParty(tx,orgId,fields.customerId):null;
  if(customer?.isShippingGeneralCustomer)fail('FREIGHT_INVALID_INPUT');
  const working=Object.fromEntries(Object.entries(fields).filter(([key])=>Object.hasOwn(workFieldLimits,key)||key==='containers'||key==='packages'));
  if(Object.hasOwn(fields,'cbm')&&!Object.hasOwn(fields,'cbmFormula')&&shippingWorkData(row.data).cbmFormula)working.cbmFormula='';
  const base=Object.fromEntries(Object.entries(fields).filter(([key])=>!Object.hasOwn(working,key)&&key!=='customerId'));
  const data={...row.data,...base,...(customer?{customer,generalCustomer:false,...(!row.data.billTo||row.data.billTo===row.data.customer?.name?{billTo:customer.name}:{})}:{}),...(Object.keys(working).length?{workDetails:{...row.data.workDetails,...working}}:{}),operationEdit:{id:input.requestId,hash:requestHash}};
  const prepared=prepareSharedJob(row,data);
  const updated=(await tx.$queryRawUnsafe('UPDATE "FreightJob" SET data=$1::jsonb,"requestSnapshot"=$6::jsonb,"customerId"=$5,version=version+1,"updatedByEmployeeId"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$3 AND "orgId"=$4 RETURNING *',JSON.stringify(prepared.data),actorId,id,orgId,fields.customerId??row.customerId,JSON.stringify(prepared.requestSnapshot)))[0];
  await syncBillsFromJob(tx,actorId,row,updated);
  await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,\'operation-details\',$3,$4,$5,$6::jsonb,$7::jsonb)',randomUUID(),orgId,id,updated.version,actorId,JSON.stringify(row),JSON.stringify(updated));
  return updated;
 });
}

export async function saveJobProgress(db:any,orgId:number,actorId:number,id:string,input:any){
 await freightForwarder(db,orgId,actorId);
 if(!input||Object.keys(input).some(key=>!['version','requestId','status','tasks','deliveryDate','recipient'].includes(key))||!Number.isSafeInteger(input.version)||typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId)||!['DRAFT','BOOKED','IN_TRANSIT','ARRIVED','DELIVERED'].includes(input.status)||!Array.isArray(input.tasks)||input.tasks.length>40)fail('FREIGHT_INVALID_INPUT');
 const tasks=input.tasks.map((task:any)=>{
  if(!task||Object.keys(task).some(key=>!['id','title','state','dueAt','completedAt','assigneeId','delayReason'].includes(key))||typeof task.id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(task.id)||!['TODO','DOING','BLOCKED','DONE','SKIPPED'].includes(task.state))fail('FREIGHT_INVALID_INPUT');
  const title=text(task.title,160),delayReason=text(task.delayReason||'',500),dueAt=stamp(task.dueAt),completedAt=stamp(task.completedAt),assigneeId=task.assigneeId??null;
  if(!title||assigneeId!==null&&(!Number.isSafeInteger(assigneeId)||assigneeId<=0)||task.state==='DONE'&&!completedAt||task.state!=='DONE'&&completedAt||['BLOCKED','SKIPPED'].includes(task.state)&&!delayReason||completedAt&&Date.parse(completedAt)>Date.now()+60000)fail('FREIGHT_INVALID_INPUT');
  return {id:task.id,title,state:task.state,dueAt,completedAt,assigneeId,delayReason};
 });
 if(new Set(tasks.map((task:any)=>task.id)).size!==tasks.length)fail('FREIGHT_INVALID_INPUT');
 const deliveryDate=input.deliveryDate?text(input.deliveryDate,10):null,recipient=text(input.recipient||'',200);
 if(input.status==='DELIVERED'&&(!deliveryDate||!/^\d{4}-\d\d-\d\d$/.test(deliveryDate)||!Number.isFinite(Date.parse(deliveryDate))||new Date(deliveryDate).toISOString().slice(0,10)!==deliveryDate||!recipient))fail('FREIGHT_DELIVERY_REQUIRED');
 const requestHash=hash({status:input.status,tasks,deliveryDate,recipient});
 return retryEditTransaction(db,async(tx:any)=>{
  await freightForwarder(tx,orgId,actorId);const row=await lockedJob(tx,orgId,id);writable(row);
  const prior=await tx.$queryRawUnsafe('SELECT "after" FROM "FreightAudit" WHERE "orgId"=$1 AND entity=\'progress\' AND "sourceId"=$2 AND "after"->\'data\'->\'operations\'->\'lastRequest\'->>\'id\'=$3',orgId,id,input.requestId);
  if(prior.length){if(prior[0].after.data.operations.lastRequest.hash!==requestHash)fail('FREIGHT_CHANGED',409);return row;}
  if(row.version!==input.version)fail('FREIGHT_CHANGED',409);
  const previous=row.data.operations?.tasks||[];
  if(previous.some((task:any)=>!tasks.some((next:any)=>next.id===task.id)))fail('FREIGHT_PROGRESS_HISTORY',409);
  for(const task of tasks){const old=previous.find((p:any)=>p.id===task.id);if(old?.state==='DONE'&&task.state!=='DONE'&&!task.delayReason)fail('FREIGHT_INVALID_INPUT');
   if(task.assigneeId&&!await tx.employee.findFirst({where:{id:task.assigneeId,orgId,status:'ACTIVE'},select:{id:true}}))fail('FREIGHT_ASSIGNEE_SCOPE',403);
  }
  const now=new Date().toISOString(),operations={tasks:tasks.map((task:any)=>{const old=previous.find((p:any)=>p.id===task.id);return {...task,completedByEmployeeId:task.state==='DONE'?(old?.state==='DONE'&&old.completedAt===task.completedAt?old.completedByEmployeeId:actorId):null,recordedAt:old&&hash(Object.fromEntries(Object.keys(task).map(k=>[k,old[k]])))===hash(task)?old.recordedAt:now};}),lastRequest:{id:input.requestId,hash:requestHash}};
  const data={...row.data,operations,...(input.status==='DELIVERED'?{deliveryDate,recipient}:{})};
  const updated=(await tx.$queryRawUnsafe('UPDATE "FreightJob" SET data=$1::jsonb,status=$2,version=version+1,"updatedByEmployeeId"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$4 AND "orgId"=$5 RETURNING *',JSON.stringify(data),input.status,actorId,id,orgId))[0];
  await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,\'progress\',$3,$4,$5,$6::jsonb,$7::jsonb)',randomUUID(),orgId,id,updated.version,actorId,JSON.stringify(row),JSON.stringify(updated));return updated;
 });
}

export async function createJobDocument(db:any,orgId:number,actorId:number,id:string,input:any){
 await freightForwarder(db,orgId,actorId);
 if(!input||Object.keys(input).some(key=>!['clientKey','version','kind','billId','fields'].includes(key))||typeof input.clientKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientKey)||!Number.isSafeInteger(input.version)||!['AN','DO','POD','MANIFEST','HOUSE_DRAFT','MASTER_DRAFT'].includes(input.kind)||input.billId!=null&&typeof input.billId!=='string')fail('FREIGHT_INVALID_INPUT');
 const fields:any={};
 if(input.fields!==undefined){if(!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields)||Object.keys(input.fields).some(key=>!['vessel','voyage','etd','eta','marks','freightTerms'].includes(key)))fail('FREIGHT_INVALID_INPUT');
  for(const key of ['vessel','voyage','etd','eta','marks','freightTerms'])if(input.fields[key]!==undefined){const value=text(input.fields[key],['etd','eta'].includes(key)?10:500);if(['etd','eta'].includes(key)&&value&&(!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail('FREIGHT_INVALID_INPUT');fields[key]=value;}
 }
 const requestHash=hash({version:input.version,kind:input.kind,billId:input.billId||null,fields});
 return retryEditTransaction(db,async(tx:any)=>{
  await freightForwarder(tx,orgId,actorId);
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`freight-document:${orgId}:${input.clientKey}`);
  const row=await lockedJob(tx,orgId,id);writable(row);
  const previous=(await tx.$queryRawUnsafe('SELECT * FROM "FreightDocument" WHERE "orgId"=$1 AND "clientKey"=$2',orgId,input.clientKey))[0];
  if(previous){if(previous.jobId!==id||previous.snapshot.requestHash!==requestHash)fail('FREIGHT_KEY_CONFLICT',409);return previous;}
  if(row.version!==input.version)fail('FREIGHT_CHANGED',409);
  const bills=await linkedJobBills(tx,orgId,id),bill=input.billId?bills.find((b:any)=>b.id===input.billId):null;
  if(input.billId&&!bill)fail('FREIGHT_MASTER_SCOPE');
  if((input.kind==='HOUSE_DRAFT'&&(!bill||bill.kind!=='HOUSE'))||(input.kind==='MASTER_DRAFT'&&(!bill||bill.kind!=='MASTER')))fail('FREIGHT_DOCUMENT_REQUIRED');
  const work=shippingWorkData(row.data);
  if(!work.origin||!work.destination)fail('FREIGHT_DOCUMENT_REQUIRED');
  const allowed=['origin','destination','etd','eta','vessel','voyage','cargo','marks','quantity','unit','weightKg','cbm','freightTerms','incoterms','plannedDate','containers','packages','deliveryDate','recipient','hsCode'];
  const data:any=Object.fromEntries(allowed.filter(key=>work[key]!=null).map(key=>[key,work[key]]));
  // A saved bill is a separate document source; never overwrite the job.
  if(bill?.data)Object.assign(data,Object.fromEntries(Object.entries(bill.data).filter(([key])=>!['surrenderRecordedBy','surrenderRecordedAt'].includes(key))));
  Object.assign(data,fields);
  for(const role of ['shipper','consignee','notify']){const party=row.data[role+'Party'];if(data[role]===undefined)data[role]=work[role]||[party?.name,party?.address,party?.contactName,party?.phone,party?.email].filter(Boolean).join('\n');}
  if(!data.shipper||!data.consignee)fail('FREIGHT_DOCUMENT_REQUIRED');
  const issuer=await tx.organization.findUnique({where:{id:orgId},select:{name:true,address:true,representative:true,phone:true,email:true}}),documentId=randomUUID();
  const source={id:row.id,number:row.number,mode:row.mode,service:row.service,version:row.version,data,bill:bill?{id:bill.id,number:bill.number,kind:bill.kind,issuer:bill.issuer,version:bill.version}:null,master:bill?.masterId?bills.filter((b:any)=>b.id===bill.masterId).map((b:any)=>({id:b.id,number:b.number,version:b.version}))[0]||null:null,documentType:bill?.data?.releaseType==='SEA_WAYBILL'?'SEA_WAYBILL':row.data.documentSetup?.documentType||(row.mode==='SEA'?'BILL_OF_LADING':row.mode==='AIR'?'AIR_WAYBILL':'WAYBILL')};
  const snapshot={layout:['MASTER_DRAFT','HOUSE_DRAFT'].includes(input.kind)?'bill-form-v2':'transport-v1',requestHash,issuer,source,draft:true,deliveryConfirmed:false,createdByEmployeeId:actorId};
  return (await tx.$queryRawUnsafe('INSERT INTO "FreightDocument"(id,"orgId","jobId","clientKey",kind,number,"sourceVersion",snapshot,"createdByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *',documentId,orgId,id,input.clientKey,input.kind,`${input.kind}-${documentId.slice(0,8).toUpperCase()}`,row.version,JSON.stringify(snapshot),actorId))[0];
 });
}
