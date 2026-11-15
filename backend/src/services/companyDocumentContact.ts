import {createHttpError} from '../utils/http';

// Organization fields are the document master. Employee data is never a fallback.
export const companyDocumentContact=(row:any)=>({representative:row?.representative??null,phone:row?.phone??null,email:row?.email??null,address:row?.address??null});
export const companyInvoiceParty=(row:any)=>({code:row?.code||'',name:row?.name||'',address:row?.address||'',country:row?.country||'',taxId:row?.businessNumber||'',contactName:row?.representative||'',email:row?.email||'',phone:row?.phone||''});

export function companyDocumentContactUpdate(input:any,current:any){
 const result:any={};
 for(const [key,max]of Object.entries({representative:200,phone:100,email:320,address:1000})){
  if(input[key]===undefined)continue;
  const value=input[key];
  if(value!==null&&(typeof value!=='string'||value.length>max))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_INVALID');
  const text=typeof value==='string'?value.trim():null;
  // Existing text is preserved until the user explicitly changes that field.
  if(['representative','address'].includes(key)&&text&&text!==(current[key]??'')&&[...text].some(char=>/\p{L}/u.test(char)&&!/\p{Script=Latin}/u.test(char)))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_ENGLISH_REQUIRED');
  if(key==='address'&&text&&text!==(current[key]??'')&&/[\r\n]/.test(text))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_INVALID');
  result[key]=text||null;
 }
 return result;
}
