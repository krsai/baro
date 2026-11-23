const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// These are review copies, without carrier branding, terms or an invented signature.
// Previously saved legacy snapshots retain their original renderer.
export function transportFormHtml(document){
 const {issuer,source}=document.snapshot,d=source.data,kind=document.kind;
 const names={BILL_OF_LADING:'BILL OF LADING',SEA_WAYBILL:'SEA WAYBILL',AIR_WAYBILL:'AIR WAYBILL',WAYBILL:'CONSIGNMENT NOTE'};
 const title=kind==='MASTER_DRAFT'?'MASTER '+(names[source.documentType]||'WAYBILL'):kind==='HOUSE_DRAFT'?names[source.documentType]||'WAYBILL':{AN:'ARRIVAL NOTICE',DO:'DELIVERY ORDER',POD:'PROOF OF DELIVERY',MANIFEST:'CARGO MANIFEST'}[kind];
 const box=(label,value,extra='')=>`<section class="field ${extra}"><label>${esc(label)}</label><div>${esc(value)}</div></section>`;
 const pair=(a,b)=>`<div class="pair">${a}${b}</div>`;
 const reference=pair(box('DOCUMENT REFERENCE',document.number),box('SHIPMENT / BILL REFERENCE',[source.number,source.bill?.number].filter(Boolean).join(' / ')));
 const parties=pair(box('SHIPPER / CONSIGNOR',d.shipper),box('CONSIGNEE',d.consignee));
 const route=pair(box(source.mode==='AIR'?'AIRPORT OF DEPARTURE':'PLACE / PORT OF RECEIPT',d.origin),box(source.mode==='AIR'?'AIRPORT OF DESTINATION':'PLACE / PORT OF DELIVERY',d.destination));
 const voyage=pair(box('VESSEL / FLIGHT / VOYAGE',[d.vessel,d.voyage].filter(Boolean).join(' / ')),box('ETD / ETA',[d.etd,d.eta].filter(Boolean).join(' / ')));
 const cargo=`<table class="cargo"><thead><tr>${['MARKS / NUMBERS','PACKAGES','DESCRIPTION OF GOODS','GROSS WEIGHT (KG)','MEASUREMENT (CBM)'].map(text=>`<th>${text}</th>`).join('')}</tr></thead><tbody><tr><td>${esc(d.marks)}</td><td>${esc([d.quantity,d.unit].filter(Boolean).join(' '))}</td><td>${esc(d.cargo)}${d.hsCode?'<br>HS: '+esc(d.hsCode):''}</td><td>${esc(d.weightKg)}</td><td>${esc(d.cbm)}</td></tr></tbody></table>`;
 const signatures=(left,right)=>pair(box(left,'','signature'),box(right,'','signature'));
 let content='';
 if(['MASTER_DRAFT','HOUSE_DRAFT'].includes(kind)){
  content=reference+parties+pair(box('NOTIFY PARTY',d.notify),box('ISSUED BY',[issuer.name,source.bill?.issuer].filter(Boolean).join('\n')))+route+voyage+cargo;
  if(source.documentType==='AIR_WAYBILL')content+=pair(box('ACCOUNTING INFORMATION / CHARGES',''),box('SPECIAL HANDLING / DECLARED VALUE',''));
  else content+=pair(box('FREIGHT / INCOTERMS',[d.freightTerms,d.incoterms].filter(Boolean).join(' / ')),box('MASTER REFERENCE',source.master?.number));
  content+=signatures('PLACE / DATE OF EXECUTION','ISSUER SIGNATURE — NOT EXECUTED');
 }else if(kind==='AN'){
  content=reference+pair(box('NOTIFY TO / CONSIGNEE',d.consignee),box('NOTIFY PARTY',d.notify))+route+voyage+cargo+pair(box('ARRIVAL / COLLECTION INSTRUCTIONS',''),box('CHARGES / PAYMENT REFERENCE',''))+signatures('PREPARED BY','DATE');
 }else if(kind==='DO'){
  content=reference+pair(box('RELEASE TO / CONSIGNEE',d.consignee),box('DELIVERING PARTY',issuer.name))+route+voyage+cargo+box('DELIVERY / RELEASE INSTRUCTIONS','')+signatures('AUTHORIZED RELEASE SIGNATURE — NOT EXECUTED','RECEIVING PARTY / DATE');
 }else if(kind==='POD'){
  content=reference+parties+route+cargo+pair(box('RECORDED DELIVERY DATE',d.deliveryDate),box('RECORDED RECIPIENT',d.recipient))+box('DELIVERY CONDITION / EXCEPTIONS','')+signatures('RECEIVER SIGNATURE / DATE — NOT CONFIRMED','DELIVERING PERSON / DATE');
 }else{
  const packages=d.packages?.length?d.packages:d.containers?.length?d.containers:[{quantity:d.quantity,weightKg:d.weightKg,cbm:d.cbm}];
  content=reference+route+voyage+parties+`<table><thead><tr>${['LINE','MARKS / CONTAINER','PACKAGES','GOODS / DIMENSIONS','WEIGHT (KG)','CBM'].map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${packages.map((p,index)=>`<tr>${[index+1,p.label||[p.size,p.type].filter(Boolean).join(' '),p.quantity??p.count,[d.cargo,p.lengthM&&`${p.lengthM} × ${p.widthM} × ${p.heightM} m`].filter(Boolean).join('\n'),p.weightKg,p.cbm].map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`+signatures('PREPARED BY','CHECKED BY');
 }
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(document.number)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#111;margin:0}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:12px}h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:0 0 5px}header p{margin:3px 0;white-space:pre-wrap}.badge{font-weight:bold;border:2px solid #555;padding:6px 12px;white-space:nowrap;letter-spacing:2px}.form{border:1px solid #222}.pair{display:grid;grid-template-columns:1fr 1fr}.field{border-bottom:1px solid #555;padding:7px 9px;min-height:52px;overflow-wrap:anywhere;break-inside:avoid}.pair>.field:first-child{border-right:1px solid #555}.field label{display:block;font-size:9px;font-weight:bold;margin-bottom:5px}.field div{white-space:pre-wrap;line-height:1.45}.signature{min-height:75px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #555;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{font-size:9px}table.cargo tbody td{height:130px}footer{font-size:9px;line-height:1.5;margin-top:10px;color:#444}@media screen{body{max-width:186mm;margin:20px auto;padding:12px;background:#fff}}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><header><div><h2>${esc(issuer.name)}</h2><p>${esc(issuer.address)}</p><p>${esc([issuer.representative,issuer.phone,issuer.email].filter(Boolean).join(' / '))}</p></div><div><h1>${esc(title)}</h1><span class="badge">DRAFT / FOR REVIEW</span></div></header><main class="form">${content}</main><footer>Saved source version: ${esc(document.sourceVersion)} · Document: ${esc(document.number)}<br>Review copy only. This printout is not an original negotiable bill of lading, carrier-issued air waybill, release authorization or signed receipt. No carrier terms, execution or approval are implied.</footer></body></html>`;
}
