import {createHttpError} from '../utils/http';
import {titleCaseWords} from '../utils/humanTextCase';
export const normalizeStoredAddress=(value:string)=>titleCaseWords(value.trim());

// Organization fields are the document master. Employee data is never a fallback.
export const companyDocumentContact=(row:any)=>({representative:row?.representative??null,phone:row?.phone??null,email:row?.email??null,address:row?.address??null});
export const companyInvoiceParty=(row:any)=>({code:row?.code||'',name:row?.name||'',address:row?.address||'',country:row?.country||'',taxId:row?.businessNumber||'',contactName:row?.representative||'',email:row?.email||'',phone:row?.phone||''});

export function companyDocumentContactUpdate(input:any,current:any){
 const result:any={};
 for(const [key,max]of Object.entries({representative:200,phone:100,email:320,address:1000})){
  if(input[key]===undefined)continue;
  const value=input[key];
  if(value!==null&&(typeof value!=='string'||value.length>max&&value!==current[key]))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_INVALID');
  const text=typeof value==='string'?value.trim():null;
  // Existing text is preserved until the user explicitly changes that field.
  if(['representative','address'].includes(key)&&text&&text!==(current[key]??'')&&[...text].some(char=>/\p{L}/u.test(char)&&!/\p{Script=Latin}/u.test(char)))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_ENGLISH_REQUIRED');
  if(key==='address'&&text&&text!==(current[key]??'')&&/[\r\n]/.test(text))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_INVALID');
  result[key]=['address','representative'].includes(key)&&text&&text!==(current[key]??'')?titleCaseWords(text):text||null;
 }
 return result;
}
export function entityDocumentContactUpdate(input:any,previous:any={}){
 const first=(keys:string[])=>{const key=keys.find(key=>input?.[key]!==undefined);return key?input[key]:undefined;};
 const name=first(['representative','contactName','manager']);
 const result=companyDocumentContactUpdate({...(input?.representative!==undefined?{representative:name}:{}),phone:first(['phone','contactPhone','phoneNumber']),email:input?.email,address:input?.address},previous||{});
 if(input?.representative===undefined&&name!==undefined){if(name!==null&&(typeof name!=='string'||name.length>200&&name!==previous?.representative))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_INVALID');result.representative=typeof name==='string'?name.trim()||null:null;}
 return result;
}
// A confirmed common identity owns its address; only a real subscriber also
// owns the contact fields. Local contacts of non-subscribers remain private.
export function entityDocumentContactBaseline(previous:any,official:any){
 return {...previous,...(official?{address:official.address}:{}),...(official?.subscriberOrgId?companyDocumentContact(official):{})};
}
