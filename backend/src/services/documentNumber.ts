import {createHttpError} from '../utils/http';

export type DocumentKind='INV'|'EXP';
export const legacyExpenseNumber=(id:number)=>`EXP-${String(id).padStart(6,'0')}`;
export function normalizeDocumentNumber(value:unknown){
 if(value==null||value==='')return '';
 if(typeof value!=='string')throw createHttpError(400,'INVALID_DOCUMENT_NUMBER');
 const number=value.trim();
 if(number.length>200||/[\u0000-\u001f\u007f]/.test(number))throw createHttpError(400,'INVALID_DOCUMENT_NUMBER');
 return number;
}
export async function allocateDocumentNumber(tx:any,orgId:number,kind:DocumentKind,date:string,input:unknown){
 const manual=normalizeDocumentNumber(input),year=String(date).slice(0,4);
 if(!/^\d{4}$/.test(year)||Number(year)<1000)throw createHttpError(400,'INVALID_DOCUMENT_NUMBER_DATE');
 // Manual and automatic numbers share the same company/type lock and namespace.
 await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::integer,$2::integer)',orgId,kind==='INV'?202610281:202610282);
 const exists=async(number:string)=>{
  if(kind==='INV')return !!await tx.invoice.findFirst({where:{sellerOrgId:orgId,invoiceNumber:{equals:number,mode:'insensitive'}},select:{id:true}});
  if(await tx.expenseRequest.findFirst({where:{orgId,managementNumber:{equals:number,mode:'insensitive'}},select:{id:true}}))return true;
  const legacy=/^EXP-(\d{1,10})$/i.exec(number);
  return !!(legacy&&await tx.expenseRequest.findFirst({where:{id:Number(legacy[1]),orgId,managementNumber:null},select:{id:true}}));
 };
 if(manual&&await exists(manual))throw createHttpError(409,'DOCUMENT_NUMBER_ALREADY_EXISTS');
 const key=`DOCUMENT_NUMBER:${orgId}:${kind}:${year}`;
 const counter=await tx.systemSetting.findUnique({where:{key}});
 let sequence=counter?.value?.lastNumber??0;
 if(!Number.isSafeInteger(sequence)||sequence<0)throw createHttpError(409,'DOCUMENT_NUMBER_COUNTER_INVALID');
 let number=manual;
 if(manual){
  const match=new RegExp(`^${kind}-${year}-(\\d+)$`,'i').exec(manual);
  if(match){const used=Number(match[1]);if(!Number.isSafeInteger(used))throw createHttpError(400,'INVALID_DOCUMENT_NUMBER');sequence=Math.max(sequence,used);}
 }else{
  do{sequence++;if(!Number.isSafeInteger(sequence))throw createHttpError(409,'DOCUMENT_NUMBER_COUNTER_INVALID');number=`${kind}-${year}-${String(sequence).padStart(6,'0')}`;}while(await exists(number));
 }
 if(sequence!==(counter?.value?.lastNumber??0))await tx.systemSetting.upsert({where:{key},create:{key,value:{lastNumber:sequence}},update:{value:{lastNumber:sequence}}});
 return number;
}
