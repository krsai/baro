import {validateVolumeFormula} from '../utils/validateVolumeFormula';
import {createHttpError} from '../utils/http';
import {validateBillLogo} from './freightBillSettings';
// Each B/L owns its own document data. No operations, pricing or arbitrary JSON.
export const billFieldLimits:Record<string,number>={shipper:2000,consignee:2000,notify:2000,deliveryAgent:2000,vessel:200,voyage:100,origin:500,destination:500,placeOfReceipt:500,placeOfDelivery:500,etd:10,eta:10,issueDate:10,issuePlace:500,marks:2000,cargo:4000,quantity:30,unit:40,weightKg:30,cbm:30,cbmFormula:200,freightTerms:200,preCarriage:200,finalDestination:500,totalPackagesWords:500,revenueTons:100,rate:100,ratePer:100,prepaid:200,collect:200,freightPayableAt:500,originalCount:2,onBoardDate:10,releaseType:30,surrenderStatus:30,surrenderRequestedAt:10,surrenderConfirmedAt:10,surrenderReference:500,surrenderReason:1000,surrenderRecordedBy:30,surrenderRecordedAt:40,logoDataUrl:400000};
export function billData(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(billFieldLimits,key)))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
 const result:Record<string,string>={};
 for(const [key,raw]of Object.entries(value).sort(([a],[b])=>a.localeCompare(b))){
  if(typeof raw!=='string'||raw.length>billFieldLimits[key]!)throw createHttpError(400,'FREIGHT_INVALID_INPUT');
  const text=raw.trim();
  if(key==='logoDataUrl')validateBillLogo(text);
  if(key==='releaseType'&&text&&!['ORIGINAL','SEA_WAYBILL'].includes(text)||key==='surrenderStatus'&&text&&!['NONE','REQUESTED','CONFIRMED'].includes(text)||key==='originalCount'&&text&&!/^(0|[1-9]\d?)$/.test(text))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
  if(['etd','eta','issueDate','onBoardDate','surrenderRequestedAt','surrenderConfirmedAt'].includes(key)&&text&&(!/^\d{4}-\d\d-\d\d$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
  if(['quantity','weightKg','cbm'].includes(key)&&text&&!new RegExp('^\\d{1,16}(?:\\.\\d{1,'+(key==='cbm'?6:4)+'})?$').test(text))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
  result[key]=text;
 }
 if(Object.hasOwn(value,'cbmFormula'))result.cbmFormula=validateVolumeFormula(result.cbm,result.cbmFormula);
 return result;
}
