export const workFields=['shipper','consignee','notify','origin','destination','placeOfReceipt','placeOfDelivery','cargo','marks','quantity','unit','weightKg','cbm','freightTerms','incoterms','remark','plannedDate'];
export function shippingWorkData(data){return {...data,...data.workDetails};}
export function shippingWorkValues(job){
 const d=shippingWorkData(job.data),result={};
 for(const key of ['assigneeId','vessel','voyage','etd','eta',...workFields])result[key]=d[key]??(key==='assigneeId'?null:'');
 for(const role of ['shipper','consignee','notify'])if(!Object.hasOwn(job.data.workDetails||{},role)){
  const actual=role==='notify'&&d.notifySameAsConsignee?'consignee':role,p=d[actual+'Party'];
  result[role]=p?[p.name,p.address,[p.contactName,p.phone,p.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n'):d[actual]||'';
 }
 result.containers=d.containers||[];return result;
}
