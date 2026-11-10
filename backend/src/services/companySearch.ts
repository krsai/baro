import {Prisma} from '@prisma/client';

// Match public identity aliases only through this company's actual local FK links.
// Callers still apply their document/customer scope before pagination.
export function companyNameCodeSearch(orgId:number,search:string):Prisma.OrganizationWhereInput{
 const fields=['name','nameKo','nameVi','code'].map(key=>({[key]:{contains:search,mode:'insensitive' as const}}));
 return {OR:[...fields,
  {localCompanyLinks:{some:{orgId,target:{OR:fields}}}},
  {identityLinks:{some:{orgId,identity:{OR:[...fields,{anchor:{OR:fields}}]}}}},
 ]};
}
