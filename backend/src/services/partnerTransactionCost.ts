import { Prisma } from '@prisma/client';
import { createHttpError } from '../utils/http';

export const COST_DETAIL_FIELDS = ['transportDate', 'origin', 'destination', 'reference'] as const;
export const costInclude = { partner: { select: { id: true, name: true } }, serviceType: true, workOrder: { select: { id: true, orderNumber: true } }, createdByEmployee: { select: { id: true, name: true } } } as const;
// Project historical production records for the unified request list without
// migrating, recreating or approving the original production observations.
export function historicalOutsourcingRows(records: any[]) {
  return records.map(record => ({
    id: `work-record-${record.id}`,
    sourceKind: 'HISTORICAL_WORK_RECORD',
    outsourcedWorkRecordId: record.id,
    workLogId: record.workLogId,
    partnerOrgId: record.outsourcingPartnerId,
    partner: record.outsourcingPartner,
    serviceType: null,
    workOrderId: record.assignmentPlan?.workOrderId ?? null,
    workOrder: record.assignmentPlan?.workOrder ?? null,
    styleProcessId: record.styleProcessId,
    styleProcess: record.styleProcess,
    quantity: record.quantity,
    transactionDate: record.workLog?.displayDate || '',
    description: [record.style?.name, record.styleProcess?.processName].filter(Boolean).join(' · '),
    amount: new Prisma.Decimal(record.outsourceUnitPrice).mul(record.quantity).toString(),
    currency: 'VND',
    details: {},
    createdByEmployee: record.createdByEmployee,
    createdAt: record.createdAt,
  }));
}
const fail = (message: string): never => { throw createHttpError(400, message); };
export function validateCostDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return fail('INVALID_TRANSACTION_DATE');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return fail('INVALID_TRANSACTION_DATE');
  return value;
}
export function validateServiceDefinition(body: any) {
  const entryMode = body?.entryMode;
  if (!['PROCESS', 'LOGISTICS', 'GENERAL'].includes(entryMode)) return fail('INVALID_ENTRY_MODE');
  const fields = body?.requiredFields;
  if (!Array.isArray(fields) || fields.some(field => !COST_DETAIL_FIELDS.includes(field))) return fail('INVALID_REQUIRED_FIELDS');
  const text = (key: string) => typeof body[key] === 'string' && body[key].trim().length <= 100 ? body[key].trim() : '';
  const code = text('code');
  if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(code) || !text('nameKo') || !text('nameEn') || !text('nameVi')) return fail('INVALID_SERVICE_NAME');
  return { code, nameKo: text('nameKo'), nameEn: text('nameEn'), nameVi: text('nameVi'), entryMode, requiredFields: [...new Set<string>(entryMode === 'LOGISTICS' ? [...fields, 'transportDate', 'origin', 'destination'] : fields)] };
}
export function validateCostInput(body: any) {
  const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fail('INVALID_TRANSACTION_REFERENCE');
  const partnerOrgId = id(body?.partnerOrgId), serviceTypeId = id(body?.serviceTypeId);
  const workOrderId = body?.workOrderId == null ? null : id(body.workOrderId);
  const transactionDate = validateCostDate(body?.transactionDate);
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  if (!description || description.length > 2000) return fail('TRANSACTION_DESCRIPTION_REQUIRED');
  const currency = body?.currency;
  if (!['VND', 'KRW', 'USD'].includes(currency)) return fail('INVALID_TRANSACTION_CURRENCY');
  const raw = body?.amount;
  if (typeof raw !== 'string' || !/^\d{1,16}(\.\d{1,2})?$/.test(raw)) return fail('INVALID_TRANSACTION_AMOUNT');
  const amount = new Prisma.Decimal(raw);
  if (amount.lte(0) || (currency !== 'USD' && !amount.isInteger())) return fail('INVALID_TRANSACTION_AMOUNT');
  if (typeof body?.clientKey !== 'string' || !/^[\w-]{8,100}$/.test(body.clientKey)) return fail('INVALID_TRANSACTION_KEY');
  const details: Record<string, string> = {};
  if (!body.details || typeof body.details !== 'object' || Array.isArray(body.details)) return fail('INVALID_TRANSACTION_DETAILS');
  for (const [key, value] of Object.entries(body.details)) {
    if (!COST_DETAIL_FIELDS.includes(key as any) || typeof value !== 'string' || value.length > 500) return fail('INVALID_TRANSACTION_DETAILS');
    details[key] = value.trim();
  }
  if (details.transportDate) validateCostDate(details.transportDate);
  return { partnerOrgId, serviceTypeId, workOrderId, transactionDate, description, amount, currency, clientKey: body.clientKey, details };
}
export async function registerPartnerCost(tx: any, orgId: number, actorId: number, body: any) {
  const input = validateCostInput(body);
  const existing = await tx.partnerTransactionCost.findUnique({ where: { orgId_clientKey: { orgId, clientKey: input.clientKey } }, include: costInclude });
  if (existing) {
    const sameDetails = COST_DETAIL_FIELDS.every(key => (existing.details?.[key] || '') === (input.details[key] || ''));
    if (existing.partnerOrgId !== input.partnerOrgId || existing.serviceTypeId !== input.serviceTypeId || existing.workOrderId !== input.workOrderId || existing.transactionDate !== input.transactionDate || existing.description !== input.description || existing.currency !== input.currency || !new Prisma.Decimal(existing.amount).equals(input.amount) || !sameDetails || existing.createdByEmployeeId !== actorId) throw createHttpError(409, 'TRANSACTION_RETRY_MISMATCH');
    return existing;
  }
  const assignment = await tx.organizationOutsourcingServiceType.findFirst({ where: { ownerOrgId: orgId, partnerOrgId: input.partnerOrgId, serviceTypeId: input.serviceTypeId, partner: { isActive: true, type: 'PROCESS_OUTSOURCING' }, serviceType: { isActive: true } }, include: { serviceType: true } });
  if (!assignment) return fail('INVALID_PARTNER_SERVICE');
  if (assignment.serviceType.entryMode === 'PROCESS') return fail('PROCESS_WORK_RECORD_REQUIRED');
  for (const key of assignment.serviceType.requiredFields) if (!input.details[key]) return fail(`REQUIRED_TRANSACTION_FIELD:${key}`);
  if (input.workOrderId && !await tx.workOrder.findFirst({ where: { id: input.workOrderId, orgId }, select: { id: true } })) return fail('INVALID_TRANSACTION_ORDER');
  return tx.partnerTransactionCost.create({ data: { ...input, orgId, createdByEmployeeId: actorId }, include: costInclude });
}
