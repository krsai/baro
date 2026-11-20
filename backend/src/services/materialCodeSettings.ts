import {createHttpError} from '../utils/http';
export const MATERIAL_STOCK_FIELDS=['customer','type','color','unit','dimensions'];
export function materialCodeSettings(value:any,inputs?:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['enabled','stockFields','colorInput','unitInput','masterInputs'].includes(key))||typeof value.enabled!=='boolean')throw createHttpError(400,'INVALID_INPUT_OPTION');
 const masterInputs=value.masterInputs;
 if(masterInputs!==undefined&&(!masterInputs||typeof masterInputs!=='object'||Array.isArray(masterInputs)||Object.keys(masterInputs).some(key=>!['owner','customer','type','color','dimensions'].includes(key))||Object.values(masterInputs).some(mode=>!['REQUIRED','HIDDEN'].includes(mode as string))))throw createHttpError(400,'INVALID_INPUT_OPTION');
 const stockFields=value.stockFields??[],colorInput=value.colorInput??'HIDDEN',unitInput=value.unitInput??'REQUIRED';
 if(!Array.isArray(stockFields)||stockFields.some((key:any)=>!MATERIAL_STOCK_FIELDS.includes(key))||new Set(stockFields).size!==stockFields.length||!['HIDDEN','OPTIONAL','REQUIRED'].includes(colorInput)||unitInput!=='REQUIRED')throw createHttpError(400,'INVALID_INPUT_OPTION');
 if(value.enabled){
  if(!stockFields.includes('unit'))throw createHttpError(400,'INVALID_INPUT_OPTION');
  if(masterInputs===undefined&&inputs&&stockFields.some((key:string)=>key==='unit'?false:key==='color'?colorInput==='HIDDEN':key==='dimensions'?!inputs.requiredFields?.includes('length'):(inputs.attributeInputs?.[key]??'HIDDEN')==='HIDDEN'))throw createHttpError(400,'INVALID_INPUT_OPTION');
 }
 return {enabled:value.enabled,colorInput,unitInput,stockFields:MATERIAL_STOCK_FIELDS.filter(key=>stockFields.includes(key)),...(masterInputs===undefined?{}:{masterInputs})};
}

// An absent masterInputs retains the meaning of already saved catalogue settings.
export function materialMasterCode(code:any){
 const base=code.base??code,m=base.materialSettings??{},inputs=m.masterInputs;
 if(inputs===undefined)return {...code,base:{...base,attributeInputs:{...base.attributeInputs,owner:'HIDDEN',customer:'HIDDEN',type:'HIDDEN'}}};
 return {...code,base:{...base,attributeInputs:{owner:'HIDDEN',customer:'HIDDEN',type:'HIDDEN'},requiredFields:inputs.dimensions==='REQUIRED'?['length','width']:[],materialSettings:{...m,colorInput:inputs.color??'HIDDEN'}}};
}
