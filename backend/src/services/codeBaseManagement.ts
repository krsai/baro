import {accountingInputs} from './accountingInputs';
import {codeIndustrySelection,codeIndustryDto,CODE_INDUSTRY_INCLUDE} from './accountingCodeIndustries';
import { normalizeLocalizedName, validLocalizedName } from '../utils/localizedName';
import { createHttpError } from '../utils/http';
import { COST_DETAIL_FIELDS } from './partnerTransactionCost';

export function validateCodeBase(body: any) {
  if (!validLocalizedName(body, 100)) throw createHttpError(400,'INVALID_CODE_BASE');
  body = { ...body, ...normalizeLocalizedName(body) };
  if (!/^[A-Z]{3}$/.test(body?.code || '') || !validLocalizedName(body, 100)) throw createHttpError(400,'INVALID_CODE_BASE');
  if (!Array.isArray(body.taxTreatmentIds) || !body.taxTreatmentIds.length || body.taxTreatmentIds.some((id: any) => ![1,2,3].includes(id)) || new Set(body.taxTreatmentIds).size !== body.taxTreatmentIds.length) throw createHttpError(400,'INVALID_TAX_TREATMENT');
  return { code: body.code, nameKo: body.nameKo.trim(), nameEn: body.nameEn.trim(), nameVi: body.nameVi.trim(), serviceTypeId: body.serviceTypeId, isActive: body.isActive !== false };
}

export async function saveCodeBase(tx: any, body: any, id?: number) {
  body={...body,taxTreatmentIds:[1,2,3]};
  const data: any = validateCodeBase(body);
  // Serialize catalogue writes and tenant provisioning while code identities move.
  // Business cost rows and their FKs are never updated.
  await tx.$queryRawUnsafe('LOCK TABLE "TransactionCodeBase", "SettingTransactionCodeDefault", "TransactionCode" IN SHARE ROW EXCLUSIVE MODE');
  const previous = id ? await tx.transactionCodeBase.findUnique({ where: { id },include:{expenseType:true} }) : null;
  if(id&&!previous)throw createHttpError(404,'SETTING_NOT_FOUND');
  if(body.expenseTypeId!=null&&body.expenseTypeId!==previous?.expenseTypeId)throw createHttpError(410,'ACCOUNTING_TYPES_RETIRED');
  if(previous&&body.serviceTypeId!=null&&body.serviceTypeId!==previous.serviceTypeId)throw createHttpError(409,'CODE_BASE_IDENTITY_IMMUTABLE');
  if(previous?.expenseType?.code==='OTHER')throw createHttpError(410,'OTHER_EXPENSE_TYPE_RETIRED');
  const selection=await codeIndustrySelection(tx,body,previous);
  data.serviceTypeId=previous?.serviceTypeId??selection.ids[0];
  await tx.$queryRawUnsafe('SELECT id FROM "SettingServiceDefault" WHERE id=$1 FOR UPDATE', data.serviceTypeId);
  if (!await tx.settingServiceDefault.findUnique({ where: { id: data.serviceTypeId } })) throw createHttpError(400,'INVALID_SERVICE_TYPE');
  if (id) {
    await tx.$queryRawUnsafe('SELECT id FROM "TransactionCodeBase" WHERE id=$1 FOR UPDATE', id);
  }
  const source = await tx.settingServiceDefault.findUnique({ where: { id: data.serviceTypeId } });
  data.entryMode=body.entryMode??previous?.entryMode??source.entryMode;
  if(!['PROCESS','LOGISTICS','GENERAL'].includes(data.entryMode)&&data.entryMode!==previous?.entryMode)throw createHttpError(400,'INVALID_ENTRY_MODE');
  if (previous?.entryMode && previous.entryMode !== data.entryMode && (await getCodeBaseUsage(tx,[id!])).has(id!)) throw createHttpError(409,'USED_CODE_ENTRY_MODE_IMMUTABLE');
  // Legacy type/source FKs remain unchanged. They no longer define new code families.
  if(previous&&selection.supplied)data.industryRevision={increment:1};
  data.requiredFields = body.requiredFields ?? previous?.requiredFields ?? source.requiredFields;
  if (!Array.isArray(data.requiredFields) || data.requiredFields.some((field: any) => !COST_DETAIL_FIELDS.includes(field))) throw createHttpError(400,'INVALID_REQUIRED_FIELDS');
  for (const key of ['orderInput','styleInput','processInput']) {
    data[key] = body[key] ?? previous?.[key] ?? (key === 'orderInput' ? 'OPTIONAL' : 'HIDDEN');
    if (!['REQUIRED','OPTIONAL','HIDDEN'].includes(data[key])) throw createHttpError(400,'INVALID_INPUT_OPTION');
  }
  if (data.styleInput !== 'HIDDEN' && data.orderInput === 'HIDDEN' || data.processInput !== 'HIDDEN' && (data.orderInput === 'HIDDEN' || data.styleInput === 'HIDDEN')) throw createHttpError(400,'INVALID_INPUT_OPTION');
  accountingInputs(data);
  const renaming = previous && previous.code !== data.code;
  if (renaming) await assertCodeBaseRenameAvailable(tx, id!, data.code);
  const base = id ? await tx.transactionCodeBase.update({ where: { id }, data }) : await tx.transactionCodeBase.create({ data });
  if(!previous||selection.supplied){
    await tx.accountingCodeIndustry.deleteMany({where:{baseId:base.id}});
    await tx.accountingCodeIndustry.createMany({data:selection.ids.map(systemIndustryId=>({baseId:base.id,systemIndustryId}))});
  }
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
  return codeIndustryDto(await tx.transactionCodeBase.findUnique({ where: { id: base.id }, include: { serviceType: true, industryLinks:CODE_INDUSTRY_INCLUDE,expenseType: true, variants: { include: { taxTreatment: true } } } }));
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
    if(service&&(await tx.orgRelationship?.count({where:{systemIndustryId:id}})||await tx.industryProductionPolicy?.count({where:{systemIndustryId:id}})||await tx.partnerClassificationIndustry?.count({where:{systemIndustryId:id}})||await tx.accountingCodeIndustry?.count({where:{systemIndustryId:id}})))throw createHttpError(409,'SETTING_IN_USE');
    const copies = await local.findMany({ where: { systemDefaultId: id } });
    if (copies.some((row: any) => row.isOverridden)) throw createHttpError(409,'SETTING_IN_USE');
    for (const row of copies) await deleteSetting(tx, kind, false, row.id, row.ownerOrgId, true);
  }
  if (!global) {
    if (await tx.partnerTransactionCost.count({ where: service ? { serviceTypeId: id } : { transactionCodeId: id } })) throw createHttpError(409,'SETTING_IN_USE');
    if(!service&&(await tx.bankLedgerEntry?.count({where:{accountingCodeId:id}})||await tx.bankLedgerSettlementLine?.count({where:{accountingCodeId:id}})))throw createHttpError(409,'SETTING_IN_USE');
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
  const ledgerUsage=db.bankLedgerEntry&&db.bankLedgerSettlementLine?`
    UNION SELECT DISTINCT code."baseId" AS id FROM "TransactionCode" code JOIN "BankLedgerEntry" entry ON entry."accountingCodeId"=code.id WHERE code."baseId"=ANY($1::int[])
    UNION SELECT DISTINCT code."baseId" AS id FROM "TransactionCode" code JOIN "BankLedgerSettlementLine" line ON line."accountingCodeId"=code.id WHERE code."baseId"=ANY($1::int[])`:'';
  const rows = await db.$queryRawUnsafe(`SELECT DISTINCT code."baseId" AS id
    FROM "TransactionCode" code JOIN "PartnerTransactionCost" cost ON cost."transactionCodeId"=code.id
    WHERE code."baseId"=ANY($1::int[])`+ledgerUsage,ids) as { id: number }[];
  return new Set(rows.map(row=>row.id));
}

export function registerCodeBaseRoutes(app: any, db: any, gates: any) {
  // Authenticated tombstones keep old tabs/clients from modifying retired category settings.
  for(const [method,path] of [['put','/expense-types/order'],['get','/system-setting-defaults/expense-types'],['put','/expense-types/:id'],['post','/system-setting-defaults/other-expense-defaults']] as const){
    app[method](path,async(req:any,res:any)=>{if(!await gates.requireSystemAdmin(req,res))return;throw createHttpError(410,'ACCOUNTING_TYPES_RETIRED');});
  }
  app.get('/expense-types',async(req:any,res:any)=>{if(!await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']}))return;throw createHttpError(410,'ACCOUNTING_TYPES_RETIRED');});
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
        industryLinks:CODE_INDUSTRY_INCLUDE,
        expenseType: true,
        variants: { include: { taxTreatment: true } },
      },
    });
    const usedIds = await getCodeBaseUsage(db,bases.map((base: any)=>base.id));
    res.json(bases.filter((base: any)=>base.expenseType?.code !== 'OTHER').map((base: any) => ({ ...codeIndustryDto(base), hasUsageHistory: usedIds.has(base.id) })));
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
