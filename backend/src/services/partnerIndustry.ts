import {createHttpError} from '../utils/http';

export async function validateCustomerIndustry(db: any, value: unknown, retainedId?: number | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw createHttpError(400,'INVALID_CUSTOMER_INDUSTRY');
  const source = await db.settingServiceDefault.findFirst({where:{id:value,partnerRole:{code:'CUSTOMER'},...(value===retainedId?{}:{isActive:true})}});
  if (!source) throw createHttpError(400,'INVALID_CUSTOMER_INDUSTRY');
  return Number(value);
}

// Local IDs remain the tenant-scoped bridge used by production/cost FKs. Names
// and selectable definitions always come from the explicit SYSTEM source FK.
export function partnerIndustryOption(row: any, partnerType?: string) {
  const source=row.systemDefault;
  if (!source?.isActive || source.partnerRole && source.partnerRole.code!==partnerType) return null;
  return {...row,code:source.code,nameKo:source.nameKo,nameEn:source.nameEn,nameVi:source.nameVi,isActive:source.isActive,sortOrder:source.sortOrder};
}
