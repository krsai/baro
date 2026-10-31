import { effectiveExpenseCode, registerExpenseCodeLinkPolicyRoutes } from './expenseCodeLinkPolicy';
import { validateServiceDefinition } from './partnerTransactionCost';
import { validateTransactionCode } from './transactionRequest';
import { loadAppSettings, saveAppSettings } from './applicationSettings';
import { createHttpError } from '../utils/http';
import { resolveAccountingCode, ACCOUNTING_CODE_INCLUDE } from './accountingCode';
import { registerCodeBaseRoutes, deleteSetting } from './codeBaseManagement';
import {partnerIndustryOption, saveSystemIndustry} from './partnerIndustry';
import {registerExpenseUnitRoutes} from './expenseMetadata';
import {saveCatalogueOrder} from './catalogueOrder';

export const serviceFields = ['code','nameKo','nameEn','nameVi','entryMode','requiredFields','orderInput','styleInput','processInput','isActive','sortOrder'];
export const codeFields = ['code','nameKo','nameEn','nameVi','vatEnabled','isActive','taxTreatmentId','baseId'];
export const pickSettings = (row: any, keys: string[]) => Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key,row[key]]));

export async function provisionSettingDefaults(tx: any, orgId: number, completeExpenseCatalogue = false) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
  const services = await tx.settingServiceDefault.findMany();
  // A code collision preserves the existing tenant row, without guessing a source FK.
  await tx.outsourcingServiceType.createMany({ data: services.map((row: any) => ({ ...pickSettings(row,serviceFields), ownerOrgId: orgId, systemDefaultId: row.id, isOverridden: false })), skipDuplicates: true });
  let locals = await tx.outsourcingServiceType.findMany({ where: { ownerOrgId: orgId, systemDefaultId: { not: null } } });
  if (completeExpenseCatalogue) {
    // Legacy tenant industries may already own the source's code. Do not adopt
    // those unrelated rows by text or rewrite their business FKs. Create a new
    // explicitly source-linked bridge with a distinct local technical code.
    const linked = new Set(locals.map((row: any)=>row.systemDefaultId));
    for (const source of services.filter((row: any)=>!linked.has(row.id))) {
      let code = `SYSTEM_${source.id}_${source.code}`, suffix = 0;
      while (await tx.outsourcingServiceType.findFirst({where:{ownerOrgId:orgId,code}})) code=`SYSTEM_${source.id}_${source.code}_${++suffix}`;
      await tx.outsourcingServiceType.create({data:{...pickSettings(source,serviceFields),code,ownerOrgId:orgId,systemDefaultId:source.id,isOverridden:true}});
    }
    locals = await tx.outsourcingServiceType.findMany({ where: { ownerOrgId: orgId, systemDefaultId: { not: null } } });
  }
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
  registerExpenseUnitRoutes(app,db,gates);
  registerCodeBaseRoutes(app,db,gates);
  registerExpenseCodeLinkPolicyRoutes(app,db,gates);
  const admin = (req: any, res: any) => gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN'] });
  const member = (req: any, res: any) => gates.requireOrgRole(req,res,{ allowedRoles: ['ADMIN','OPERATOR','ACCOUNTANT'] });
  app.get('/system-setting-defaults/partner-roles',async(req:any,res:any)=>{
    if(!await gates.requireSystemAdmin(req,res))return;
    res.json(await db.partnerRole.findMany({orderBy:[{sortOrder:'asc'},{id:'asc'}]}));
  });
  app.put('/system-setting-defaults/partner-roles/order',async(req:any,res:any)=>{
    if(!await gates.requireSystemAdmin(req,res))return;
    res.json(await db.$transaction((tx:any)=>saveCatalogueOrder(tx,'roles',req.body),{isolationLevel:'Serializable'}));
  });
  app.get('/partner-roles',async(req:any,res:any)=>{
    if(!await member(req,res))return;
    res.json(await db.partnerRole.findMany({orderBy:[{sortOrder:'asc'},{id:'asc'}]}));
  });
  app.get('/customer-industries',async(req:any,res:any)=>{
    if(!await member(req,res))return;
    res.json(await db.settingServiceDefault.findMany({where:{isActive:true,partnerRole:{code:'CUSTOMER'}},orderBy:[{sortOrder:'asc'},{id:'asc'}]}));
  });
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
  app.get('/customer-industries', async (req: any,res: any) => {
    if (!await member(req,res)) return;
    res.json(await db.settingServiceDefault.findMany({where:{isActive:true,partnerRole:{code:'CUSTOMER'}},select:{id:true,code:true,nameKo:true,nameEn:true,nameVi:true},orderBy:[{sortOrder:'asc'},{id:'asc'}]}));
  });
  for (const kind of ['services','codes'] as const) {
    const service = kind === 'services';
    const localPath = service ? '/outsourcing-service-types' : '/transaction-codes';
    const defaultPath = `/system-setting-defaults/${kind}`;
    const defaults = service ? db.settingServiceDefault : db.settingTransactionCodeDefault;
    const locals = service ? db.outsourcingServiceType : db.transactionCode;
    app.get(defaultPath, async (req: any,res: any) => {
      // Organization administrators can read the catalogue to explicitly adopt defaults.
      if (req.query.catalogue === '1') { if (!await admin(req,res)) return; }
      else if (!await gates.requireSystemAdmin(req,res)) return;
      const rows = await defaults.findMany({ include: service ? {
        partnerRole: true,
        expenseType: true,
        _count: { select: { codes: true, codeBases: true,customerIndustries:true,productionPolicies:true,partnerClassifications:true } },
        services: { select: { isOverridden: true, _count: { select: { transactionCosts: true, transactionCodes: true, partners: true } } } },
      } : { serviceType: true, taxTreatment: true, base:{include:{expenseType:true}}, codes: { select: { isOverridden: true, _count: { select: { costs: true,ledgerEntries:true,settlementLines:true } } } } }, orderBy: { id: 'asc' } });
      res.json(rows.filter((row:any)=>service || row.base?.expenseType?.code !== 'OTHER').map((row: any) => ({ ...row, hasUsageHistory: service
        ? Object.values(row._count).some((count:any)=>Number(count)>0) || row.services.some((local: any) => local.isOverridden || Object.values(local._count).some((count: any) => count > 0))
        : row.codes.some((local: any) => local.isOverridden || Object.values(local._count).some((count:any)=>Number(count)>0)) })));
    });
    app.get(localPath, async (req: any,res: any) => {
      const access = req.query.all === '1' ? await admin(req,res) : await member(req,res);
      if (!access) return;
      if(service && req.query.forPartner === '1' && !['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'].includes(req.query.partnerType))throw createHttpError(400,'INVALID_PARTNER_TYPE');
      await db.$transaction((tx: any) => provisionSettingDefaults(tx,access.organization.id,!service && (req.query.forExpenseRequest === '1'||req.query.forAccounting==='1') || service && req.query.forPartner === '1'), { isolationLevel: 'ReadCommitted' });
      if(service && req.query.forPartner === '1') {
        const partnerType=req.query.partnerType;
        const rows=await locals.findMany({where:{ownerOrgId:access.organization.id,systemDefaultId:{not:null}},include:{systemDefault:{include:{partnerRole:true}}},orderBy:{id:'asc'}});
        return res.json(rows.map((row:any)=>partnerIndustryOption(row,partnerType)).filter(Boolean).sort((a:any,b:any)=>a.sortOrder-b.sortOrder||a.systemDefaultId-b.systemDefaultId));
      }
      if (!service && (req.query.forExpenseRequest === '1'||req.query.forAccounting==='1')) {
        const candidates = await locals.findMany({ where: {ownerOrgId:access.organization.id,isActive:true}, include: ACCOUNTING_CODE_INCLUDE, orderBy: {code:'asc'} });
        if(req.query.forAccounting==='1')return res.json(candidates.map(resolveAccountingCode).filter(Boolean));
        const policies = await db.expenseCodeLinkPolicy.findMany({where:{orgId:access.organization.id}});
        return res.json(candidates.map(resolveAccountingCode).filter(Boolean).map((code:any)=>effectiveExpenseCode(code,policies.find((row:any)=>row.baseId===code.baseId))));
      }
      const rows = await locals.findMany({ where: { ownerOrgId: access.organization.id, ...(req.query.all === '1' ? {} : { isActive: true, ...(!service ? { baseId: { not: null }, taxTreatmentId: { not: null }, base: { isActive: true, expenseType: { isActive: true } } } : {}) }) }, include: service ? { systemDefault:{include:{partnerRole:true}}, _count: { select: { transactionCosts: true, transactionCodes: true, partners: true } } } : { base: { include: { expenseType: true } }, serviceType: true, taxTreatment: true, _count: { select: { costs: true,ledgerEntries:true,settlementLines:true } } }, orderBy: service ? [{ sortOrder: 'asc' }, { id: 'asc' }] : { code: 'asc' } });
      res.json(rows.filter((row:any)=>service || row.base?.expenseType?.code !== 'OTHER').map((row: any) => ({ ...row, hasUsageHistory: Boolean(row.systemDefaultId) || Object.values(row._count).some((count: any) => count > 0) })));
    });
    for (const global of [true,false]) {
      const base = global ? defaultPath : localPath;
      const model = global ? defaults : locals;
      app.delete(`${base}/:id`, async (req: any,res: any) => {
        const access = global ? await gates.requireSystemAdmin(req,res) : await admin(req,res);
        if (!access) return;
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw createHttpError(400,'INVALID_SETTING_REFERENCE');
        try { await db.$transaction((tx: any) => deleteSetting(tx,kind,global,id,global ? undefined : access.organization.id)); }
        catch (error: any) { if (error.code === 'P2003') throw createHttpError(409,'SETTING_IN_USE'); throw error; }
        res.json({ ok: true });
      });
      for (const update of [false,true]) {
        app[update ? 'put' : 'post'](`${base}${update ? '/:id' : ''}`, async (req: any,res: any) => {
          const access = global ? await gates.requireSystemAdmin(req,res) : await admin(req,res);
          if (!access) return;
          const orgId = global ? undefined : access.organization.id;
          const id = Number(req.params.id);
          const existing = update && Number.isSafeInteger(id) ? await model.findFirst({ where: { id, ...(!global ? { ownerOrgId: orgId } : {}) } }) : null;
          if (update && !existing) return res.status(404).json({ error: 'SETTING_NOT_FOUND' });
          const data: any = { ...(service ? validateServiceDefinition(req.body) : validateTransactionCode(req.body, Boolean(existing && existing.code === req.body?.code && !existing.taxTreatmentId))), isActive: req.body.isActive !== false };
          if(service && global){
            const partnerRoleId=req.body?.partnerRoleId;
            if(!Number.isSafeInteger(partnerRoleId)||partnerRoleId<=0||!await db.partnerRole.findUnique({where:{id:partnerRoleId}}))throw createHttpError(400,'PARTNER_ROLE_REQUIRED');
            data.partnerRoleId=partnerRoleId;
            // Legacy expenseTypeId is preserved, never repurposed as a role.
          }
          if (service && existing && existing.entryMode !== data.entryMode) throw createHttpError(409,'SERVICE_ENTRY_MODE_IMMUTABLE');
          if (global && !service && existing && existing.code !== data.code) throw createHttpError(409,'DEFAULT_CODE_IMMUTABLE');
          if (!service) {
            if (existing && existing.serviceTypeId !== data.serviceTypeId) throw createHttpError(409,'CODE_SERVICE_IMMUTABLE');
            const target = global ? db.settingServiceDefault : db.outsourcingServiceType;
            if (!await target.findFirst({ where: { id: data.serviceTypeId, ...(!global ? { ownerOrgId: orgId } : {}) } })) throw createHttpError(400,'INVALID_SERVICE_TYPE');
          }
          if (!global) data.isOverridden = true;
          if (!service && !global) {
            data.baseId = req.body?.baseId || existing?.baseId || null;
            if (!existing && !Number.isSafeInteger(data.baseId)) throw createHttpError(400,'CODE_BASE_REQUIRED');
            if (data.baseId != null) {
              const base = await db.transactionCodeBase.findUnique({ where: { id: data.baseId } });
              if (!base || data.taxTreatmentId && data.code.slice(0,3) !== base.code) throw createHttpError(400,'INVALID_CODE_BASE');
            }
          }
          const saved = await db.$transaction(async (tx: any) => {
            if (global && service) return saveSystemIndustry(tx,data,update ? id : undefined);
            const target = global ? (service ? tx.settingServiceDefault : tx.settingTransactionCodeDefault) : (service ? tx.outsourcingServiceType : tx.transactionCode);
            if (update && !service && !global) {
              await tx.$queryRawUnsafe('SELECT id FROM "TransactionCode" WHERE id=$1 AND "ownerOrgId"=$2 FOR UPDATE',id,orgId);
              const current = await target.findFirst({ where: { id, ownerOrgId: orgId } });
              if (!current) throw createHttpError(404,'SETTING_NOT_FOUND');
              if ((current.code !== data.code || current.taxTreatmentId !== data.taxTreatmentId || current.vatEnabled !== data.vatEnabled) && await tx.partnerTransactionCost.count({ where: { transactionCodeId: id } })) throw createHttpError(409,'SETTING_IN_USE');
            }
            return update ? target.update({ where: { id }, data }) : target.create({ data: { ...data, ...(!global ? { ownerOrgId: orgId } : {}) } });
          });
          res.status(update ? 200 : 201).json(saved);
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
