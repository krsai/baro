import {createHttpError} from '../utils/http';
const FIELDS=['transportDate','origin','destination','reference'];
export function accountingInputs(value:any){
 const result:any={requiredFields:value?.requiredFields??[]};
 if(!Array.isArray(result.requiredFields)||result.requiredFields.some((field:any)=>!FIELDS.includes(field))||new Set(result.requiredFields).size!==result.requiredFields.length)throw createHttpError(400,'INVALID_REQUIRED_FIELDS');
 result.requiredFields=FIELDS.filter(field=>result.requiredFields.includes(field));
 for(const key of ['orderInput','styleInput','processInput']){
  result[key]=value?.[key]??(key==='orderInput'?'OPTIONAL':'HIDDEN');
  if(!['REQUIRED','OPTIONAL','HIDDEN'].includes(result[key]))throw createHttpError(400,'INVALID_INPUT_OPTION');
 }
 if(result.styleInput!=='HIDDEN'&&result.orderInput==='HIDDEN'||result.processInput!=='HIDDEN'&&(result.orderInput==='HIDDEN'||result.styleInput==='HIDDEN')||result.styleInput==='REQUIRED'&&result.orderInput!=='REQUIRED'||result.processInput==='REQUIRED'&&result.styleInput!=='REQUIRED')throw createHttpError(400,'INVALID_INPUT_OPTION');
 return result;
}
export const accountingInputTarget=(settings:any)=>settings.processInput==='REQUIRED'?'PROCESS':settings.styleInput==='REQUIRED'?'STYLE':settings.orderInput==='REQUIRED'?'ORDER':'NONE';
