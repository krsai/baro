import {createHttpError} from '../utils/http';
import {materialCodeSettings} from './materialCodeSettings';
const FIELDS=['transportDate','origin','destination','reference','length','width'];
export function accountingInputs(value:any){
 const result:any={requiredFields:value?.requiredFields??[]};
 const attributes=value?.attributeInputs===undefined?{}:value.attributeInputs;
 if(!attributes||typeof attributes!=='object'||Array.isArray(attributes)||Object.keys(attributes).some(key=>!['customer','type','owner'].includes(key))||Object.values(attributes).some(mode=>!['REQUIRED','OPTIONAL','HIDDEN'].includes(mode as string)))throw createHttpError(400,'INVALID_INPUT_OPTION');
 // Omit empty defaults so existing company snapshots keep their exact meaning.
 if(Object.keys(attributes).length)result.attributeInputs=attributes;
 if(!Array.isArray(result.requiredFields)||result.requiredFields.some((field:any)=>!FIELDS.includes(field))||new Set(result.requiredFields).size!==result.requiredFields.length)throw createHttpError(400,'INVALID_REQUIRED_FIELDS');
 if(result.requiredFields.includes('length')!==result.requiredFields.includes('width'))throw createHttpError(400,'INVALID_REQUIRED_FIELDS');
 result.requiredFields=FIELDS.filter(field=>field==='reference'||result.requiredFields.includes(field));
 for(const key of ['orderInput','styleInput','processInput']){
  result[key]=value?.[key]??'HIDDEN';
  if(!['REQUIRED','OPTIONAL','HIDDEN'].includes(result[key]))throw createHttpError(400,'INVALID_INPUT_OPTION');
 }
 if(value?.materialSettings!==undefined)result.materialSettings=materialCodeSettings(value.materialSettings,result);
 return result;
}
export const accountingInputTarget=(settings:any)=>settings.processInput==='REQUIRED'?'PROCESS':settings.styleInput==='REQUIRED'?'STYLE':settings.orderInput==='REQUIRED'?'ORDER':'NONE';
