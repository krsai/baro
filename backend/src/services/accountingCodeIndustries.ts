import type {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';

export const CODE_INDUSTRY_INCLUDE={include:{industry:{include:{partnerRole:true}}}} satisfies Prisma.AccountingCodeIndustryFindManyArgs;
export async function codeIndustrySelection(tx:any,body:any,previous?:any){
 const current=previous?await tx.accountingCodeIndustry.findMany({where:{baseId:previous.id},include:{industry:true}}):[];
 const supplied=body.industryIds!==undefined;
 const ids=supplied?body.industryIds:previous?current.map((row:any)=>row.systemIndustryId):[body.serviceTypeId];
 if(previous&&Array.isArray(ids)&&!ids.length&&body.isActive===false){
  if(supplied&&body.industryRevision!==previous.industryRevision)throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
  return {ids:[] as number[],rows:[],supplied};
 }
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some((id:any)=>!Number.isSafeInteger(id)||id<=0))throw createHttpError(400,'ACCOUNTING_INDUSTRY_REQUIRED');
 if(supplied&&previous&&body.industryRevision!==previous.industryRevision)throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
 await tx.$queryRawUnsafe('SELECT id FROM "SettingServiceDefault" WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE',ids);
 const rows=await tx.settingServiceDefault.findMany({where:{id:{in:ids}},include:{partnerRole:true}});
 const retained=new Set(current.map((row:any)=>row.systemIndustryId));
 if(rows.length!==ids.length||rows.some((row:any)=>row.code==='GENERAL'||!row.partnerRoleId||!row.isActive&&!retained.has(row.id)))throw createHttpError(400,'ACCOUNTING_INDUSTRY_REQUIRED');
 return {ids:ids as number[],rows,supplied};
}
export const codeIndustryDto=(base:any)=>({...base,isAvailable:Boolean(base.isActive&&(!base.expenseType||base.expenseType.isActive&&base.expenseType.code!=='OTHER')),legacyUsageDisabled:Boolean(base.expenseType&&!base.expenseType.isActive),industryIds:(base.industryLinks||[]).map((row:any)=>row.systemIndustryId),industries:(base.industryLinks||[]).map((row:any)=>row.industry)});
