import { normalizeLocalizedName, validLocalizedName } from '../utils/localizedName';
import { createHttpError } from '../utils/http';
import { COST_DETAIL_FIELDS } from './partnerTransactionCost';

export async function initializeOtherExpenseDefaults(tx: any, actorId?: number | null) {
  // Prisma cannot deserialize PostgreSQL's void result from advisory locks.
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(2026101903)::text AS lock');
  const key = 'EXPENSE_OTHER_DEFAULTS:2026-10-19';
  const previous = await tx.systemSetting.findUnique({ where: { key } });
  if (previous) return previous.value;
  const type = await tx.expenseType.findUnique({ where: { code: 'OTHER' } }) || await tx.expenseType.create({ data: {
    code: 'OTHER', nameKo: '기타', nameEn: 'Other', nameVi: 'Khác', entryMode: 'GENERAL', isActive: true,
  } });
  let base = await tx.transactionCodeBase.findUnique({ where: { code: 'OTH' } });
  if (!base) {
    let industry = await tx.settingServiceDefault.findUnique({ where: { code: 'GENERAL' } });
    if (!industry) {
      // The unclassified general-service template may have been renamed before
      // OTHER is first initialized. Never pick arbitrarily from several templates.
      const candidates = (await tx.settingServiceDefault.findMany({ where: { entryMode: 'GENERAL' } })).filter((row: any) => row.partnerRoleId == null);
      if (candidates.length === 1) industry = candidates[0];
    }
    if (!industry) throw createHttpError(409, 'DEFAULT_GENERAL_SERVICE_REQUIRED');
    base = await saveCodeBase(tx, { code: 'OTH', nameKo: '기타 비용', nameEn: 'Other expenses', nameVi: 'Chi phí khác',
      expenseTypeId: type.id, serviceTypeId: industry.id, taxTreatmentIds: [1,2,3], requiredFields: [],
      orderInput: 'OPTIONAL', styleInput: 'HIDDEN', processInput: 'HIDDEN', isActive: true });
  }
  const value = { expenseTypeId: type.id, baseId: base.id };
  await tx.systemSetting.create({ data: { key, value, updatedByEmployeeId: actorId ?? null } });
  return value;
}

export function validateCodeBase(body: any) {
  if (!validLocalizedName(body, 100)) throw createHttpError(400,'INVALID_CODE_BASE');
  body = { ...body, ...normalizeLocalizedName(body) };
  if (body?.expenseTypeId != null && (!Number.isSafeInteger(body.expenseTypeId) || body.expenseTypeId <= 0)) throw createHttpError(400,'INVALID_EXPENSE_TYPE');
  if (!/^[A-Z]{3}$/.test(body?.code || '') || !validLocalizedName(body, 100)) throw createHttpError(400,'INVALID_CODE_BASE');
  if (!Number.isSafeInteger(body.serviceTypeId) || body.serviceTypeId <= 0) throw createHttpError(400,'INVALID_SERVICE_TYPE');
  if (!Array.isArray(body.taxTreatmentIds) || !body.taxTreatmentIds.length || body.taxTreatmentIds.some((id: any) => ![1,2,3].includes(id)) || new Set(body.taxTreatmentIds).size !== body.taxTreatmentIds.length) throw createHttpError(400,'INVALID_TAX_TREATMENT');
  return { code: body.code, nameKo: body.nameKo.trim(), nameEn: body.nameEn.trim(), nameVi: body.nameVi.trim(), serviceTypeId: body.serviceTypeId, isActive: body.isActive !== false };
}

export async function saveCodeBase(tx: any, body: any, id?: number) {
  const data: any = validateCodeBase(body);
  // Serialize catalogue writes and tenant provisioning while code identities move.
  // Business cost rows and their FKs are never updated.
  await tx.$queryRawUnsafe('LOCK TABLE "TransactionCodeBase", "SettingTransactionCodeDefault", "TransactionCode" IN SHARE ROW EXCLUSIVE MODE');
  await tx.$queryRawUnsafe('SELECT id FROM "SettingServiceDefault" WHERE id=$1 FOR UPDATE', data.serviceTypeId);
  if (!await tx.settingServiceDefault.findUnique({ where: { id: data.serviceTypeId } })) throw createHttpError(400,'INVALID_SERVICE_TYPE');
  if (id) {
    await tx.$queryRawUnsafe('SELECT id FROM "TransactionCodeBase" WHERE id=$1 FOR UPDATE', id);
    const previous = await tx.transactionCodeBase.findUnique({ where: { id } });
    if (!previous) throw createHttpError(404,'SETTING_NOT_FOUND');
    if (previous.serviceTypeId !== data.serviceTypeId) throw createHttpError(409,'CODE_BASE_IDENTITY_IMMUTABLE');
  }
  const source = await tx.settingServiceDefault.findUnique({ where: { id: data.serviceTypeId } });
  const previous = id ? await tx.transactionCodeBase.findUnique({ where: { id } }) : null;
  const expenseType = body.expenseTypeId
    ? await tx.expenseType.findUnique({ where: { id: body.expenseTypeId } })
    : await tx.expenseType.findUnique({ where: { code: source.entryMode === 'PROCESS' ? 'PRODUCTION' : source.entryMode === 'LOGISTICS' ? 'LOGISTICS' : 'GENERAL' } });
  if (!expenseType || !expenseType.isActive && expenseType.id !== previous?.expenseTypeId) throw createHttpError(400,'INVALID_EXPENSE_TYPE');
  if (previous?.entryMode && previous.entryMode !== expenseType.entryMode && (await getCodeBaseUsage(tx,[id!])).has(id!)) throw createHttpError(409,'USED_CODE_ENTRY_MODE_IMMUTABLE');
  data.expenseTypeId = expenseType.id;
  data.entryMode = expenseType.entryMode;
  data.requiredFields = body.requiredFields ?? previous?.requiredFields ?? source.requiredFields;
  if (!Array.isArray(data.requiredFields) || data.requiredFields.some((field: any) => !COST_DETAIL_FIELDS.includes(field))) throw createHttpError(400,'INVALID_REQUIRED_FIELDS');
  for (const key of ['orderInput','styleInput','processInput']) {
    data[key] = data.entryMode === 'PROCESS' ? 'REQUIRED' : body[key] ?? previous?.[key] ?? (key === 'orderInput' ? 'OPTIONAL' : 'HIDDEN');
    if (!['REQUIRED','OPTIONAL','HIDDEN'].includes(data[key])) throw createHttpError(400,'INVALID_INPUT_OPTION');
  }
  if (data.styleInput !== 'HIDDEN' && data.orderInput === 'HIDDEN' || data.processInput !== 'HIDDEN' && (data.orderInput === 'HIDDEN' || data.styleInput === 'HIDDEN')) throw createHttpError(400,'INVALID_INPUT_OPTION');
  const renaming = previous && previous.code !== data.code;
  if (renaming) await assertCodeBaseRenameAvailable(tx, id!, data.code);
  const base = id ? await tx.transactionCodeBase.update({ where: { id }, data }) : await tx.transactionCodeBase.create({ data });
  if (renaming) {
    // Rename disabled variants too; re-enabling must reuse the same IDs.
    await tx.$executeRawUnsafe(`UPDATE "SettingTransactionCodeDefault" c SET code=$2 || t.suffix
      FROM "TaxTreatment" t WHERE c."baseId"=$1 AND c."taxTreatmentId"=t.id`,base.id,base.code);
    await tx.$executeRawUnsafe(`UPDATE "TransactionCode" c SET code=$2 || t.suffix
      FROM "TaxTreatment" t WHERE c."baseId"=$1 AND c."taxTreatmentId"=t.id`,base.id,base.code);
  }
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
  return tx.transactionCodeBase.findUnique({ where: { id: base.id }, include: { serviceType: true, expenseType: true, variants: { include: { taxTreatment: true } } } });
}

async function assertCodeBaseRenameAvailable(tx: any, id: number, code: string) {
  const conflicts = await tx.$queryRawUnsafe(`SELECT 1 FROM "TransactionCodeBase" WHERE upper(code)=$2 AND id<>$1
    UNION ALL SELECT 1 FROM "SettingTransactionCodeDefault" c JOIN "TaxTreatment" t ON upper(c.code)=$2 || t.suffix
      WHERE c."baseId" IS DISTINCT FROM $1 OR c."taxTreatmentId" IS DISTINCT FROM t.id
    UNION ALL SELECT 1 FROM "TransactionCode" target JOIN "TransactionCode" source ON target."ownerOrgId"=source."ownerOrgId"
      JOIN "TaxTreatment" t ON t.id=source."taxTreatmentId"
      WHERE source."baseId"=$1 AND upper(target.code)=$2 || t.suffix AND target.id<>source.id LIMIT 1`,id,code);
  if (conflicts.length) throw createHttpError(409,'CODE_RENAME_CONFLICT');
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
  // Lock app code identities too: FK writes of new costs serialize with deletion.
  await tx.$queryRawUnsafe('SELECT id FROM "TransactionCode" WHERE "baseId"=$1 ORDER BY id FOR UPDATE',id);
  if ((await getCodeBaseUsage(tx,[id])).has(id)) throw createHttpError(409,'SETTING_IN_USE');
  // Unused application settings do not constitute transaction history.
  await tx.transactionCode.deleteMany({ where: { baseId: id } });
  const variants = await tx.settingTransactionCodeDefault.findMany({ where: { baseId: id } });
  for (const row of variants) await deleteSetting(tx,'codes',true,row.id);
  await tx.transactionCodeBase.delete({ where: { id } });
}

export async function getCodeBaseUsage(db: any, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await db.$queryRawUnsafe(`SELECT DISTINCT code."baseId" AS id
    FROM "TransactionCode" code JOIN "PartnerTransactionCost" cost ON cost."transactionCodeId"=code.id
    WHERE code."baseId"=ANY($1::int[])`,ids) as { id: number }[];
  return new Set(rows.map(row=>row.id));
}

export function registerCodeBaseRoutes(app: any, db: any, gates: any) {
  app.get('/system-setting-defaults/expense-types', async (req: any,res: any) => {
    if (!await gates.requireSystemAdmin(req,res)) return;
    res.json(await db.expenseType.findMany({ orderBy: { id: 'asc' } }));
  });
  app.post('/system-setting-defaults/other-expense-defaults', async (req: any, res: any) => {
    if (!await gates.requireSystemAdmin(req,res)) return;
    res.json(await db.$transaction((tx: any) => initializeOtherExpenseDefaults(tx,gates.actorId?.()), { isolationLevel: 'Serializable' }));
  });
  app.get('/expense-types', async (req: any,res: any) => {
    if (!await gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN','OPERATOR','ACCOUNTANT'] })) return;
    res.json(await db.expenseType.findMany({ orderBy: { id: 'asc' } }));
  });
  app.put('/expense-types/:id', async (req: any,res: any) => {
    if (!await gates.requireSystemAdmin(req,res)) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !validLocalizedName(req.body, 100)) throw createHttpError(400,'INVALID_EXPENSE_TYPE');
    const { nameEn, nameKo, nameVi } = normalizeLocalizedName(req.body);
    res.json(await db.expenseType.update({ where: { id }, data: { nameEn, nameKo, nameVi, isActive: req.body.isActive !== false } }));
  });
  const path = '/system-setting-defaults/code-bases';
  app.get('/tax-treatments', async (req: any, res: any) => {
    if (!await gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN','OPERATOR','ACCOUNTANT'] })) return;
    res.json(await db.taxTreatment.findMany({ orderBy: { id: 'asc' } }));
  });
  app.get(path, async (req: any, res: any) => {
    if (req.query?.catalogue === '1') { if (!await gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN'] })) return; }
    else if (!await gates.requireSystemAdmin(req,res)) return;
    const bases = await db.transactionCodeBase.findMany({
      orderBy: { code: 'asc' },
      include: {
        serviceType: true,
        expenseType: true,
        variants: { include: { taxTreatment: true } },
      },
    });
    const usedIds = await getCodeBaseUsage(db,bases.map((base: any)=>base.id));
    res.json(bases.map((base: any) => ({ ...base, hasUsageHistory: usedIds.has(base.id) })));
  });
  for (const update of [false,true]) app[update ? 'put' : 'post'](`${path}${update ? '/:id' : ''}`, async (req: any,res: any) => {
    if (!await gates.requireSystemAdmin(req,res)) return;
    const id = update ? Number(req.params.id) : undefined;
    if (update && (!Number.isSafeInteger(id) || !id || id < 0)) throw createHttpError(400,'INVALID_SETTING_REFERENCE');
    try { res.status(update ? 200 : 201).json(await db.$transaction((tx: any) => saveCodeBase(tx,req.body,id))); }
    catch (error: any) {
      if (error.code === 'P2002') throw createHttpError(409,'CODE_RENAME_CONFLICT');
      throw error;
    }
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
