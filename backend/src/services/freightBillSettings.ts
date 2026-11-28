import {createHttpError} from '../utils/http';
import {companyBranding,validateCompanyLogo} from './companyBranding';
export const validateBillLogo=validateCompanyLogo;
export const billBranding=companyBranding;
export async function saveBillBranding(_db:any,_orgId:number,_actorId:number,_input:any):Promise<any>{throw createHttpError(410,'COMPANY_LOGO_MANAGED_IN_PROFILE');}
export async function houseBillNumber(tx:any,orgId:number,manual:string,excludeId?:string,now=new Date()){
 await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::integer,$2::integer)::text',orgId,202611275);
 const exists=async(number:string)=>(await tx.$queryRawUnsafe('SELECT id FROM "FreightBill" WHERE "orgId"=$1 AND kind=\'HOUSE\' AND upper(number)=upper($2) AND ($3::text IS NULL OR id<>$3) LIMIT 1',orgId,number,excludeId||null)).length>0;
 if(manual){if(await exists(manual))throw createHttpError(409,'FREIGHT_HBL_NUMBER_EXISTS');return manual;}
 const company=await tx.organization.findUnique({where:{id:orgId},select:{code:true}}),prefix=company?.code;
 if(!prefix||!/^[A-Z0-9]{2,20}$/.test(prefix))throw createHttpError(409,'FREIGHT_HBL_PREFIX_REQUIRED');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'2-digit',month:'2-digit'}).formatToParts(now),period=date.find(v=>v.type==='year')!.value+date.find(v=>v.type==='month')!.value;
 const key=`FREIGHT_HBL_NUMBER:${orgId}:${period}`,counter=await tx.systemSetting.findUnique({where:{key}});let last=counter?.value?.lastNumber||0;
 if(!Number.isSafeInteger(last)||last<0)throw createHttpError(409,'FREIGHT_HBL_COUNTER_INVALID');let number='';
 const used=await tx.$queryRawUnsafe('SELECT number FROM "FreightBill" WHERE "orgId"=$1 AND kind=\'HOUSE\' AND number LIKE $2',orgId,prefix+period+'%');
 for(const row of used){const match=new RegExp('^'+prefix+period+'(\\d{3})$').exec(row.number);if(match)last=Math.max(last,Number(match[1]));}
 do{last++;if(last>999)throw createHttpError(409,'FREIGHT_HBL_NUMBER_EXHAUSTED');number=prefix+period+String(last).padStart(3,'0');}while(await exists(number));
 await tx.systemSetting.upsert({where:{key},create:{key,value:{lastNumber:last}},update:{value:{lastNumber:last}}});return number;
}
