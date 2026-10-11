import { validateServiceDefinition } from './partnerTransactionCost';
import { validateTransactionCode } from './transactionRequest';
import { loadAppSettings, saveAppSettings } from './applicationSettings';
import { createHttpError } from '../utils/http';

export const serviceFields = ['code','nameKo','nameEn','nameVi','entryMode','requiredFields','orderInput','styleInput','processInput','isActive','sortOrder'];
export const codeFields = ['code','nameKo','nameEn','nameVi','vatEnabled','isActive'];
export const pickSettings = (row: any, keys: string[]) => Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key,row[key]]));

export async function provisionSettingDefaults(tx: any, orgId: number) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
  const services = await tx.settingServiceDefault.findMany();
  // A code collision preserves the existing tenant row, without guessing a source FK.
  await tx.outsourcingServiceType.createMany({ data: services.map((row: any) => ({ ...pickSettings(row,serviceFields), ownerOrgId: orgId, systemDefaultId: row.id, isOverridden: false })), skipDuplicates: true });
  const locals = await tx.outsourcingServiceType.findMany({ where: { ownerOrgId: orgId, systemDefaultId: { not: null } } });
  const bySource = new Map(locals.map((row: any) => [row.systemDefaultId,row.id]));
  const codes = await tx.settingTransactionCodeDefault.findMany();
  await tx.transactionCode.createMany({ data: codes.filter((row: any) => bySource.has(row.serviceTypeId)).map((row: any) => ({ ...pickSettings(row,codeFields), ownerOrgId: orgId, serviceTypeId: bySource.get(row.serviceTypeId), systemDefaultId: row.id, isOverridden: false })), skipDuplicates: true });
}

// Source relationships are explicit IDs. Existing local settings are never matched by name/code.
export async function adoptSetting(tx: any, orgId: number, kind: 'services' | 'codes', body: any) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
  const sourceId = body?.systemDefaultId;
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || body?.localId != null && (!Number.isSafeInteger(body.localId) || body.localId <= 0)) throw createHttpError(400,'INVALID_SETTING_REFERENCE');
  const service = kind === 'services';
  const defaults = service ? tx.settingServiceDefault : tx.settingTransactionCodeDefault;
  const locals = service ? tx.outsourcingServiceType : tx.transactionCode;
  const source = await defaults.findUnique({ where: { id: sourceId } });
  if (!source) throw createHttpError(404,'SETTING_DEFAULT_NOT_FOUND');
  const local = body.localId ? await locals.findFirst({ where: { id: body.localId, ownerOrgId: orgId } }) : null;
  if (body.localId && !local) throw createHttpError(404,'SETTING_NOT_FOUND');
  if (local?.systemDefaultId && local.systemDefaultId !== source.id) throw createHttpError(409,'SETTING_SOURCE_IMMUTABLE');
  const data: any = { ...pickSettings(source,service ? serviceFields : codeFields), systemDefaultId: source.id, isOverridden: false };
  if (service) {
    if (local && local.entryMode !== source.entryMode) throw createHttpError(409,'SERVICE_ENTRY_MODE_IMMUTABLE');
  } else {
    const industry = await tx.outsourcingServiceType.findFirst({ where: { ownerOrgId: orgId, systemDefaultId: source.serviceTypeId } });
    if (!industry) throw createHttpError(409,'ADOPT_SERVICE_DEFAULT_FIRST');
    if (local && local.serviceTypeId !== industry.id) throw createHttpError(409,'CODE_SERVICE_IMMUTABLE');
    data.serviceTypeId = industry.id;
  }
  return local ? locals.update({ where: { id: local.id }, data }) : locals.create({ data: { ...data, ownerOrgId: orgId } });
}

export function registerTransactionSettingRoutes(app: any, db: any, gates: any) {
  const admin = (req: any, res: any) => gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN'] });
  const member = (req: any, res: any) => gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN','OPERATOR','ACCOUNTANT'] });
  for (const global of [false,true]) {
    const prefix = global ? '/system-app-settings' : '/app-settings';
    app.get(prefix, async (req: any,res: any) => {
      const access = global ? await gates.requireSystemAdmin(req,res) : await member(req,res);
      if (!access) return;
      res.json(await loadAppSettings(db,global ? undefined : access.organization.id));
    });
    app.put(prefix, async (req: any,res: any) => {
      const access = global ? await gates.requireSystemAdmin(req,res) : await admin(req,res);
      if (!access) return;
      res.json(await db.$transaction((tx: any) => saveAppSettings(tx,global ? undefined : access.organization.id,req.body,gates.actorId()), { isolationLevel: 'Serializable' }));
    });
  }
  for (const kind of ['services','codes'] as const) {
    const service = kind === 'services';
    const localPath = service ? '/outsourcing-service-types' : '/transaction-codes';
    const defaultPath = `/system-setting-defaults/${kind}`;
    const defaults = service ? db.settingServiceDefault : db.settingTransactionCodeDefault;
    const locals = service ? db.outsourcingServiceType : db.transactionCode;
    const include = service ? {} : { include: { serviceType: true } };
    app.get(defaultPath, async (req: any,res: any) => {
      // Organization administrators can read the catalogue to explicitly adopt defaults.
      if (req.query.catalogue === '1') { if (!await admin(req,res)) return; }
      else if (!await gates.requireSystemAdmin(req,res)) return;
      res.json(await defaults.findMany({ ...include, orderBy: { id: 'asc' } }));
    });
    app.get(localPath, async (req: any,res: any) => {
      const access = req.query.all === '1' ? await admin(req,res) : await member(req,res);
      if (!access) return;
      await db.$transaction((tx: any) => provisionSettingDefaults(tx,access.organization.id), { isolationLevel: 'ReadCommitted' });
      res.json(await locals.findMany({ where: { ownerOrgId: access.organization.id, ...(req.query.all === '1' ? {} : { isActive: true, ...(!service ? { serviceType: { isActive: true } } : {}) }) }, ...include, orderBy: service ? [{ sortOrder: 'asc' }, { id: 'asc' }] : { code: 'asc' } }));
    });
    for (const global of [true,false]) {
      const base = global ? defaultPath : localPath;
      const model = global ? defaults : locals;
      const validate = service ? validateServiceDefinition : validateTransactionCode;
      for (const update of [false,true]) {
        app[update ? 'put' : 'post'](`${base}${update ? '/:id' : ''}`, async (req: any,res: any) => {
          const access = global ? await gates.requireSystemAdmin(req,res) : await admin(req,res);
          if (!access) return;
          const orgId = global ? undefined : access.organization.id;
          const id = Number(req.params.id);
          const existing = update && Number.isSafeInteger(id) ? await model.findFirst({ where: { id, ...(!global ? { ownerOrgId: orgId } : {}) } }) : null;
          if (update && !existing) return res.status(404).json({ error: 'SETTING_NOT_FOUND' });
          const data: any = { ...validate(req.body), isActive: req.body.isActive !== false };
          if (service && existing && existing.entryMode !== data.entryMode) throw createHttpError(409,'SERVICE_ENTRY_MODE_IMMUTABLE');
          if (global && existing && existing.code !== data.code) throw createHttpError(409,'DEFAULT_CODE_IMMUTABLE');
          if (!service) {
            if (existing && existing.serviceTypeId !== data.serviceTypeId) throw createHttpError(409,'CODE_SERVICE_IMMUTABLE');
            const target = global ? db.settingServiceDefault : db.outsourcingServiceType;
            if (!await target.findFirst({ where: { id: data.serviceTypeId, ...(!global ? { ownerOrgId: orgId } : {}) } })) throw createHttpError(400,'INVALID_SERVICE_TYPE');
          }
          if (!global) data.isOverridden = true;
          res.status(update ? 200 : 201).json(update ? await model.update({ where: { id }, data }) : await model.create({ data: { ...data, ...(!global ? { ownerOrgId: orgId } : {}) } }));
        });
      }
    }
    app.post(`${localPath}/adopt-default`, async (req: any,res: any) => {
      const access = await admin(req,res); if (!access) return;
      res.json(await db.$transaction((tx: any) => adoptSetting(tx,access.organization.id,kind,req.body), { isolationLevel: 'Serializable' }));
    });
    app.post(`${localPath}/:id/reset-default`, async (req: any,res: any) => {
      const access = await admin(req,res); if (!access) return;
      res.json(await db.$transaction(async (tx: any) => {
        const target = service ? tx.outsourcingServiceType : tx.transactionCode;
        const row = await target.findFirst({ where: { id: Number(req.params.id), ownerOrgId: access.organization.id } });
        if (!row?.systemDefaultId) throw createHttpError(409,'NO_SETTING_DEFAULT');
        return adoptSetting(tx,access.organization.id,kind,{ localId: row.id,systemDefaultId: row.systemDefaultId });
      }, { isolationLevel: 'Serializable' }));
    });
  }
}
