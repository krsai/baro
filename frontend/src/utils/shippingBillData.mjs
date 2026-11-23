export const billFields=['shipper','consignee','notify','deliveryAgent','vessel','voyage','origin','destination','placeOfReceipt','placeOfDelivery','etd','eta','issueDate','issuePlace','marks','cargo','quantity','unit','weightKg','cbm','freightTerms'];
export const requiresBillHierarchy=job=>job?.service!=='EXPRESS'&&['SEA','AIR'].includes(job?.mode);
const routeFields=['vessel','voyage','origin','destination','placeOfReceipt','placeOfDelivery','etd','eta'];
export function initialBillData(job,bill,parent){
 const source=job.data||{},result=Object.fromEntries(billFields.map(key=>[key,String(source[key]??'')]));
 for(const role of ['shipper','consignee','notify']){
  const party=source[(role==='notify'&&source.notifySameAsConsignee?'consignee':role)+'Party'];
  if(party)result[role]=[party.name,party.address,[party.contactName,party.phone,party.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n');
  else if(role==='notify'&&source.notifySameAsConsignee)result.notify=String(source.consignee||'');
 }
 if(parent)for(const key of routeFields)if(parent.data?.[key]!==undefined)result[key]=parent.data[key];
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
