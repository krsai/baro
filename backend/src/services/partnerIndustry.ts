import {createHttpError} from '../utils/http';

export async function saveSystemIndustry(db: any, data: any, id?: number) {
  await db.$queryRawUnsafe('LOCK TABLE "SettingServiceDefault", "OutsourcingServiceType" IN SHARE ROW EXCLUSIVE MODE');
  const previous = id ? await db.settingServiceDefault.findFirst({where:{id}}) : null;
  if (id && !previous) throw createHttpError(404,'SETTING_NOT_FOUND');
  if (previous && previous.entryMode !== data.entryMode) throw createHttpError(409,'SERVICE_ENTRY_MODE_IMMUTABLE');
  const renaming = previous && previous.code !== data.code;
  if (renaming) {
    const conflicts = await db.$queryRawUnsafe(`SELECT 1 FROM "SettingServiceDefault" WHERE upper(code)=$2 AND id<>$1
      UNION ALL SELECT 1 FROM "OutsourcingServiceType" target JOIN "OutsourcingServiceType" source ON target."ownerOrgId"=source."ownerOrgId"
      WHERE source."systemDefaultId"=$1 AND upper(target.code)=$2 AND target.id<>source.id LIMIT 1`,id,data.code);
    if (conflicts.length) throw createHttpError(409,'INDUSTRY_CODE_CONFLICT');
  }
  const saved = id ? await db.settingServiceDefault.update({where:{id},data}) : await db.settingServiceDefault.create({data});
  if (renaming) {
    // Source-linked IDs, tenant overrides and every business FK stay unchanged.
    await db.$executeRawUnsafe('UPDATE "OutsourcingServiceType" SET code=$2 WHERE "systemDefaultId"=$1',id,data.code);
  }
  return saved;
}

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
  if (!source?.isActive || source.code==='GENERAL' || source.partnerRole && source.partnerRole.code!==partnerType) return null;
  return {...row,code:source.code,nameKo:source.nameKo,nameEn:source.nameEn,nameVi:source.nameVi,isActive:source.isActive,sortOrder:source.sortOrder};
}
