import { requirePayeeBankAccount } from './entityBankAccount';
import {allocateDocumentNumber,normalizeDocumentNumber} from './documentNumber';
import { resolveExpenseApproval, replaceExpenseApprovers } from './expenseApproval';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createHttpError } from '../utils/http';
import { validateCostDate } from './partnerTransactionCost';
import { loadManagementPeriod, assertManagedDate } from '../factories/factoryManagementStart';
import { registerTransactionRequest, REQUEST_INCLUDE } from './transactionRequest';
import { loadExpenseEditorSource } from './expenseRequestEditor';
import { env } from 'node:process';

export const EXPENSE_REQUEST_INCLUDE = {
  partner: { select: { id: true, name: true } },
  createdByEmployee: { select: { id: true, name: true } },
  items: { include: REQUEST_INCLUDE, orderBy: { expenseRequestLine: 'asc' as const } },
} as const;

// Canonicalize property order only. The hash protects retries, never identifies relationships.
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function expenseRequestTotals(items: any[]) {
  const currencies = [...new Set(items.map(item => item.currency))].sort();
  const currencyTotals = currencies.map(currency => {
    const rows = items.filter(item => item.currency === currency);
    const sum = (field: string) => rows.reduce((total, item) => total.add(item[field] ?? 0), new Prisma.Decimal(0)).toString();
    return { currency, subtotal: sum('subtotal'), vatAmount: sum('vatAmount'), amount: sum('amount') };
  });
  const single = currencyTotals.length === 1 ? currencyTotals[0] : undefined;
  return { currencyTotals, currency: single?.currency ?? null,
    subtotal: single?.subtotal ?? null, vatAmount: single?.vatAmount ?? null, amount: single?.amount ?? null };
}

export async function registerExpenseRequest(tx: any, orgId: number, actorId: number, body: any, appendQuantityRemark?: (args: any) => Promise<string | null>) {
  const fail = (message: string): never => { throw createHttpError(400, message); };
  const requestDate = validateCostDate(body?.requestDate);
  const period = await loadManagementPeriod(tx, orgId);
  assertManagedDate(requestDate, period.startDate);
  const remark = typeof body?.remark === 'string' ? body.remark.trim() : '';
  if (remark.length > 500 || /[\r\n]/.test(remark)) fail('INVALID_EXPENSE_REMARK');
  if (!Number.isSafeInteger(body?.partnerOrgId) || body.partnerOrgId <= 0) fail('INVALID_EXPENSE_REQUEST_HEADER');
  if (typeof body?.clientKey !== 'string' || !/^[\w-]{8,64}$/.test(body.clientKey)) fail('INVALID_TRANSACTION_KEY');
  if (!Array.isArray(body?.items) || !body.items.length || body.items.length > 50) fail('EXPENSE_REQUEST_ITEMS_REQUIRED');
  const items = body.items.map((item: any, index: number) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('INVALID_EXPENSE_REQUEST_ITEM');
    // The payee is shared; each line owns its currency. Legacy clients may supply a header fallback.
    const currency = item.currency ?? body.currency;
    if (!['VND','USD','KRW'].includes(currency)) fail('INVALID_CURRENCY');
    if (item.partnerOrgId != null && item.partnerOrgId !== body.partnerOrgId) fail('EXPENSE_REQUEST_HEADER_MISMATCH');
    if (item.transactionDate != null && item.transactionDate !== requestDate) fail('EXPENSE_REQUEST_DATE_MISMATCH');
    return { transactionDate: requestDate, transactionCodeId: item.transactionCodeId,
      unitPrice: item.unitPrice, quantity: item.quantity, vatRate: item.vatRate,
      workOrderId: item.workOrderId ?? null, styleId: item.styleId ?? null, styleProcessId: item.styleProcessId ?? null,
      assignmentPlanId: item.assignmentPlanId ?? null, details: item.details,
      partnerOrgId: body.partnerOrgId, currency, clientKey: `${body.clientKey}-${index + 1}` };
  });
  const previous = await tx.expenseRequest.findUnique({ where: { orgId_clientKey: { orgId, clientKey: body.clientKey } }, include: { ...EXPENSE_REQUEST_INCLUDE, approvalSteps:{orderBy:{position:'asc'}} } });
  const approval=previous ? {ids:(previous.approvalSteps || []).map((step:any)=>step.employeeId),policy:null} : await resolveExpenseApproval(tx,orgId,actorId,items,body.approvalSelection);
  const approverEmployeeIds=approval.ids;
  const requestedNumber=normalizeDocumentNumber(body.managementNumber);
  const submissionHash = createHash('sha256').update(JSON.stringify(canonical({ requestDate, remark, approverEmployeeIds, items,...(body.approvalSelection===undefined?{}:{approvalSelection:body.approvalSelection}),...(body.managementNumber===undefined?{}:{managementNumber:requestedNumber}) }))).digest('hex');
  if (previous) {
    if (previous.createdByEmployeeId !== actorId || previous.submissionHash !== submissionHash) throw createHttpError(409, 'EXPENSE_REQUEST_RETRY_MISMATCH');
    return { ...previous, ...expenseRequestTotals(previous.items) };
  }
  await requirePayeeBankAccount(tx,orgId,body.partnerOrgId);
  const auditKey = `EXPENSE_REQUEST_CREATE:${orgId}:${body.clientKey}`;
  await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(orgId)},true),set_config('baro.expense_editor_actor',${String(actorId)},true),set_config('baro.expense_editor_key',${auditKey},true),set_config('baro.expense_editor_timezone',${env.BUSINESS_TIME_ZONE || 'Asia/Seoul'},true)`;
  const managementNumber=await allocateDocumentNumber(tx,orgId,'EXP',requestDate,requestedNumber);
  const document = await tx.expenseRequest.create({ data: { orgId, managementNumber, partnerOrgId: body.partnerOrgId, createdByEmployeeId: actorId, updatedByEmployeeId: actorId, updatedAt: new Date(),
    requestDate, remark, currency: items.every((item: any) => item.currency === items[0].currency) ? items[0].currency : null, clientKey: body.clientKey, submissionHash } });
  await replaceExpenseApprovers(tx,orgId,document.id,approverEmployeeIds);
  // Caller owns the Serializable transaction: every cost and production write rolls back together.
  for (const [index, item] of items.entries()) {
    try {
      await registerTransactionRequest(tx, orgId, actorId, item, appendQuantityRemark, true, {request:{id:document.id,line:index+1}});
    } catch(error: any) {
      error.expenseLine=index+1;
      error.message=`EXPENSE_LINE:${index+1}:${error.message}`;
      throw error;
    }
  }
  const saved = await tx.expenseRequest.findUnique({ where: { id: document.id }, include: EXPENSE_REQUEST_INCLUDE });
  const after = await loadExpenseEditorSource(tx,orgId,'request',String(document.id));
  await tx.expenseRequestAudit.create({ data: { orgId,requestId:document.id,actorId,version:document.version,action:'CREATE',
    clientKey:auditKey,inputHash:submissionHash,beforeSnapshot:{costs:[],record:null},afterSnapshot:JSON.parse(JSON.stringify({...after,approvalPolicy:approval.policy})) } });
  return { ...saved, ...expenseRequestTotals(saved.items) };
}
