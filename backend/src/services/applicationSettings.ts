import { Prisma } from '@prisma/client';
import { createHttpError } from '../utils/http';

export const SYSTEM_APP_SETTINGS_KEY = 'APP_SETTINGS:DEFAULT';
export const appSettingsKey = (orgId: number) => `APP_SETTINGS:${orgId}`;
export async function loadAppSettings(db: any, orgId?: number) {
  const defaults = await db.systemSetting.findUnique({ where: { key: SYSTEM_APP_SETTINGS_KEY } });
  const systemDefault = defaults?.value?.defaultVatRate ?? '10';
  const row = orgId ? await db.systemSetting.findUnique({ where: { key: appSettingsKey(orgId) } }) : null;
  const overridden = row?.value?.defaultVatRate != null;
  return { defaultVatRate: overridden ? row.value.defaultVatRate : systemDefault, systemDefaultVatRate: systemDefault, isOverridden: overridden };
}
export async function saveAppSettings(db: any, orgId: number | undefined, body: any, actorId: number | null) {
  const key = orgId ? appSettingsKey(orgId) : SYSTEM_APP_SETTINGS_KEY;
  const previous = await db.systemSetting.findUnique({ where: { key } });
  const value = { ...(previous?.value || {}) };
  if (orgId && body?.reset === true) delete value.defaultVatRate;
  else {
    if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(String(body?.defaultVatRate)) || new Prisma.Decimal(body.defaultVatRate).gt(100)) throw createHttpError(400, 'INVALID_VAT_RATE');
    value.defaultVatRate = new Prisma.Decimal(body.defaultVatRate).toString();
  }
  await db.systemSetting.upsert({ where: { key }, create: { key, value, updatedByEmployeeId: actorId }, update: { value, updatedByEmployeeId: actorId } });
  return loadAppSettings(db, orgId);
}
