export const workFields=['shipper','consignee','notify','origin','destination','placeOfReceipt','placeOfDelivery','cargo','marks','quantity','unit','weightKg','cbm','cbmFormula','chargeableWeightKg','freightTerms','incoterms','remark','plannedDate','routeDateORIGIN_DOOR','routeDateORIGIN_TERMINAL','routeDateDESTINATION_TERMINAL','routeDateDESTINATION_DOOR'];
export function shippingWorkData(data){return {...data,...data.workDetails};}
// Dimensions are metres. Apply only on explicit action; never replace saved totals on read.
export function shippingPackageTotals(rows){
 if(!rows.length)return null;
 let quantity=0n,volume=0n;
 for(const row of rows){
  if(!row||!/^\d{1,8}$/.test(row.quantity)||BigInt(row.quantity)<1n)return null;
  const dimensions=['lengthM','widthM','heightM'].map(key=>row[key]);
  if(dimensions.some(value=>typeof value!=='string'||!/^\d{1,10}(?:\.\d{1,6})?$/.test(value)||!Number(value)))return null;
  const fixed=value=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));};
  quantity+=BigInt(row.quantity);volume+=BigInt(row.quantity)*dimensions.map(fixed).reduce((a,b)=>a*b,1n);
 }
 if(volume>=1000000000000n*10n**18n)return null;
 const rounded=(volume+5n*10n**13n)/10n**14n;
 return {quantity:String(quantity),cbm:`${rounded/10000n}.${String(rounded%10000n).padStart(4,'0')}`};
}
export function shippingWorkValues(job){
 const d=shippingWorkData(job.data),result={};
 for(const key of ['assigneeId','vessel','voyage','etd','eta',...workFields])result[key]=d[key]??(key==='assigneeId'?null:['quantity','weightKg','cbm'].includes(key)?'0':key==='unit'?'PKG':'');
 for(const role of ['shipper','consignee','notify'])if(!Object.hasOwn(job.data.workDetails||{},role)){
  const actual=role==='notify'&&d.notifySameAsConsignee?'consignee':role,p=d[actual+'Party'];
  result[role]=p?[p.name,p.address,[p.contactName,p.phone,p.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n'):d[actual]||'';
 }
 result.customerId=job.customerId??job.data.customer?.id??null;result.containers=d.containers||[];result.packages=d.packages||[];return result;
}
