import {randomUUID} from 'node:crypto';
import {shippingWorkData} from './shippingWorkData';

// Explicit business fields only. Document identity, release, money and snapshots
// never participate in field propagation. Different values remain document edits.
export const sharedFields=['shipper','consignee','notify','vessel','voyage','etd','eta','origin','destination','placeOfReceipt','placeOfDelivery','cargo','marks','quantity','unit','weightKg','cbm','cbmFormula','freightTerms','incoterms','billTo','containers'];
const totals=new Set(['quantity','unit','weightKg','cbm','cbmFormula']);
const publicFields=[...sharedFields,'plannedDate','routeLocations','routeLocationDetails','originPortCode','destinationPortCode','workScope','shipperParty','consigneeParty','notifyParty','notifySameAsConsignee'];
const equal=(a:any,b:any)=>JSON.stringify(a??'')===JSON.stringify(b??'');
const copy=(v:any)=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
export const partyBlock=(p:any)=>p?[p.name,p.address,[p.contactName,p.phone,p.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n'):'';

function updatePartyAddress(data:any,role:string){
 const p=data[role+'Party'],block=data[role];if(!p?.name||typeof block!=='string')return;
 const prefix=p.name+'\n',contact=[p.contactName,p.phone,p.email].filter(Boolean).join(' / '),suffix=contact?'\n'+contact:'';
 if(block.startsWith(prefix)&&(!suffix||block.endsWith(suffix))){const address=block.slice(prefix.length,suffix?-suffix.length:undefined);data[role+'Party']={...p,address};}
}

// SR and work forms share current business values; the request revision history
// and saved output copies remain append-only. Foreign-owned SRs are untouched.
export function prepareSharedJob(before:any,next:any,source:'WORK'|'SR'='WORK'){
 const data=copy(next),old=source==='WORK'?shippingWorkData(before.data||{}):before.data||{},now=source==='WORK'?shippingWorkData(data):data;
 for(const key of sharedFields)if(!Object.hasOwn(data,key)&&old[key]!==undefined)data[key]=copy(old[key]);
 if(source==='SR'&&!equal(old.cbm,data.cbm)&&!Object.hasOwn(next,'cbmFormula'))data.cbmFormula='';
 const working={...(before.data?.workDetails||{}),...(data.workDetails||{})};
 for(const key of sharedFields){
  if(!equal(old[key],now[key])){if(now[key]!==undefined)data[key]=copy(now[key]);if(Object.hasOwn(working,key)&&(source==='WORK'||equal(working[key],old[key])))working[key]=copy(now[key]);}
 }
 for(const role of ['shipper','consignee','notify']){
  if(source==='SR'&&!equal(before.data?.[role+'Party'],data[role+'Party'])){
   const actual=role==='notify'&&data.notifySameAsConsignee?'consignee':role;
   if(data[actual+'Party'])data[role]=partyBlock(data[actual+'Party']);
   if(Object.hasOwn(working,role)&&equal(working[role],partyBlock(before.data?.[role+'Party'])||before.data?.[role]))working[role]=data[role];
  }
  if(source==='WORK'&&!equal(old[role],now[role]))updatePartyAddress(data,role);
 }
 if(Object.keys(working).length)data.workDetails=working;
 const request=copy(before.requestSnapshot);
 if(request&&(before.requestCreatedByOrgId??before.orgId)===before.orgId){
  for(const key of publicFields)if(!equal(before.data?.[key],data[key])&&data[key]!==undefined)request.data[key]=key.endsWith('Party')&&data[key]?Object.fromEntries(['name','address','contactName','phone','email'].filter(k=>data[key][k]!==undefined).map(k=>[k,data[key][k]])):copy(data[key]);
 }
 return {data,requestSnapshot:request};
}

export function sharedBillSource(job:any){
 const d=shippingWorkData(job.data||{}),result:any={};
 for(const key of sharedFields)if(d[key]!==undefined)result[key]=copy(d[key]);
 result.billTo=d.billTo||d.customer?.name||'';
 for(const role of ['shipper','consignee','notify']){
  const actual=role==='notify'&&d.notifySameAsConsignee?'consignee':role;
  if(!Object.hasOwn(job.data?.workDetails||{},role)&&d[actual+'Party'])result[role]=partyBlock(d[actual+'Party']);
 }
 if(job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)){
  result.origin=d.routeLocations?.ORIGIN_TERMINAL||d.originPortCode||d.origin||'';
  result.destination=d.routeLocations?.DESTINATION_TERMINAL||d.destinationPortCode||d.destination||'';
  result.placeOfReceipt=d.placeOfReceipt||d.origin||'';result.placeOfDelivery=d.placeOfDelivery||d.destination||'';
 }
 return result;
}

async function audit(tx:any,orgId:number,actorId:number,entity:string,before:any,after:any){
 await tx.$executeRawUnsafe('INSERT INTO "FreightAudit"(id,"orgId",entity,"sourceId",version,"actorId","before","after") VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',randomUUID(),orgId,entity,after.id,after.version,actorId,JSON.stringify(before),JSON.stringify(after));
}
async function ownBills(tx:any,job:any){
 return tx.$queryRawUnsafe(`SELECT b.*, (SELECT count(*)::int FROM "FreightJobMaster" l WHERE l."masterBillId"=b.id AND l."orgId"=b."orgId" AND l."deletedAt" IS NULL) AS "linkedJobs" FROM "FreightBill" b WHERE b."orgId"=$1 AND b."jobId"=$2 AND b."deletedAt" IS NULL ORDER BY b.id FOR UPDATE OF b`,job.orgId,job.id);
}
function allowed(bill:any,bills:any[],key:string){
 // A consolidated Master or a House allocation is not the shipment total.
 if(bill.kind==='MASTER'&&bill.linkedJobs>1)return false;
 if(totals.has(key)&&(bills.filter(b=>b.kind==='HOUSE').length>1||bills.filter(b=>b.kind==='MASTER').length>1))return false;
 return true;
}
export async function syncBillsFromJob(tx:any,actorId:number,before:any,after:any,exclude?:string){
 const old=sharedBillSource(before),next=sharedBillSource(after),bills=await ownBills(tx,after);
 for(const bill of bills){
  if(bill.id===exclude)continue;const data={...bill.data};let changed=false;
  for(const key of sharedFields){
   if(!allowed(bill,bills,key)||equal(old[key],next[key])||next[key]===undefined)continue;
   if(data[key]===undefined||equal(data[key],old[key])){data[key]=copy(next[key]);changed=true;}
  }
  if(!changed)continue;
  const updated=(await tx.$queryRawUnsafe('UPDATE "FreightBill" SET data=$1::jsonb,version=version+1,"updatedByEmployeeId"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$3 AND "orgId"=$4 RETURNING *',JSON.stringify(data),actorId,bill.id,after.orgId))[0];
  const {linkedJobs,...original}=bill;await audit(tx,after.orgId,actorId,'bill-shared-sync',original,updated);
 }
}

export async function syncJobFromBill(tx:any,actorId:number,job:any,before:any,after:any){
 if(!before)return job; // Creation copies defaults; it is not an edit of the SR.
 const bills=await ownBills(tx,job),bill=bills.find((b:any)=>b.id===after.id);
 if(!bill||bill.kind==='MASTER'&&bill.linkedJobs>1)return job;
 const source=sharedBillSource(job),data=copy(job.data),working={...data.workDetails};let changed=false;
 for(const key of sharedFields){
  if(!allowed(bill,bills,key)||equal(before.data?.[key],after.data?.[key])||after.data?.[key]===undefined)continue;
  // Never infer a party FK from a free-text company name or replace a forwarder
  // Master party with the customer's House party.
  if(before.data?.[key]!==undefined&&!equal(before.data[key],source[key]))continue;
  const value=copy(after.data[key]);
  if(['shipper','consignee','notify'].includes(key)&&String(value).split('\n')[0]!==String(source[key]).split('\n')[0])continue;
  if(['origin','destination'].includes(key)&&job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)){
   const codeKey=key==='origin'?'originPortCode':'destinationPortCode';
   // A free-text BL port edit cannot silently relabel a different saved port FK.
   // Actual port selection on the SR carries the verified code and propagates down.
   if(job.mode==='SEA'&&data[codeKey]&&!String(value).includes(data[codeKey]))continue;
   const node=key==='origin'?'ORIGIN_TERMINAL':'DESTINATION_TERMINAL';data.routeLocations={...data.routeLocations,[node]:value};
   if(data.workScope?.[key==='origin'?'start':'end']===node){data[key]=value;working[key]=value;}
  }else{data[key]=value;working[key]=value;}
  changed=true;
 }
 if(!changed)return job;
 data.workDetails=working;const prepared=prepareSharedJob(job,data);
 const saved=(await tx.$queryRawUnsafe('UPDATE "FreightJob" SET data=$1::jsonb,"requestSnapshot"=$2::jsonb,version=version+1,"updatedByEmployeeId"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$4 AND "orgId"=$5 RETURNING *',JSON.stringify(prepared.data),JSON.stringify(prepared.requestSnapshot),actorId,job.id,job.orgId))[0];
 await audit(tx,job.orgId,actorId,'bill-job-shared-sync',job,saved);await syncBillsFromJob(tx,actorId,job,saved,after.id);return saved;
}

// Explicit company FK only, within the editor's company. No name matching and no
// writes to another tenant's source profile or saved document snapshots.
export async function syncPartnerDocuments(tx:any,orgId:number,actorId:number,entityId:number,before:any,next:any){
 const jobs=await tx.$queryRawUnsafe(`SELECT * FROM "FreightJob" WHERE "orgId"=$1 AND "receiptStatus"='ACCEPTED' AND status<>'CANCELLED' AND ("customerId"=$2 OR data->>'shipperId'=$3 OR data->>'consigneeId'=$3 OR data->>'notifyId'=$3) ORDER BY id FOR UPDATE`,orgId,entityId,String(entityId));
 for(const job of jobs){
  const data=copy(job.data),work={...data.workDetails};
  for(const role of ['shipper','consignee','notify'])if(data[role+'Id']===entityId){
   const old=data[role+'Party'];if(!old)continue;const party={...old};
   for(const key of ['name','nameKo','nameVi','address','contactName','phone','email'])if(!equal(before[key],next[key])&&equal(old[key],before[key]))party[key]=next[key];
   data[role+'Party']=party;
   if(!data[role]||equal(data[role],partyBlock(old)))data[role]=partyBlock(party);
   if(equal(work[role],partyBlock(old)))work[role]=partyBlock(party);
   const node=role==='shipper'?'ORIGIN_DOOR':role==='consignee'?'DESTINATION_DOOR':null;
   if(node&&equal(data.routeLocations?.[node],old.address)){
    data.routeLocations={...data.routeLocations,[node]:party.address};
    const endpoint=role==='shipper'?'origin':'destination';if(equal(data[endpoint],old.address))data[endpoint]=party.address;if(equal(work[endpoint],old.address))work[endpoint]=party.address;
    if(data.routeLocationDetails?.[node])data.routeLocationDetails={...data.routeLocationDetails,[node]:{...data.routeLocationDetails[node],...(equal(data.routeLocationDetails[node].label,old.name)?{label:party.name}:{})}};
   }
  }
  if(job.customerId===entityId){data.customer={...data.customer};for(const key of ['name','nameKo','nameVi','address','contactName','phone','email'])if(!equal(before[key],next[key])&&equal(data.customer[key],before[key]))data.customer[key]=next[key];}
  if(Object.keys(work).length)data.workDetails=work;if(equal(data,job.data))continue;
  const prepared=prepareSharedJob(job,data,'SR');
  const saved=(await tx.$queryRawUnsafe('UPDATE "FreightJob" SET data=$1::jsonb,"requestSnapshot"=$2::jsonb,version=version+1,"updatedByEmployeeId"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$4 AND "orgId"=$5 RETURNING *',JSON.stringify(prepared.data),JSON.stringify(prepared.requestSnapshot),actorId,job.id,orgId))[0];
  await audit(tx,orgId,actorId,'party-shared-sync',job,saved);await syncBillsFromJob(tx,actorId,job,saved);
 }
}
