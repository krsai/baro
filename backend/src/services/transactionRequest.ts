import { normalizeExpenseProcessIds, storedExpenseProcessIds, validateExpenseProcessLinks } from './expenseProcessLinks';
import { normalizeLocalizedName, validLocalizedName } from '../utils/localizedName';
import { resolveExpenseCodeLink } from './expenseCodeLinkPolicy';
import { Prisma } from '@prisma/client';
import { env } from 'node:process';
import { createHttpError } from '../utils/http';
import { validateCostDate, COST_DETAIL_FIELDS } from './partnerTransactionCost';
import { snapshotProcessIds, hasValidAssignmentProcessRefs } from '../utils/assignmentSnapshotIntegrity';
import { loadManagementPeriod, assertManagedDate } from '../factories/factoryManagementStart';
import { resolveSystemExpenseCode, SYSTEM_EXPENSE_CODE_INCLUDE } from './systemExpenseCode';
import {prepareExpenseMetadata,saveExpenseReferences} from './expenseMetadata';

export const REQUEST_INCLUDE = { processLinks: { orderBy: { styleProcessId: 'asc' }, include: { styleProcess: { select: { id: true, processCode: true, processName: true } } } }, unit:true, referenceLinks:{include:{workOrder:{select:{id:true,orderNumber:true}},style:{select:{id:true,name:true,code:true}}},orderBy:{id:'asc' as const}}, expenseRequest: { select: { id: true, managementNumber: true, remark: true } }, outsourcedWorkRecord: { select: { id: true, assignmentPlanId: true, workLogId: true } }, partner: { select: { id: true, name: true } }, serviceType: true, transactionCode: { include: { base: { include: { expenseType: true } } } }, workOrder: { select: { id: true, orderNumber: true } }, style: { select: { id: true, name: true, code: true } }, styleProcess: { select: { id: true, processName: true, processCode: true } }, createdByEmployee: { select: { id: true, name: true } } } as const;
const invalid = (code: string): never => { throw createHttpError(400, code); };
export { appSettingsKey, loadAppSettings } from './applicationSettings';
import { loadAppSettings } from './applicationSettings';
export function validateVatRate(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d{1,3}(\.\d{1,2})?$/.test(String(value))) return invalid('INVALID_VAT_RATE');
  const rate = new Prisma.Decimal(value);
  if (rate.gt(100)) return invalid('INVALID_VAT_RATE');
  return rate;
}
export function validateTransactionCode(body: any, allowLegacy = false) {
  if (!validLocalizedName(body, 100)) return invalid('INVALID_TRANSACTION_CODE');
  body = { ...body, ...normalizeLocalizedName(body) };
  if (!Number.isSafeInteger(body?.serviceTypeId) || body.serviceTypeId <= 0) return invalid('INVALID_SERVICE_TYPE');
  const text = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(text('code')) || !validLocalizedName(body, 100) || typeof body.vatEnabled !== 'boolean') return invalid('INVALID_TRANSACTION_CODE');
  const taxTreatmentId = body.taxTreatmentId ?? (body.vatEnabled && /^[A-Z]{3}V$/.test(text('code')) ? 1 : null);
  if (!allowLegacy && (!/^[A-Z]{3}[VZE]$/.test(text('code')) || ![1,2,3].includes(taxTreatmentId))) return invalid('INVALID_TRANSACTION_CODE');
  if (taxTreatmentId != null && (![1,2,3].includes(taxTreatmentId) || text('code').slice(-1) !== ({ 1: 'V', 2: 'Z', 3: 'E' } as Record<number,string>)[taxTreatmentId] || body.vatEnabled !== (taxTreatmentId === 1))) return invalid('INVALID_TAX_TREATMENT');
  return { serviceTypeId: body.serviceTypeId, code: text('code'), nameKo: text('nameKo'), nameEn: text('nameEn'), nameVi: text('nameVi'), vatEnabled: body.vatEnabled, taxTreatmentId, isActive: body.isActive !== false };
}
export function calculateRequestAmounts(unitPrice: unknown, quantity: unknown, currency: unknown, vatRate: unknown) {
  const decimal = (value: unknown) => typeof value === 'string' && /^\d{1,12}(\.\d{1,4})?$/.test(value) ? new Prisma.Decimal(value) : invalid('INVALID_PRICE_OR_QUANTITY');
  const price = decimal(unitPrice), qty = decimal(quantity);
  if (price.lte(0) || qty.lte(0) || !['VND','KRW','USD'].includes(String(currency))) return invalid('INVALID_PRICE_OR_QUANTITY');
  const precision = currency === 'USD' ? 2 : 0;
  const rate = validateVatRate(vatRate);
  const subtotal = price.mul(qty).toDecimalPlaces(precision, Prisma.Decimal.ROUND_HALF_UP);
  const vatAmount = subtotal.mul(rate).div(100).toDecimalPlaces(precision, Prisma.Decimal.ROUND_HALF_UP);
  const amount = subtotal.add(vatAmount);
  if (subtotal.lte(0) || amount.gte('10000000000000000')) return invalid('INVALID_TRANSACTION_AMOUNT');
  return { unitPrice: price, quantity: qty, subtotal, vatRate: rate, vatAmount, amount };
}
export async function registerTransactionRequest(tx: any, orgId: number, actorId: number, body: any, appendQuantityRemark?: (args: any) => Promise<string | null>, useSystemMaster = false, edit?: { cost?: any; record?: any; request?: { id: number; line: number } }) {
  const id = (value: unknown, optional = false): number | null => optional && (value == null || value === '') ? null : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid('INVALID_REQUEST_REFERENCE');
  const partnerOrgId = id(body?.partnerOrgId)!, transactionCodeId = id(body?.transactionCodeId)!;
  const workOrderId = id(body?.workOrderId, true), styleId = id(body?.styleId, true), styleProcessId = id(body?.styleProcessId, true);
  const assignmentPlanId = id(body?.assignmentPlanId, true);
  const processIds = normalizeExpenseProcessIds(body?.styleProcessIds === undefined ? (edit?.cost ? storedExpenseProcessIds(edit.cost) : undefined) : body.styleProcessIds);
  const transactionDate = validateCostDate(body?.transactionDate);
  const period = await loadManagementPeriod(tx,orgId);
  assertManagedDate(transactionDate,period.startDate);
  if (typeof body?.clientKey !== 'string' || !/^[\w-]{8,100}$/.test(body.clientKey)) return invalid('INVALID_TRANSACTION_KEY');
  let description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!useSystemMaster && (!description || description.length > 2000)) return invalid('TRANSACTION_DESCRIPTION_REQUIRED');
  const details: Record<string,string> = {};
  if (!body.details || typeof body.details !== 'object' || Array.isArray(body.details)) return invalid('INVALID_TRANSACTION_DETAILS');
  for (const [key,value] of Object.entries(body.details)) {
    if (!COST_DETAIL_FIELDS.includes(key as any) || typeof value !== 'string' || value.length > 500) return invalid('INVALID_TRANSACTION_DETAILS');
    details[key] = value.trim();
  }
  if (details.transportDate) validateCostDate(details.transportDate);
  const previous = edit ? null : await tx.partnerTransactionCost.findUnique({ where: { orgId_clientKey: { orgId, clientKey: body.clientKey } }, include: REQUEST_INCLUDE });
  const metadata=await prepareExpenseMetadata(tx,orgId,body,edit?.cost||previous||(edit?.record?{workOrderId:edit.record.assignmentPlan?.workOrderId,styleId:edit.record.styleId}:null));
  if (previous) {
    if(body.unitId!==undefined&&metadata.unitId!==(previous.unitId??null))throw createHttpError(409,'TRANSACTION_RETRY_MISMATCH');
    if(metadata.supplied){
      const keys=(orders:any[],styles:any[])=>JSON.stringify([...orders.map(id=>`${id}:`),...styles.map(row=>`${row.workOrderId}:${row.styleId}`)].sort());
      const oldLinks=previous.referenceLinks||[];
      if(keys(metadata.orderIds,metadata.styles)!==keys(oldLinks.filter((row:any)=>!row.styleId).map((row:any)=>row.workOrderId),oldLinks.filter((row:any)=>row.styleId)))throw createHttpError(409,'TRANSACTION_RETRY_MISMATCH');
    }
    if(useSystemMaster)description=previous.description;
    const amounts = calculateRequestAmounts(body.unitPrice, body.quantity, body.currency, body.vatRate ?? previous.vatRate.toString());
    if (JSON.stringify(storedExpenseProcessIds(previous))!==JSON.stringify(processIds)) throw createHttpError(409,'TRANSACTION_RETRY_MISMATCH');
    if (previous.transactionCodeId !== transactionCodeId || previous.partnerOrgId !== partnerOrgId || previous.workOrderId !== workOrderId || previous.styleId !== styleId || previous.styleProcessId !== styleProcessId || previous.transactionDate !== transactionDate || previous.description !== description || previous.currency !== body.currency || previous.createdByEmployeeId !== actorId || !previous.unitPrice.equals(amounts.unitPrice) || !previous.quantity.equals(amounts.quantity) || !previous.vatRate.equals(amounts.vatRate) || COST_DETAIL_FIELDS.some(key => (previous.details?.[key] || '') !== (details[key] || ''))) throw createHttpError(409,'TRANSACTION_RETRY_MISMATCH');
    if (assignmentPlanId && previous.outsourcedWorkRecord?.assignmentPlanId !== assignmentPlanId) throw createHttpError(409,'TRANSACTION_RETRY_MISMATCH');
    return previous;
  }
  const localCode = await tx.transactionCode.findFirst({ where: { id: transactionCodeId, ownerOrgId: orgId, isActive: true, base: { isActive: true, expenseType: { isActive: true } } }, include: useSystemMaster ? SYSTEM_EXPENSE_CODE_INCLUDE : { serviceType: true, base: { include: { expenseType: true } } } });
  const rawCode = useSystemMaster ? resolveSystemExpenseCode(localCode) : localCode;
  const code = await resolveExpenseCodeLink(tx,orgId,rawCode,edit);
  if (!code || !code.taxTreatmentId || !code.baseId) return invalid('INVALID_TRANSACTION_CODE');
  if(useSystemMaster)description=edit?.cost?.description || [code.base.expenseType?.nameEn,code.base.nameEn || code.nameEn || code.code].filter(Boolean).join(' - ');
  if (!description || description.length > 2000) return invalid('TRANSACTION_DESCRIPTION_REQUIRED');
  const service = { ...code.base, id: code.serviceTypeId ?? code.serviceType.id };
  const partner = await tx.organization.findFirst({ where: { id: partnerOrgId, ownerOrgId: orgId, isActive: true, type: { in: ['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'] } } });
  if (!partner) return invalid('INVALID_PARTNER_SERVICE');
  const process = service.entryMode === 'PROCESS';
  if (edit?.record && (edit.record.orgId !== orgId ||
    edit.record.styleId !== styleId || edit.record.styleProcessId !== styleProcessId || edit.record.assignmentPlanId !== assignmentPlanId ||
    edit.record.assignmentPlan.workOrderId !== workOrderId)) return invalid('EXISTING_PRODUCTION_IDENTITY_IMMUTABLE');
  if ((process || edit?.record) && body.currency !== 'VND') return invalid('PROCESS_CURRENCY_MUST_BE_VND');
  const selections = { order: workOrderId, style: styleId, process: styleProcessId };
  for (const key of ['order','style','process'] as const) {
    const option = process || edit?.record ? 'REQUIRED' : service[`${key}Input`];
    if (option === 'REQUIRED' && !selections[key]) return invalid(`REQUIRED_REQUEST_${key.toUpperCase()}`);
    if (option === 'HIDDEN' && selections[key]) return invalid(`UNEXPECTED_REQUEST_${key.toUpperCase()}`);
    if(metadata.supplied&&option==='HIDDEN'&&(key==='order'&&metadata.orderIds.length||key==='style'&&metadata.styles.length))return invalid(`UNEXPECTED_REQUEST_${key.toUpperCase()}`);
  }
  if (styleId && !workOrderId || styleProcessId && !styleId) return invalid('INVALID_REQUEST_REFERENCE');
  if (workOrderId && !await tx.workOrder.findFirst({ where: { id: workOrderId, orgId }, select: { id: true } })) return invalid('INVALID_TRANSACTION_ORDER');
  const retainedStyle=edit?.cost && edit.cost.workOrderId===workOrderId && edit.cost.styleId===styleId;
  if (!edit?.record && !retainedStyle && styleId && !await tx.workOrderItem.findFirst({ where: { workOrderId, styleId, workOrder: { orgId }, style: { orgId } }, select: { id: true } })) return invalid('INVALID_REQUEST_STYLE');
  const retainedProcess=retainedStyle && edit.cost.styleProcessId===styleProcessId;
  if (styleProcessId && !await tx.styleProcess.findFirst({ where: { id: styleProcessId, styleId, orgId, ...(!edit?.record && !retainedProcess ? { isActive: true } : {}) }, select: { id: true } })) return invalid('INVALID_REQUEST_PROCESS');
  await validateExpenseProcessLinks(tx,orgId,body,code,edit,processIds);
  for (const field of service.requiredFields) if (!details[field]) return invalid(`REQUIRED_TRANSACTION_FIELD:${field}`);
  const settings = await loadAppSettings(tx, orgId);
  const rate = code.vatEnabled ? body.vatRate ?? settings.defaultVatRate : '0';
  if (!code.vatEnabled && body.vatRate != null && !validateVatRate(body.vatRate).isZero()) return invalid('VAT_NOT_ENABLED');
  const amounts = calculateRequestAmounts(body.unitPrice, body.quantity, body.currency, rate);
  if ((process || edit?.record) && !amounts.quantity.isInteger()) return invalid('PROCESS_QUANTITY_MUST_BE_INTEGER');
  let outsourcedWorkRecordId: number | null = edit?.record?.id ?? null;
  if (process || edit?.record) {
    if (amounts.quantity.gt(2147483647)) return invalid('INVALID_PROCESS_QUANTITY');
    await tx.$queryRaw`SELECT id FROM "WorkOrder" WHERE id=${workOrderId} AND "orgId"=${orgId} FOR UPDATE`;
    const order = await tx.workOrder.findFirst({ where: { id: workOrderId, orgId } });
    if (order?.invoiceFinalLockedAt) throw createHttpError(409,'ORDER_FINALLY_LOCKED');
    if (edit?.record) {
      const original = edit.record;
      await tx.$queryRaw`SELECT id FROM "AssignmentPlan" WHERE id=${original.assignmentPlanId} AND "orgId"=${orgId} FOR UPDATE`;
      const plan = await tx.assignmentPlan.findFirst({ where: { id: original.assignmentPlanId, orgId } });
      if (!plan || plan.styleId !== styleId || plan.workOrderId !== workOrderId) return invalid('INVALID_REQUEST_REFERENCE');
      const changed = original.outsourcingPartnerId !== partnerOrgId || original.quantity !== amounts.quantity.toNumber() || !new Prisma.Decimal(original.outsourceUnitPrice).equals(amounts.unitPrice);
      if (changed) {
        if (plan.isCompleted || plan.ctReviewRequired) throw createHttpError(409,'PRODUCTION_COMPLETED_OR_REVIEW_REQUIRED');
        const period = await loadManagementPeriod(tx,orgId,plan.factoryId);
        assertManagedDate(original.workLog.coverageStartDate || original.workLog.displayDate,period.startDate);
        const months = [...new Set([original.workLog.displayDate.slice(0,7), ...[plan.closedAt,plan.productionCompletedAt,plan.completedAt].filter(Boolean).map(date => new Intl.DateTimeFormat('sv-SE',{timeZone:env.BUSINESS_TIME_ZONE || 'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date(date)))])];
        const locked = await tx.payrollSnapshot.findFirst({ where: { orgId, factoryId: plan.factoryId, month: { in: months }, isProvisional: false }, select: { id: true } });
        if (locked) throw createHttpError(409,'PAYROLL_LOCKED');
        await tx.outsourcedWorkRecord.update({ where: { id: original.id }, data: { outsourcingPartnerId: partnerOrgId, outsourceVendorName: partner.name,
          quantity: amounts.quantity.toNumber(), outsourceUnitPrice: amounts.unitPrice, updatedByEmployeeId: actorId } });
      }
    } else {
    const plans = await tx.assignmentPlan.findMany({ where: { orgId, workOrderId, styleId, ...(assignmentPlanId ? { id: assignmentPlanId } : {}) } });
    const eligible = plans.filter((plan: any) => !plan.isCompleted && !plan.ctReviewRequired && hasValidAssignmentProcessRefs(plan, false) && snapshotProcessIds(plan.assignmentCtSnapshot)?.includes(styleProcessId!));
    if (eligible.length !== 1) throw createHttpError(409, eligible.length ? 'SELECT_ASSIGNMENT_PLAN' : 'ELIGIBLE_ASSIGNMENT_REQUIRED');
    const plan = eligible[0];
    const factoryPeriod = await loadManagementPeriod(tx,orgId,plan.factoryId);
    assertManagedDate(transactionDate,factoryPeriod.startDate);
    await tx.$queryRaw`SELECT id FROM "AssignmentPlan" WHERE id=${plan.id} AND "orgId"=${orgId} FOR UPDATE`;
    const vendor = await tx.organization.findUnique({ where: { id: partnerOrgId }, select: { name: true } });
    const record = { orgId, outsourcingPartnerId: partnerOrgId, outsourceVendorName: vendor.name, outsourceUnitPrice: amounts.unitPrice, styleId, styleProcessId, assignmentPlanId: plan.id, quantity: amounts.quantity.toNumber(), createdByEmployeeId: actorId };
    const note = appendQuantityRemark ? await appendQuantityRemark({ db: tx, orgId, records: [record], note: description }) : description;
    const log = await tx.workLog.create({ data: { orgId, displayDate: transactionDate, coverageStartDate: transactionDate, coverageEndDate: transactionDate, entryMode: 'DAILY', recordKind: 'OUTSOURCING', factoryId: plan.factoryId, workerCount: 1, itemCount: 1, note, createdByEmployeeId: actorId } });
    outsourcedWorkRecordId = (await tx.outsourcedWorkRecord.create({ data: { ...record, workLogId: log.id } })).id;
    }
  } else if (assignmentPlanId) return invalid('UNEXPECTED_ASSIGNMENT_PLAN');
  // Production is recorded only in the vendor table, never employee work or AT.
  const data = { linkTarget:code.linkTarget,linkPolicyAuditId:code.linkPolicyAuditId,partnerOrgId, serviceTypeId: service.id, transactionCodeId, workOrderId, styleId, styleProcessId, outsourcedWorkRecordId, transactionDate, description, currency: body.currency, details, ...amounts,
    ...(edit?.request ? {expenseRequestId:edit.request.id,expenseRequestLine:edit.request.line} : {}) };
  const previousIds=storedExpenseProcessIds(edit?.cost);
  const replaceLinks=JSON.stringify(previousIds)!==JSON.stringify(processIds);
  if(replaceLinks&&previousIds.length)await tx.expenseCostProcess.deleteMany({where:{costId:edit!.cost.id,orgId}});
  const unitData=body.unitId!==undefined||edit?.cost?.unitId!=null?{unitId:metadata.unitId}:{};
  const saved = edit?.cost ? await tx.partnerTransactionCost.update({ where: { id: edit.cost.id }, data:{...data,...unitData}, include: REQUEST_INCLUDE }) :
    await tx.partnerTransactionCost.create({ data: { ...data,...unitData, orgId, clientKey: body.clientKey, createdByEmployeeId: actorId }, include: REQUEST_INCLUDE });
  if(replaceLinks&&processIds.length)await tx.expenseCostProcess.createMany({data:processIds.map(styleProcessId=>({costId:saved.id,orgId,styleId:styleId!,styleProcessId}))});
  await saveExpenseReferences(tx,saved,metadata);
  return replaceLinks || metadata.supplied ? tx.partnerTransactionCost.findUnique({where:{id:saved.id},include:REQUEST_INCLUDE}) : saved;
}
