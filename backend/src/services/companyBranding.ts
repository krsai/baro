import {createHttpError} from '../utils/http';

export function validateCompanyLogo(value:any){
 if(typeof value!=='string'||value.length>400000||value&&!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value))throw createHttpError(400,'FREIGHT_LOGO_INVALID');
 if(value){const bytes=Buffer.from(value.split(',')[1]||'','base64');if(value.startsWith('data:image/png')?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw createHttpError(400,'FREIGHT_LOGO_INVALID');if(value.startsWith('data:image/png')&&(bytes.length<24||!bytes.readUInt32BE(16)||!bytes.readUInt32BE(20)||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>4000000))throw createHttpError(400,'FREIGHT_LOGO_INVALID');}
 if(value&&Buffer.from(value.split(',')[1]||'','base64').length>200000)throw createHttpError(400,'FREIGHT_LOGO_INVALID');
 return value;
}
export async function companyBranding(db:any,orgId:number){
 const row=await db.systemSetting.findUnique({where:{key:`COMPANY_BRANDING:${orgId}`}});
 // Keep explicitly saved company logos; a company code never selects a built-in image.
 const legacy=row?null:await db.systemSetting.findUnique({where:{key:`FREIGHT_BILL_BRANDING:${orgId}`}});
 return {version:row?.value?.version||legacy?.value?.version||0,logoDataUrl:row?row.value?.logoDataUrl||'':legacy?.value?.logoDataUrl||''};
}
// Caller owns the profile/classification transaction and the single page save.
export async function saveCompanyBranding(tx:any,orgId:number,actorId:number,input:any){
 if(!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'}}))throw createHttpError(403,'COMPANY_INDUSTRY_ADMIN_REQUIRED');
 if(!input||Object.keys(input).some(key=>!['version','logoDataUrl'].includes(key))||!Number.isSafeInteger(input.version)||input.version<0)throw createHttpError(400,'FREIGHT_INVALID_INPUT');
 const logoDataUrl=validateCompanyLogo(input.logoDataUrl);
 await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::integer,$2::integer)::text',orgId,202611276);
 const before=await companyBranding(tx,orgId);
 if(before.version>0&&before.logoDataUrl===logoDataUrl&&(before.version===input.version||before.version===input.version+1))return before;
 if(before.version!==input.version)throw createHttpError(409,'FREIGHT_CHANGED');
 const after={version:before.version+1,logoDataUrl};
 await tx.systemSetting.upsert({where:{key:`COMPANY_BRANDING:${orgId}`},create:{key:`COMPANY_BRANDING:${orgId}`,value:after},update:{value:after}});
 await tx.systemSetting.create({data:{key:`COMPANY_BRANDING_AUDIT:${orgId}:${after.version}`,value:{actorId,before,after}}});
 return after;
}
