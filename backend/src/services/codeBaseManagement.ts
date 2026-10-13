import { createHttpError } from '../utils/http';

export function validateCodeBase(body: any) {
  if (!/^[A-Z]{3}$/.test(body?.code || '') || ['nameKo','nameEn','nameVi'].some(key => typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 100)) throw createHttpError(400,'INVALID_CODE_BASE');
  if (!Number.isSafeInteger(body.serviceTypeId) || body.serviceTypeId <= 0) throw createHttpError(400,'INVALID_SERVICE_TYPE');
  if (!Array.isArray(body.taxTreatmentIds) || !body.taxTreatmentIds.length || body.taxTreatmentIds.some((id: any) => ![1,2,3].includes(id)) || new Set(body.taxTreatmentIds).size !== body.taxTreatmentIds.length) throw createHttpError(400,'INVALID_TAX_TREATMENT');
  return { code: body.code, nameKo: body.nameKo.trim(), nameEn: body.nameEn.trim(), nameVi: body.nameVi.trim(), serviceTypeId: body.serviceTypeId, isActive: body.isActive !== false };
}

export async function saveCodeBase(tx: any, body: any, id?: number) {
  const data = validateCodeBase(body);
  await tx.$queryRawUnsafe('SELECT id FROM "SettingServiceDefault" WHERE id=$1 FOR UPDATE', data.serviceTypeId);
  if (!await tx.settingServiceDefault.findUnique({ where: { id: data.serviceTypeId } })) throw createHttpError(400,'INVALID_SERVICE_TYPE');
  if (id) {
    await tx.$queryRawUnsafe('SELECT id FROM "TransactionCodeBase" WHERE id=$1 FOR UPDATE', id);
    const previous = await tx.transactionCodeBase.findUnique({ where: { id } });
    if (!previous) throw createHttpError(404,'SETTING_NOT_FOUND');
    if (previous.code !== data.code || previous.serviceTypeId !== data.serviceTypeId) throw createHttpError(409,'CODE_BASE_IDENTITY_IMMUTABLE');
  }
  const base = id ? await tx.transactionCodeBase.update({ where: { id }, data }) : await tx.transactionCodeBase.create({ data });
  const taxes = await tx.taxTreatment.findMany({ where: { id: { in: body.taxTreatmentIds } } });
  if (taxes.length !== body.taxTreatmentIds.length) throw createHttpError(400,'INVALID_TAX_TREATMENT');
  await tx.settingTransactionCodeDefault.updateMany({ where: { baseId: base.id, taxTreatmentId: { not: null } }, data: { isActive: false, isEnabled: false } });
  for (const tax of taxes) {
    const code = base.code + tax.suffix;
    const existing = await tx.settingTransactionCodeDefault.findUnique({ where: { code } });
    if (existing && (existing.baseId !== base.id || existing.taxTreatmentId !== tax.id)) throw createHttpError(409,'CODE_VARIANT_CONFLICT');
    const variant = { baseId: base.id, taxTreatmentId: tax.id, serviceTypeId: base.serviceTypeId, code, nameKo: base.nameKo, nameEn: base.nameEn, nameVi: base.nameVi, vatEnabled: tax.code === 'VAT', isActive: base.isActive, isEnabled: true };
    if (existing) await tx.settingTransactionCodeDefault.update({ where: { id: existing.id }, data: variant });
    else await tx.settingTransactionCodeDefault.create({ data: variant });
  }
  return tx.transactionCodeBase.findUnique({ where: { id: base.id }, include: { serviceType: true, variants: { include: { taxTreatment: true } } } });
}

// Pure inherited copies are configuration; manual overrides and business use block deletion.
export async function deleteSetting(tx: any, kind: 'services' | 'codes', global: boolean, id: number, orgId?: number, removingSource = false) {
  const service = kind === 'services';
  const table = global ? (service ? 'SettingServiceDefault' : 'SettingTransactionCodeDefault') : (service ? 'OutsourcingServiceType' : 'TransactionCode');
  const rows = await tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id=$1${global ? '' : ' AND "ownerOrgId"=$2'} FOR UPDATE`, ...global ? [id] : [id,orgId]);
  if (!rows.length) throw createHttpError(404,'SETTING_NOT_FOUND');
  const model = global ? (service ? tx.settingServiceDefault : tx.settingTransactionCodeDefault) : (service ? tx.outsourcingServiceType : tx.transactionCode);
  if (!global && !removingSource) {
    const row = await model.findUnique({ where: { id } });
    if (row?.systemDefaultId) throw createHttpError(409,'SETTING_INHERITED');
  }
  if (global) {
    const local = service ? tx.outsourcingServiceType : tx.transactionCode;
    if (service && (await tx.settingTransactionCodeDefault.count({ where: { serviceTypeId: id } }) || await tx.transactionCodeBase.count({ where: { serviceTypeId: id } }))) throw createHttpError(409,'SETTING_IN_USE');
    const copies = await local.findMany({ where: { systemDefaultId: id } });
    if (copies.some((row: any) => row.isOverridden)) throw createHttpError(409,'SETTING_IN_USE');
    for (const row of copies) await deleteSetting(tx, kind, false, row.id, row.ownerOrgId, true);
  }
  if (!global) {
    if (await tx.partnerTransactionCost.count({ where: service ? { serviceTypeId: id } : { transactionCodeId: id } })) throw createHttpError(409,'SETTING_IN_USE');
    if (service && (await tx.organizationOutsourcingServiceType.count({ where: { serviceTypeId: id } }) || await tx.transactionCode.count({ where: { serviceTypeId: id } }))) throw createHttpError(409,'SETTING_IN_USE');
  }
  await model.delete({ where: { id } });
}

export async function deleteCodeBase(tx: any, id: number) {
  await tx.$queryRawUnsafe('SELECT id FROM "TransactionCodeBase" WHERE id=$1 FOR UPDATE',id);
  if (!await tx.transactionCodeBase.findUnique({ where: { id } })) throw createHttpError(404,'SETTING_NOT_FOUND');
  const variants = await tx.settingTransactionCodeDefault.findMany({ where: { baseId: id } });
  for (const row of variants) await deleteSetting(tx,'codes',true,row.id);
  await tx.transactionCodeBase.delete({ where: { id } });
}

export function registerCodeBaseRoutes(app: any, db: any, gates: any) {
  const path = '/system-setting-defaults/code-bases';
  app.get('/tax-treatments', async (req: any, res: any) => {
    if (!await gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN','OPERATOR','ACCOUNTANT'] })) return;
    res.json(await db.taxTreatment.findMany({ orderBy: { id: 'asc' } }));
  });
  app.get(path, async (req: any, res: any) => {
    if (!await gates.requireSystemAdmin(req,res)) return;
    const bases = await db.transactionCodeBase.findMany({
      orderBy: { code: 'asc' },
      include: {
        serviceType: true,
        variants: { include: { taxTreatment: true, codes: { select: { isOverridden: true, _count: { select: { costs: true } } } } } },
      },
    });
    res.json(bases.map((base: any) => ({ ...base, hasUsageHistory: base.variants.some((variant: any) => variant.codes.some((local: any) => local.isOverridden || local._count.costs > 0)), variants: base.variants.map(({ codes, ...variant }: any) => variant) })));
  });
  for (const update of [false,true]) app[update ? 'put' : 'post'](`${path}${update ? '/:id' : ''}`, async (req: any,res: any) => {
    if (!await gates.requireSystemAdmin(req,res)) return;
    const id = update ? Number(req.params.id) : undefined;
    if (update && (!Number.isSafeInteger(id) || !id || id < 0)) throw createHttpError(400,'INVALID_SETTING_REFERENCE');
    res.status(update ? 200 : 201).json(await db.$transaction((tx: any) => saveCodeBase(tx,req.body,id)));
  });
  app.delete(`${path}/:id`, async (req: any,res: any) => {
    if (!await gates.requireSystemAdmin(req,res)) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw createHttpError(400,'INVALID_SETTING_REFERENCE');
    try { await db.$transaction((tx: any) => deleteCodeBase(tx,id)); }
    catch (error: any) { if (error.code === 'P2003') throw createHttpError(409,'SETTING_IN_USE'); throw error; }
    res.json({ ok: true });
  });
}
