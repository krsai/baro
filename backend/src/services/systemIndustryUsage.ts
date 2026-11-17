import type {Prisma} from '@prisma/client';
const baseSelect={id:true,code:true,industryLinks:{select:{systemIndustryId:true}}};
const codeSelect={id:true,base:{select:baseSelect}};
// Current taxonomy comes from N:M code links. Compatibility anchors are history.
export const SYSTEM_INDUSTRY_USAGE_INCLUDE={
 retirement:true,
 _count:{select:{handledSelections:true,codes:true,codeBases:true,customerIndustries:true,productionPolicies:true,partnerClassifications:true,accountingCodeLinks:true}},
 codes:{select:codeSelect},codeBases:{select:baseSelect},accountingCodeLinks:{select:{base:{select:{id:true,code:true}}}},
 services:{select:{id:true,ownerOrgId:true,_count:{select:{transactionCosts:true,transactionCodes:true,partners:true}},transactionCodes:{select:codeSelect},transactionCosts:{select:{transactionCode:{select:codeSelect}}}}},
} satisfies Prisma.SettingServiceDefaultInclude;
const liveBase=(base:any,id:number)=>!Number.isSafeInteger(id)||!base||!Array.isArray(base.industryLinks)||!base.industryLinks.length||base.industryLinks.some((link:any)=>link.systemIndustryId===id);
export function systemIndustryUsageView(row:any){
 const counts={...row?._count};
 // Retained local item choices are historical metadata, not current taxonomy links.
 if('handledSelections' in counts)counts.handledSelections=0;
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
 const references=new Set<string>();
 const addBase=(base:any,fallback:string)=>{
  if(!liveBase(base,row.id))return;
  // An explicit current N:M link is already counted once below, irrespective
  // of tax variants, company copies or the number of historical documents.
  if(base?.industryLinks?.length)return;
  references.add(base?.id?`base:${base.id}`:fallback);
 };
 for(const base of row?.codeBases||[])addBase(base,`base:${base.id}`);
 for(const code of row?.codes||[])addBase(code.base,`source-code:${code.id}`);
 for(const local of row?.services||[]){
  for(const code of local.transactionCodes||[])addBase(code.base,`company-code:${local.id}:${code.id}`);
  for(const [index,cost] of (local.transactionCosts||[]).entries())addBase(cost.transactionCode?.base,cost.transactionCode?`company-code:${local.id}:${cost.transactionCode.id}`:`cost:${local.id}:${index}`);
 }
 const detailed=Array.isArray(row?.codes)&&Array.isArray(row?.codeBases)&&(row?.services||[]).every((local:any)=>Array.isArray(local.transactionCodes)&&Array.isArray(local.transactionCosts));
 const usageCount=detailed
  ? ['customerIndustries','productionPolicies','partnerClassifications','accountingCodeLinks'].reduce((sum,key)=>sum+Number(counts[key]||0),0)+services.reduce((sum:number,local:any)=>sum+Number(local._count.partners||0),0)+references.size
  : Object.values(counts).reduce((sum:number,count)=>sum+Number(count||0),0)+services.reduce((sum:number,local:any)=>sum+Object.values(local._count).reduce((total:number,count)=>total+Number(count||0),0),0);
 return {...visible,...(Array.isArray(row?.codeBases)?{codeBases:row.codeBases.filter((base:any)=>liveBase(base,row.id))}:{}),_count:counts,services,usageCount};
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
