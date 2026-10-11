import { Prisma } from '@prisma/client';
import { createHttpError } from '../utils/http';
import { validateCostDate, COST_DETAIL_FIELDS } from './partnerTransactionCost';
import { snapshotProcessIds, hasValidAssignmentProcessRefs } from '../utils/assignmentSnapshotIntegrity';

export const REQUEST_INCLUDE = { outsourcedWorkRecord: { select: { id: true, assignmentPlanId: true, workLogId: true } }, partner: { select: { id: true, name: true } }, serviceType: true, transactionCode: true, workOrder: { select: { id: true, orderNumber: true } }, style: { select: { id: true, name: true, code: true } }, styleProcess: { select: { id: true, processName: true, processCode: true } }, createdByEmployee: { select: { id: true, name: true } } } as const;
const invalid = (code: string): never => { throw createHttpError(400, code); };
export const appSettingsKey = (orgId: number) => `APP_SETTINGS:${orgId}`;
export function validateVatRate(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d{1,3}(\.\d{1,2})?$/.test(String(value))) return invalid('INVALID_VAT_RATE');
  const rate = new Prisma.Decimal(value);
  if (rate.gt(100)) return invalid('INVALID_VAT_RATE');
  return rate;
}
export async function loadAppSettings(db: any, orgId: number) {
  const row = await db.systemSetting.findUnique({ where: { key: appSettingsKey(orgId) } });
  return { defaultVatRate: row?.value?.defaultVatRate ?? '10' };
}
export function validateTransactionCode(body: any) {
  if (!Number.isSafeInteger(body?.serviceTypeId) || body.serviceTypeId <= 0) return invalid('INVALID_SERVICE_TYPE');
  const text = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(text('code')) || ['nameKo','nameEn','nameVi'].some(key => !text(key) || text(key).length > 100) || typeof body.vatEnabled !== 'boolean') return invalid('INVALID_TRANSACTION_CODE');
  return { serviceTypeId: body.serviceTypeId, code: text('code'), nameKo: text('nameKo'), nameEn: text('nameEn'), nameVi: text('nameVi'), vatEnabled: body.vatEnabled, isActive: body.isActive !== false };
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
export async function registerTransactionRequest(tx: any, orgId: number, actorId: number, body: any, appendQuantityRemark?: (args: any) => Promise<string | null>) {
  const id = (value: unknown, optional = false): number | null => optional && (value == null || value === '') ? null : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid('INVALID_REQUEST_REFERENCE');
  const partnerOrgId = id(body?.partnerOrgId)!, transactionCodeId = id(body?.transactionCodeId)!;
  const workOrderId = id(body?.workOrderId, true), styleId = id(body?.styleId, true), styleProcessId = id(body?.styleProcessId, true);
  const assignmentPlanId = id(body?.assignmentPlanId, true);
  const transactionDate = validateCostDate(body?.transactionDate);
  if (typeof body?.clientKey !== 'string' || !/^[\w-]{8,100}$/.test(body.clientKey)) return invalid('INVALID_TRANSACTION_KEY');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description || description.length > 2000) return invalid('TRANSACTION_DESCRIPTION_REQUIRED');
  const details: Record<string,string> = {};
  if (!body.details || typeof body.details !== 'object' || Array.isArray(body.details)) return invalid('INVALID_TRANSACTION_DETAILS');
  for (const [key,value] of Object.entries(body.details)) {
    if (!COST_DETAIL_FIELDS.includes(key as any) || typeof value !== 'string' || value.length > 500) return invalid('INVALID_TRANSACTION_DETAILS');
    details[key] = value.trim();
  }
  if (details.transportDate) validateCostDate(details.transportDate);
  const previous = await tx.partnerTransactionCost.findUnique({ where: { orgId_clientKey: { orgId, clientKey: body.clientKey } }, include: REQUEST_INCLUDE });
  if (previous) {
    const amounts = calculateRequestAmounts(body.unitPrice, body.quantity, body.currency, body.vatRate ?? previous.vatRate.toString());
    if (previous.transactionCodeId !== transactionCodeId || previous.partnerOrgId !== partnerOrgId || previous.workOrderId !== workOrderId || previous.styleId !== styleId || previous.styleProcessId !== styleProcessId || previous.transactionDate !== transactionDate || previous.description !== description || previous.currency !== body.currency || previous.createdByEmployeeId !== actorId || !previous.unitPrice.equals(amounts.unitPrice) || !previous.quantity.equals(amounts.quantity) || !previous.vatRate.equals(amounts.vatRate) || COST_DETAIL_FIELDS.some(key => (previous.details?.[key] || '') !== (details[key] || ''))) throw createHttpError(409,'TRANSACTION_RETRY_MISMATCH');
    if (assignmentPlanId && previous.outsourcedWorkRecord?.assignmentPlanId !== assignmentPlanId) throw createHttpError(409,'TRANSACTION_RETRY_MISMATCH');
    return previous;
  }
  const code = await tx.transactionCode.findFirst({ where: { id: transactionCodeId, ownerOrgId: orgId, isActive: true, serviceType: { isActive: true } }, include: { serviceType: true } });
  if (!code) return invalid('INVALID_TRANSACTION_CODE');
  const service = code.serviceType;
  const partner = await tx.organizationOutsourcingServiceType.findFirst({ where: { ownerOrgId: orgId, partnerOrgId, serviceTypeId: service.id, partner: { isActive: true, type: 'PROCESS_OUTSOURCING' } } });
  if (!partner) return invalid('INVALID_PARTNER_SERVICE');
  const process = service.entryMode === 'PROCESS';
  if (process && body.currency !== 'VND') return invalid('PROCESS_CURRENCY_MUST_BE_VND');
  const selections = { order: workOrderId, style: styleId, process: styleProcessId };
  for (const key of ['order','style','process'] as const) {
    const option = process ? 'REQUIRED' : service[`${key}Input`];
    if (option === 'REQUIRED' && !selections[key]) return invalid(`REQUIRED_REQUEST_${key.toUpperCase()}`);
    if (option === 'HIDDEN' && selections[key]) return invalid(`UNEXPECTED_REQUEST_${key.toUpperCase()}`);
  }
  if (styleId && !workOrderId || styleProcessId && !styleId) return invalid('INVALID_REQUEST_REFERENCE');
  if (workOrderId && !await tx.workOrder.findFirst({ where: { id: workOrderId, orgId }, select: { id: true } })) return invalid('INVALID_TRANSACTION_ORDER');
  if (styleId && !await tx.workOrderItem.findFirst({ where: { workOrderId, styleId, workOrder: { orgId }, style: { orgId } }, select: { id: true } })) return invalid('INVALID_REQUEST_STYLE');
  if (styleProcessId && !await tx.styleProcess.findFirst({ where: { id: styleProcessId, styleId, orgId, isActive: true }, select: { id: true } })) return invalid('INVALID_REQUEST_PROCESS');
  for (const field of service.requiredFields) if (!details[field]) return invalid(`REQUIRED_TRANSACTION_FIELD:${field}`);
  const settings = await loadAppSettings(tx, orgId);
  const rate = code.vatEnabled ? body.vatRate ?? settings.defaultVatRate : '0';
  if (!code.vatEnabled && body.vatRate != null && !validateVatRate(body.vatRate).isZero()) return invalid('VAT_NOT_ENABLED');
  const amounts = calculateRequestAmounts(body.unitPrice, body.quantity, body.currency, rate);
  if (process && !amounts.quantity.isInteger()) return invalid('PROCESS_QUANTITY_MUST_BE_INTEGER');
  let outsourcedWorkRecordId: number | null = null;
  if (process) {
    if (amounts.quantity.gt(2147483647)) return invalid('INVALID_PROCESS_QUANTITY');
    await tx.$queryRaw`SELECT id FROM "WorkOrder" WHERE id=${workOrderId} AND "orgId"=${orgId} FOR UPDATE`;
    const order = await tx.workOrder.findFirst({ where: { id: workOrderId, orgId } });
    if (order?.invoiceFinalLockedAt) throw createHttpError(409,'ORDER_FINALLY_LOCKED');
    const plans = await tx.assignmentPlan.findMany({ where: { orgId, workOrderId, styleId, ...(assignmentPlanId ? { id: assignmentPlanId } : {}) } });
    const eligible = plans.filter((plan: any) => !plan.isCompleted && !plan.ctReviewRequired && hasValidAssignmentProcessRefs(plan, false) && snapshotProcessIds(plan.assignmentCtSnapshot)?.includes(styleProcessId!));
    if (eligible.length !== 1) throw createHttpError(409, eligible.length ? 'SELECT_ASSIGNMENT_PLAN' : 'ELIGIBLE_ASSIGNMENT_REQUIRED');
    const plan = eligible[0];
    await tx.$queryRaw`SELECT id FROM "AssignmentPlan" WHERE id=${plan.id} AND "orgId"=${orgId} FOR UPDATE`;
    const vendor = await tx.organization.findUnique({ where: { id: partnerOrgId }, select: { name: true } });
    const record = { orgId, outsourcingPartnerId: partnerOrgId, outsourceVendorName: vendor.name, outsourceUnitPrice: amounts.unitPrice, styleId, styleProcessId, assignmentPlanId: plan.id, quantity: amounts.quantity.toNumber(), createdByEmployeeId: actorId };
    const note = appendQuantityRemark ? await appendQuantityRemark({ db: tx, orgId, records: [record], note: description }) : description;
    const log = await tx.workLog.create({ data: { orgId, displayDate: transactionDate, coverageStartDate: transactionDate, coverageEndDate: transactionDate, entryMode: 'DAILY', recordKind: 'OUTSOURCING', factoryId: plan.factoryId, workerCount: 1, itemCount: 1, note, createdByEmployeeId: actorId } });
    outsourcedWorkRecordId = (await tx.outsourcedWorkRecord.create({ data: { ...record, workLogId: log.id } })).id;
  } else if (assignmentPlanId) return invalid('UNEXPECTED_ASSIGNMENT_PLAN');
  // Production is recorded only in the vendor table, never employee work or AT.
  return tx.partnerTransactionCost.create({ data: { orgId, partnerOrgId, serviceTypeId: service.id, transactionCodeId, workOrderId, styleId, styleProcessId, outsourcedWorkRecordId, transactionDate, description, currency: body.currency, details, clientKey: body.clientKey, createdByEmployeeId: actorId, ...amounts }, include: REQUEST_INCLUDE });
}
