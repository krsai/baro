import {createHttpError} from '../utils/http';
// Each B/L owns its own document data. No operations, pricing or arbitrary JSON.
export const billFieldLimits:Record<string,number>={shipper:2000,consignee:2000,notify:2000,deliveryAgent:2000,vessel:200,voyage:100,origin:500,destination:500,placeOfReceipt:500,placeOfDelivery:500,etd:10,eta:10,issueDate:10,issuePlace:500,marks:2000,cargo:4000,quantity:30,unit:40,weightKg:30,cbm:30,freightTerms:200};
export function billData(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(billFieldLimits,key)))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
 const result:Record<string,string>={};
 for(const [key,raw]of Object.entries(value).sort(([a],[b])=>a.localeCompare(b))){
  if(typeof raw!=='string'||raw.length>billFieldLimits[key]!)throw createHttpError(400,'FREIGHT_INVALID_INPUT');
  const text=raw.trim();
  if(['etd','eta','issueDate'].includes(key)&&text&&(!/^\d{4}-\d\d-\d\d$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
  if(['quantity','weightKg','cbm'].includes(key)&&text&&!/^\d{1,16}(?:\.\d{1,4})?$/.test(text))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
  result[key]=text;
 }
 return result;
}
