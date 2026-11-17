import type {Prisma} from '@prisma/client';
const baseSelect={id:true,code:true,industryLinks:{select:{systemIndustryId:true}}};
const codeSelect={id:true,base:{select:baseSelect}};
// Current taxonomy comes from N:M code links. Compatibility anchors are history.
export const SYSTEM_INDUSTRY_USAGE_INCLUDE={
 retirement:true,
 _count:{select:{codes:true,codeBases:true,customerIndustries:true,productionPolicies:true,partnerClassifications:true,accountingCodeLinks:true}},
 codes:{select:codeSelect},codeBases:{select:baseSelect},accountingCodeLinks:{select:{base:{select:{id:true,code:true}}}},
 services:{select:{id:true,ownerOrgId:true,_count:{select:{transactionCosts:true,transactionCodes:true,partners:true}},transactionCodes:{select:codeSelect},transactionCosts:{select:{transactionCode:{select:codeSelect}}}}},
} satisfies Prisma.SettingServiceDefaultInclude;
const liveBase=(base:any,id:number)=>!Number.isSafeInteger(id)||!base||!Array.isArray(base.industryLinks)||!base.industryLinks.length||base.industryLinks.some((link:any)=>link.systemIndustryId===id);
export function systemIndustryUsageView(row:any){
 const counts={...row?._count};
 if(Array.isArray(row?.codeBases))counts.codeBases=row.codeBases.filter((base:any)=>liveBase(base,row.id)).length;
 if(Array.isArray(row?.codes))counts.codes=row.codes.filter((code:any)=>liveBase(code.base,row.id)).length;
 const services=(row?.services||[]).map((local:any)=>{
  const count={...local._count};
  if(Array.isArray(local.transactionCodes))count.transactionCodes=local.transactionCodes.filter((code:any)=>liveBase(code.base,row.id)).length;
  if(Array.isArray(local.transactionCosts))count.transactionCosts=local.transactionCosts.filter((cost:any)=>liveBase(cost.transactionCode?.base,row.id)).length;
  return {id:local.id,ownerOrgId:local.ownerOrgId,_count:count};
 });
 // Never return company transaction IDs or records with the catalogue.
 const {retirement,...visible}=row||{};
 return {...visible,_count:counts,services};
}
export function systemIndustryInUse(row:any):boolean{
 if(!row?._count||!Array.isArray(row.services))return true;
 if(row.services.some((local:any)=>!local._count))return true;
 const view=systemIndustryUsageView(row);
 return Object.values(view._count).some(count=>Number(count)>0)||view.services.some((local:any)=>Object.values(local._count).some(count=>Number(count)>0));
}
export function industryHasHistoricalReferences(row:any):boolean{
 return Object.values(row._count||{}).some(count=>Number(count)>0)||(row.services||[]).some((local:any)=>Object.values(local._count||{}).some(count=>Number(count)>0));
}
