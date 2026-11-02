import type {Prisma} from '@prisma/client';

// Mere provisioning or a local metadata override is not usage. Keep every
// actual source/local FK (including legacy code settings) as a deletion guard.
export const SYSTEM_INDUSTRY_USAGE_INCLUDE={
 _count:{select:{codes:true,codeBases:true,customerIndustries:true,productionPolicies:true,partnerClassifications:true,accountingCodeLinks:true}},
 services:{select:{id:true,ownerOrgId:true,_count:{select:{transactionCosts:true,transactionCodes:true,partners:true}}}},
} satisfies Prisma.SettingServiceDefaultInclude;

export function systemIndustryInUse(row:any):boolean{
 if(!row?._count||!Array.isArray(row.services))return true;
 return Object.values(row._count).some(count=>Number(count)>0)||row.services.some((local:any)=>!local._count||Object.values(local._count).some(count=>Number(count)>0));
}
