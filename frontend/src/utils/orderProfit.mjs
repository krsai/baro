import {calculateProfitScenario,createProfitInputs,PACKAGING_KEYS,packagingGeometry} from './profitScenario.mjs';
import {convertAccountBalances} from './accountBalanceConversion.mjs';
export const orderCostDefaults=()=>({...createProfitInputs(),costMode:'linked',packaging:false,productionPay:0,otherUnitCost:0,usdVnd:'',usdKrw:'',laborSource:'AUTO',factoryId:'',atSeconds:'',packWaste:0,polyPayer:'COMPANY',boxPayer:'COMPANY',includedPayroll:[...PAYROLL_KEYS],excludedCostIds:[],includePurchases:true,includeRent:true,includeOther:true,includeOffice:false,includeFactory:false,officeMonthly:'',factoryOtherMonthly:''});
export const orderStyleRecordId=(orderId,styleId)=>orderId?`order-${orderId}-style-${styleId}`:`style-${styleId}-analysis`;
export const PAYROLL_KEYS=['officeFixedMonthly','productionFixedMonthly','variableBaseMonthly','variableAllowanceMonthly','variableProductionMonthly'];
export function companyPayroll(company,currency,rates={},fallback={}){
 return Object.fromEntries(PAYROLL_KEYS.map(key=>{
  if(Array.isArray(fallback.includedPayroll)&&!fallback.includedPayroll.includes(key))return [key,0];
  let total=0,complete=Boolean(company?.pools?.length);
  for(const pool of company?.pools||[]){const value=pool[key];if(value===null||value===undefined){complete=false;continue;}if(Number(value)===0)continue;const converted=convertAccountBalances([{balance:String(value),currencyCode:pool.currencyCode}],currency,rates);if(converted===null)complete=false;else total+=Number(converted);}
  const manual=fallback[key];return [key,complete?total:manual!==''&&manual!=null&&Number.isFinite(Number(manual))?Number(manual):null];
 }));
}
export function regularOrderCrew(styles,inputs,override=()=>({})){
 const hours=Number(inputs.hoursDay),days=Number(inputs.targetDays),productivity=Number(inputs.productivity);
 if(!styles?.length||!(hours>0&&days>0&&productivity>0))return null;
 let seconds=0;for(const style of styles){const key=inputs.basis==='AT'?'atSeconds':inputs.basis==='PT'?'ptSeconds':'stSeconds',value=inputs.basis==='AT'?style.sources?.times?.AT:override(style.styleId)[key]??style.sources?.times?.[inputs.basis];if(value===''||value==null||!(Number(value)>0))return null;seconds+=Number(value)*Number(style.quantity);}
 return seconds/3600/(productivity/100)/hours/days;
}
export function orderStyleProfit(style,defaults,override={},pack={},rates={},laborBasis=null){
 const input={...orderCostDefaults(),...defaults};
 for(const key of [...PACKAGING_KEYS,'polyPayer','boxPayer'])if(pack[key]!==undefined&&(!['polyPrice','boxPrice'].includes(key)||pack.currency===input.currency))input[key]=pack[key];
 const local={...override};
 if(local.currency&&local.currency!==input.currency)for(const key of ['baseMonthly','allowanceMonthly','supportMonthly','rentMonthly','productionPay','otherUnitCost','polyPrice','boxPrice'])delete local[key];
 Object.assign(input,local);
 if(laborBasis?.calendar){input.workdays=laborBasis.calendar.regularWorkdays;input.hoursDay=laborBasis.calendar.standardWorkMinutes/60;}
 input.packedCbmPerPiece=override.packedCbmPerPiece??pack.packedCbmPerPiece??style.sources?.packedCbmPerPiece??input.packedCbmPerPiece;
 if(Number(input.packedCbmPerPiece)>0)input.boxCapacity=packagingGeometry(input).capacity??'';
 input.costMode='linked';
 // Saved order quantities and prices are authoritative, never scenario inputs.
 input.quantity=style.quantity;input.currency=defaults.currency||'VND';
 input.stSeconds=override.stSeconds??style.sources?.times.ST??'';
 input.ptSeconds=override.ptSeconds??style.sources?.times.PT??'';
 input.atSeconds=style.sources?.times.AT??'';
 input.packWaste=0;
 if(input.packaging&&!(Number(input.packedCbmPerPiece)>0))input.boxCapacity='';
 const convert=(amount,currency)=>amount===null||amount===undefined||!currency?null:convertAccountBalances([{balance:String(amount),currencyCode:currency}],input.currency,rates);
 let automaticLabor=false,companyMonthly=null;
 if(input.laborSource!=='MANUAL'&&(laborBasis?.company||PAYROLL_KEYS.some(key=>input[key]!==undefined&&input[key]!==''))){
  automaticLabor=true;
  companyMonthly=companyPayroll(laborBasis?.company,input.currency,rates,input);
  const perWorker=value=>value!==null&&Number(input.workers)>0?value/Number(input.workers):'';
  input.baseMonthly=perWorker(companyMonthly.variableBaseMonthly);input.allowanceMonthly=perWorker(companyMonthly.variableAllowanceMonthly);
  input.supportMonthly=companyMonthly.officeFixedMonthly!==null&&companyMonthly.productionFixedMonthly!==null?companyMonthly.officeFixedMonthly+companyMonthly.productionFixedMonthly:'';
  // The entire company's period payroll is charged. Crew size determines
  // duration, never a discount on the monthly payroll or fixed costs.
  input.factoryWorkers=input.workers;
  const seconds=Number(input[input.basis==='AT'?'atSeconds':input.basis==='PT'?'ptSeconds':'stSeconds']),denominator=Number(input.workers)*Number(input.hoursDay)*Number(input.workdays)*3600;
  input.productionPay=companyMonthly.variableProductionMonthly!==null&&denominator>0?companyMonthly.variableProductionMonthly*seconds/denominator:'';
 }
 else if(input.laborSource!=='MANUAL'&&laborBasis?.directCount>0){
  automaticLabor=true;
  const convertRate=amount=>{
   if(amount===null||amount===undefined)return null;
   if(laborBasis.currencyCode===input.currency)return Number(amount);
   const from=Number(rates[laborBasis.currencyCode]),to=Number(rates[input.currency]);return from>0&&to>0?Number(amount)*to/from:null;
  };
  const monthHours=Number(input.hoursDay)*Number(input.workdays),selectedSeconds=Number(input[input.basis==='AT'?'atSeconds':input.basis==='PT'?'ptSeconds':'stSeconds']);
  const monthly=rate=>{const converted=convertRate(rate);return converted===null?'':converted*monthHours;};
  input.baseMonthly=monthly(laborBasis.baseHourly);input.allowanceMonthly=monthly(laborBasis.allowanceHourly);input.supportMonthly=monthly(laborBasis.supportHourly);
  input.factoryWorkers=laborBasis.directCount;
  const pieceRate=convertRate(laborBasis.productionPerSecond);input.productionPay=pieceRate===null?'':pieceRate*selectedSeconds;
 }
 const revenue=convert(style.salesAmount,style.currency);
 input.salePrice=revenue!==null&&style.quantity>0?Number(revenue)/style.quantity:'';
 const excluded=new Set((input.excludedCostIds||[]).map(String));
 const approved=(style.sources?.costs||[]).filter(row=>row.exact&&row.approved&&row.subtotal!==null&&!excluded.has(String(row.id)));
 const converted=style.analysisMode==='STYLE'?(style.sources.estimatedPurchases||[]).map(row=>{const parts=row.sources?.filter(part=>!excluded.has(String(part.id)));const count=parts?[...new Map(parts.map(part=>[part.orderId,part.orderQuantity])).values()].reduce((sum,value)=>sum+value,0):null;const unit=parts?(count?parts.reduce((sum,part)=>sum+part.subtotal,0)/count:0):row.unitCost;return convert(Number(unit)*style.quantity,row.currency);}):approved.map(row=>convert(row.subtotal,row.currency));
 const purchase=input.includePurchases===false?0:converted.some(value=>value===null)?null:converted.reduce((sum,value)=>sum+Number(value),0);
 const extra=input.includeOther===false?0:Number(input.otherUnitCost||0)*style.quantity;
 const result=calculateProfitScenario(input,{linkedAmount:purchase===null||!Number.isFinite(extra)?null:purchase+extra});
 const ready=result.ready&&revenue!==null;
 const laborItems=[result.costs.base,result.costs.allowance,result.costs.production,result.costs.support],laborComplete=laborItems.every(value=>value!==null),knownLabor=laborItems.reduce((sum,value)=>sum+(value??0),0);
 const fraction=result.days!==null&&Number(input.workdays)>0?result.days/Number(input.workdays):null;
 const portion=value=>value!==null&&fraction!==null?value*fraction:null;
 const laborBreakdown=companyMonthly?{officeFixed:portion(companyMonthly.officeFixedMonthly),productionFixed:portion(companyMonthly.productionFixedMonthly),variableBase:result.costs.base,variableAllowance:result.costs.allowance,variableProduction:result.costs.production}:null;
 return {...result,ready,automaticLabor,laborBreakdown,laborComplete,labor:knownLabor,laborMissing:result.missing.filter(key=>['baseMonthly','allowanceMonthly','productionPay','supportMonthly','stSeconds','ptSeconds','atSeconds','workers','hoursDay','workdays','factoryWorkers'].includes(key)),total:ready?result.total:null,profit:ready?Number(revenue)-result.total:null,margin:ready&&Number(revenue)>0?(Number(revenue)-result.total)/Number(revenue)*100:null,revenue:revenue===null?null:Number(revenue),purchase,input,approvedCount:approved.length};
}
export function orderProfitTotals(rows,missingStyle=false,commonPurchase=0){
 const all=(field)=>rows.length&&!missingStyle&&rows.every(row=>row[field]!==null&&row[field]!==undefined)?rows.reduce((sum,row)=>sum+row[field],0):null;
 const revenue=all('revenue'),styleProfit=all('profit'),profit=styleProfit!==null&&commonPurchase!==null?styleProfit-commonPurchase:null;
 const add=value=>value!==null&&commonPurchase!==null?value+commonPurchase:null;
 return {revenue,purchase:add(all('purchase')),days:all('days'),total:add(all('total')),profit,margin:profit!==null&&revenue>0?profit/revenue*100:null};
}
export function orderCommonPurchase(styles,currency,rates,options={}){
 const allocated=new Set(styles.flatMap(style=>style.sources.costs.filter(row=>row.exact).map(row=>row.id)));
 const unique=[...new Map(styles.flatMap(style=>style.sources.costs).map(row=>[row.id,row])).values()];
 const excluded=new Set((options.excludedCostIds||[]).map(String));
 const rows=options.includePurchases===false?[]:unique.filter(row=>!excluded.has(String(row.id))&&row.withinOrder&&!allocated.has(row.id)&&row.approved&&row.subtotal!==null);
 const values=rows.map(row=>convertAccountBalances([{balance:String(row.subtotal),currencyCode:row.currency}],currency,rates));
 return {rows,amount:values.some(value=>value===null)?null:values.reduce((sum,value)=>sum+Number(value),0)};
}
