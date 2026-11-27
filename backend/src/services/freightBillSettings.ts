import {createHttpError} from '../utils/http';
import {freightForwarder} from './freightOperations';
import {retryEditTransaction} from '../utils/editRevision';
import {dexlBillLogo} from '../assets/dexlBillLogo';
export function validateBillLogo(value:any){
 if(typeof value!=='string'||value.length>400000||value&&!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value))throw createHttpError(400,'FREIGHT_LOGO_INVALID');
 if(value){const bytes=Buffer.from(value.split(',')[1]||'','base64');if(value.startsWith('data:image/png')?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw createHttpError(400,'FREIGHT_LOGO_INVALID');if(value.startsWith('data:image/png')&&(bytes.length<24||!bytes.readUInt32BE(16)||!bytes.readUInt32BE(20)||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>4000000))throw createHttpError(400,'FREIGHT_LOGO_INVALID');}
 if(value&&Buffer.from(value.split(',')[1]||'','base64').length>200000)throw createHttpError(400,'FREIGHT_LOGO_INVALID');
 return value;
}
export async function billBranding(db:any,orgId:number){const row=await db.systemSetting.findUnique({where:{key:`FREIGHT_BILL_BRANDING:${orgId}`}});const company=row?null:await db.organization.findUnique({where:{id:orgId},select:{code:true}});return {version:row?.value?.version||0,logoDataUrl:row?row.value?.logoDataUrl||'':company?.code==='DEXL'?dexlBillLogo:''};}
export async function saveBillBranding(db:any,orgId:number,actorId:number,input:any){
 const actor=await freightForwarder(db,orgId,actorId);if(actor.orgRole!=='ADMIN')throw createHttpError(403,'FREIGHT_ACCESS_DENIED');
 if(!input||Object.keys(input).some(key=>!['version','logoDataUrl'].includes(key))||!Number.isSafeInteger(input.version)||input.version<0)throw createHttpError(400,'FREIGHT_INVALID_INPUT');const logoDataUrl=validateBillLogo(input.logoDataUrl);
 return retryEditTransaction(db,async(tx:any)=>{const currentActor=await freightForwarder(tx,orgId,actorId);if(currentActor.orgRole!=='ADMIN')throw createHttpError(403,'FREIGHT_ACCESS_DENIED');await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::integer,$2::integer)::text',orgId,202611276);
 const before=await billBranding(tx,orgId);if(before.version>0&&before.logoDataUrl===logoDataUrl&&(before.version===input.version||before.version===input.version+1))return before;
 if(before.version!==input.version)throw createHttpError(409,'FREIGHT_CHANGED');const after={version:before.version+1,logoDataUrl};
 await tx.systemSetting.upsert({where:{key:`FREIGHT_BILL_BRANDING:${orgId}`},create:{key:`FREIGHT_BILL_BRANDING:${orgId}`,value:after},update:{value:after}});
 await tx.systemSetting.create({data:{key:`FREIGHT_BILL_BRANDING_AUDIT:${orgId}:${after.version}`,value:{actorId,before,after}}});return after;});
}
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
