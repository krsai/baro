import {shippingWorkData} from './shippingWorkData.mjs';
export const billFields=['shipper','consignee','notify','deliveryAgent','vessel','voyage','origin','destination','placeOfReceipt','placeOfDelivery','etd','eta','issueDate','issuePlace','marks','cargo','quantity','unit','weightKg','cbm','cbmFormula','freightTerms','billTo','incoterms','preCarriage','finalDestination','totalPackagesWords','revenueTons','rate','ratePer','prepaid','collect','freightPayableAt','originalCount','onBoardDate','releaseType','surrenderStatus','surrenderRequestedAt','surrenderConfirmedAt','surrenderReference','surrenderReason','logoDataUrl'];
export const requiresBillHierarchy=job=>job?.service!=='EXPRESS'&&['SEA','AIR'].includes(job?.mode);
const routeFields=['vessel','voyage','origin','destination','placeOfReceipt','placeOfDelivery','etd','eta'];
export function initialBillData(job,bill,parent,forwarder){
 if(bill.version){const containers=shippingWorkData(job.data||{}).containers;return {...bill.data,...(bill.data?.containers===undefined&&containers&&!(bill.kind==='MASTER'&&bill.linkedJobCount>1)?{containers:structuredClone(containers)}:{})};}
 const source=shippingWorkData(job.data||{}),result=Object.fromEntries(billFields.map(key=>[key,String(source[key]??(['quantity','weightKg','cbm'].includes(key)?'0':key==='unit'?'PKG':''))]));
 if(job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)){
  result.origin=String(source.routeLocations?.ORIGIN_TERMINAL||source.originPortCode||source.origin||'');
  result.destination=String(source.routeLocations?.DESTINATION_TERMINAL||source.destinationPortCode||source.destination||'');
  result.placeOfReceipt=String(source.placeOfReceipt||source.origin||'');
  result.placeOfDelivery=String(source.placeOfDelivery||source.destination||'');
 }
 for(const role of ['shipper','consignee','notify']){
  const party=source[(role==='notify'&&source.notifySameAsConsignee?'consignee':role)+'Party'];
  if(Object.hasOwn(job.data.workDetails||{},role))continue;
  if(party)result[role]=[party.name,party.address,[party.contactName,party.phone,party.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n');
  else if(role==='notify'&&source.notifySameAsConsignee)result.notify=String(source.consignee||'');
 }
 result.billTo=source.billTo||source.customer?.name||'';
 result.containers=structuredClone(source.containers||[]);
 if(parent)for(const key of routeFields)if(parent.data?.[key]!==undefined)result[key]=parent.data[key];
 if(!bill.version&&bill.kind==='MASTER'&&bill.partyMode==='FORWARDER'){
  const text=[forwarder?.name,forwarder?.address,[forwarder?.representative,forwarder?.phone,forwarder?.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n');
  for(const role of ['shipper','consignee','notify'])result[role]=text;
 }
 if(Object.hasOwn(bill.data||{},'cbm')&&!Object.hasOwn(bill.data||{},'cbmFormula'))delete result.cbmFormula;
 if(forwarder?.logoDataUrl)result.logoDataUrl=forwarder.logoDataUrl;
 if(job.mode==='SEA'){result.releaseType='ORIGINAL';result.surrenderStatus='NONE';}
 return {...result,...bill.data};
}
export function billHierarchy(bills){
 const result=[];
 for(const master of bills.filter(row=>row.kind==='MASTER')){
  result.push({...master,depth:0});
  result.push(...bills.filter(row=>row.kind==='HOUSE'&&row.masterId===master.id).map(row=>({...row,depth:1})));
 }
 const ids=new Set(result.map(row=>row.id));
 return [...result,...bills.filter(row=>!ids.has(row.id)).map(row=>({...row,depth:1,unlinked:true}))];
}
