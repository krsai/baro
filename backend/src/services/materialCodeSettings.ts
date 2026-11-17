import {createHttpError} from '../utils/http';
export const MATERIAL_STOCK_FIELDS=['customer','type','color','unit','dimensions'];
export function materialCodeSettings(value:any,inputs?:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['enabled','stockFields','colorInput','unitInput'].includes(key))||typeof value.enabled!=='boolean')throw createHttpError(400,'INVALID_INPUT_OPTION');
 const stockFields=value.stockFields??[],colorInput=value.colorInput??'HIDDEN',unitInput=value.unitInput??'REQUIRED';
 if(!Array.isArray(stockFields)||stockFields.some((key:any)=>!MATERIAL_STOCK_FIELDS.includes(key))||new Set(stockFields).size!==stockFields.length||!['HIDDEN','OPTIONAL','REQUIRED'].includes(colorInput)||unitInput!=='REQUIRED')throw createHttpError(400,'INVALID_INPUT_OPTION');
 if(value.enabled){
  if(!stockFields.includes('unit'))throw createHttpError(400,'INVALID_INPUT_OPTION');
  if(inputs&&stockFields.some((key:string)=>key==='unit'?false:key==='color'?colorInput==='HIDDEN':key==='dimensions'?!inputs.requiredFields?.includes('length'):(inputs.attributeInputs?.[key]??'HIDDEN')==='HIDDEN'))throw createHttpError(400,'INVALID_INPUT_OPTION');
 }
 return {enabled:value.enabled,colorInput,unitInput,stockFields:MATERIAL_STOCK_FIELDS.filter(key=>stockFields.includes(key))};
}
