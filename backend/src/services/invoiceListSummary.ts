import {money4,decimal4} from './invoiceSettlement';

// Use the issued snapshot, never today's order/style names or ordered quantities.
export function invoiceListItemSummary(snapshot:any,documentKind='ORDER'){
 const lines=Array.isArray(snapshot?.lines)?snapshot.lines:[];
 const descriptions=new Map<string,string>(),quantities=new Map<string,bigint>();
 let quantitiesKnown=lines.length>0;
 for(const line of lines){
  const description=line.styleName||line.description||line.styleCode;
  if(description){
   const key=documentKind==='ORDER'?JSON.stringify(line.styleId??line.styleCode??description):JSON.stringify([description,line.unit||'']);
   if(!descriptions.has(key))descriptions.set(key,description);
  }
  const unit=documentKind==='ORDER'?'GARMENT':String(line.unit||'');
  try{
   if(line.quantity==null)throw new Error('missing quantity');
   quantities.set(unit,(quantities.get(unit)||0n)+money4(line.quantity));
  }catch{quantitiesKnown=false;}
 }
 return {firstDescription:[...descriptions.values()][0]||'',additionalCount:Math.max(0,descriptions.size-1),
  quantities:quantitiesKnown?[...quantities].map(([unit,quantity])=>({unit,quantity:decimal4(quantity)})):[]};
}
