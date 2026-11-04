import {calculateProfitScenario,createProfitInputs,PACKAGING_KEYS} from './profitScenario.mjs';
import {convertAccountBalances} from './accountBalanceConversion.mjs';
export const orderCostDefaults=()=>({...createProfitInputs(),costMode:'linked',packaging:false,productionPay:0,otherUnitCost:0,usdVnd:'',usdKrw:'',laborSource:'AUTO',factoryId:''});
export const orderStyleRecordId=(orderId,styleId)=>`order-${orderId}-style-${styleId}`;
export function orderStyleProfit(style,defaults,override={},pack={},rates={},laborBasis=null){
 const input={...orderCostDefaults(),...defaults};
 for(const key of PACKAGING_KEYS)if(pack[key]!==undefined&&(!['polyPrice','boxPrice'].includes(key)||pack.currency===input.currency))input[key]=pack[key];
 const local={...override};
 if(local.currency&&local.currency!==input.currency)for(const key of ['baseMonthly','allowanceMonthly','supportMonthly','rentMonthly','productionPay','otherUnitCost','polyPrice','boxPrice'])delete local[key];
 Object.assign(input,local);
 input.costMode='linked';
 // Saved order quantities and prices are authoritative, never scenario inputs.
 input.quantity=style.quantity;input.currency=defaults.currency||'VND';
 input.stSeconds=override.stSeconds??style.sources?.times.ST??'';
 input.ptSeconds=override.ptSeconds??style.sources?.times.PT??'';
 const convert=(amount,currency)=>amount===null||amount===undefined||!currency?null:convertAccountBalances([{balance:String(amount),currencyCode:currency}],input.currency,rates);
 let automaticLabor=false;
 if(input.laborSource!=='MANUAL'&&laborBasis?.directCount>0){
  automaticLabor=true;
  const convertRate=amount=>{
   if(amount===null||amount===undefined)return null;
   if(laborBasis.currencyCode===input.currency)return Number(amount);
   const from=Number(rates[laborBasis.currencyCode]),to=Number(rates[input.currency]);return from>0&&to>0?Number(amount)*to/from:null;
  };
  const monthHours=Number(input.hoursDay)*Number(input.workdays),selectedSeconds=Number(input[input.basis==='PT'?'ptSeconds':'stSeconds']);
  const monthly=rate=>{const converted=convertRate(rate);return converted===null?'':converted*monthHours;};
  input.baseMonthly=monthly(laborBasis.baseHourly);input.allowanceMonthly=monthly(laborBasis.allowanceHourly);input.supportMonthly=monthly(laborBasis.supportHourly);
  input.factoryWorkers=laborBasis.directCount;
  const pieceRate=convertRate(laborBasis.productionPerSecond);input.productionPay=pieceRate===null?'':pieceRate*selectedSeconds;
 }
 const revenue=convert(style.salesAmount,style.currency);
 input.salePrice=revenue!==null&&style.quantity>0?Number(revenue)/style.quantity:'';
 const approved=(style.sources?.costs||[]).filter(row=>row.exact&&row.approved&&row.subtotal!==null);
 const converted=approved.map(row=>convert(row.subtotal,row.currency)),purchase=converted.some(value=>value===null)?null:converted.reduce((sum,value)=>sum+Number(value),0);
 const extra=Number(input.otherUnitCost||0)*style.quantity;
 const result=calculateProfitScenario(input,{linkedAmount:purchase===null||!Number.isFinite(extra)?null:purchase+extra});
 const ready=result.ready&&revenue!==null;
 const laborItems=[result.costs.base,result.costs.allowance,result.costs.production,result.costs.support],laborComplete=laborItems.every(value=>value!==null),knownLabor=laborItems.reduce((sum,value)=>sum+(value??0),0);
 return {...result,ready,automaticLabor,laborComplete,labor:knownLabor,laborMissing:result.missing.filter(key=>['baseMonthly','allowanceMonthly','productionPay','supportMonthly','stSeconds','ptSeconds','workers','hoursDay','workdays','factoryWorkers'].includes(key)),total:ready?result.total:null,profit:ready?Number(revenue)-result.total:null,margin:ready&&Number(revenue)>0?(Number(revenue)-result.total)/Number(revenue)*100:null,revenue:revenue===null?null:Number(revenue),purchase,input,approvedCount:approved.length};
}
export function orderProfitTotals(rows,missingStyle=false,commonPurchase=0){
 const all=(field)=>rows.length&&!missingStyle&&rows.every(row=>row[field]!==null&&row[field]!==undefined)?rows.reduce((sum,row)=>sum+row[field],0):null;
 const revenue=all('revenue'),styleProfit=all('profit'),profit=styleProfit!==null&&commonPurchase!==null?styleProfit-commonPurchase:null;
 const add=value=>value!==null&&commonPurchase!==null?value+commonPurchase:null;
 return {revenue,purchase:add(all('purchase')),days:all('days'),total:add(all('total')),profit,margin:profit!==null&&revenue>0?profit/revenue*100:null};
}
export function orderCommonPurchase(styles,currency,rates){
 const allocated=new Set(styles.flatMap(style=>style.sources.costs.filter(row=>row.exact).map(row=>row.id)));
 const unique=[...new Map(styles.flatMap(style=>style.sources.costs).map(row=>[row.id,row])).values()];
 const rows=unique.filter(row=>row.withinOrder&&!allocated.has(row.id)&&row.approved&&row.subtotal!==null);
 const values=rows.map(row=>convertAccountBalances([{balance:String(row.subtotal),currencyCode:row.currency}],currency,rates));
 return {rows,amount:values.some(value=>value===null)?null:values.reduce((sum,value)=>sum+Number(value),0)};
}
