import { Prisma } from '@prisma/client';
import { createHttpError } from '../utils/http';

export const priorCompletionInclude = {
  reason: true, createdByEmployee: { select: { id: true, name: true, employeeNo: true } },
  canceledByEmployee: { select: { id: true, name: true, employeeNo: true } },
} as const;

export function validatePriorPeriod(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(value) || Number(value.slice(0, 4)) < 1) throw createHttpError(400, 'INVALID_COMPLETION_PERIOD');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (value.length === 10 && (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)) throw createHttpError(400, 'INVALID_COMPLETION_PERIOD');
  if (value > new Date().toISOString().slice(0, value.length)) throw createHttpError(400, 'FUTURE_COMPLETION_PERIOD');
  return value;
}

// Ledger completion is independent of process observations and never creates
// worker records, payroll, AT samples or an invented daily completion date.
export function summarizePriorProduction(ordered: number, progress: any[], prior: any[]) {
  const entries = prior.filter(row => !row.canceledAt);
  const priorQuantity = entries.reduce((sum, row) => sum + row.quantity, 0);
  let unallocated = priorQuantity;
  let produced = priorQuantity, completedWork = 0, planned = 0;
  let allComplete = true;
  for (const row of progress) {
    const quantity = Math.max(0, Number(row.plannedQuantity) || 0);
    const credit = Math.min(unallocated, quantity);
    unallocated -= credit;
    const recorded = Math.max(0, Number(row.producedQuantity) || 0);
    const recognized = row.isCompleted ? Math.max(recorded, Math.max(0, Number(row.completionTargetQuantity ?? quantity) - credit)) : recorded;
    produced += recognized;
    const ratio = row.isCompleted ? 1 : row.isProgressUnknown ? 0 : Math.max(0, Math.min(1, Number(row.operationalProgressRatio ?? Number(row.displayProgressPercent || 0) / 100) || 0));
    completedWork += Math.min(quantity, ratio * quantity + credit);
    planned += quantity;
    allComplete &&= row.isCompleted || (ratio * quantity + credit >= quantity && recognized + credit >= quantity);
  }
  completedWork += unallocated;
  const isCompleted = ordered > 0 && produced >= ordered && (priorQuantity >= ordered || (allComplete && planned + unallocated >= ordered));
  const progressPercent = isCompleted ? 100 : Math.min(99, Math.round(100 * completedWork / Math.max(1, ordered, planned)));
  return { priorQuantity, producedQuantity: produced, progressPercent, isCompleted };
}

export async function registerPriorCompletion(db: any, orgId: number, employeeId: number, input: any) {
  const { workOrderId, styleId, quantity, reasonId, clientKey } = input || {};
  if (![workOrderId, styleId, quantity, reasonId].every(v => Number.isSafeInteger(v) && v > 0 && v <= 2147483647) || typeof clientKey !== 'string' || clientKey.length < 8 || clientKey.length > 100) throw createHttpError(400, 'INVALID_PRIOR_COMPLETION');
  const completedPeriod = validatePriorPeriod(input.completedPeriod);
  if (input.acknowledgeSeparateRecords !== true) throw createHttpError(400, 'SEPARATE_RECORDS_CONFIRMATION_REQUIRED');
  const run = (callback: any) => db.$transaction ? db.$transaction(callback, { isolationLevel: 'Serializable' }) : callback(db);
  return run(async (tx: any) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "WorkOrder" WHERE id=${workOrderId} AND "orgId"=${orgId} FOR UPDATE`);
    const order = await tx.workOrder.findFirst({ where: { id: workOrderId, orgId }, include: { workOrderItems: true } });
    if (!order) throw createHttpError(404, 'ORDER_NOT_FOUND');
    if (order.invoiceFinalLockedAt) throw createHttpError(409, 'ORDER_FINALLY_LOCKED');
    const actor = await tx.employee.findFirst({ where: { id: employeeId, orgId, status: 'ACTIVE', orgRole: { in: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'] } } });
    if (!actor) throw createHttpError(403, 'ACTIVE_EMPLOYEE_REQUIRED');
    const existing = await tx.priorProductionCompletion.findUnique({ where: { orgId_clientKey: { orgId, clientKey } } });
    if (existing) {
      if (existing.workOrderId !== workOrderId || existing.styleId !== styleId || existing.quantity !== quantity || existing.reasonId !== reasonId || existing.completedPeriod !== completedPeriod || existing.createdByEmployeeId !== employeeId) throw createHttpError(409, 'PRIOR_RETRY_MISMATCH');
      return existing;
    }
    const reason = await tx.priorCompletionReason.findFirst({ where: { id: reasonId, isActive: true } });
    if (!reason) throw createHttpError(400, 'INVALID_COMPLETION_REASON');
    const ordered = order.workOrderItems.filter((item: any) => item.styleId === styleId).reduce((s: number, item: any) => s + item.totalQuantity, 0);
    if (ordered <= 0) throw createHttpError(409, 'STYLE_NOT_IN_ORDER');
    const prior = await tx.priorProductionCompletion.aggregate({ where: { workOrderId, styleId, canceledAt: null }, _sum: { quantity: true } });
    if (quantity + (prior._sum.quantity || 0) > ordered) throw createHttpError(409, 'PRIOR_QUANTITY_EXCEEDS_ORDER');
    // Completion declarations already covering the full assignment could include
    // these garments. Require review instead of adding the same stock twice.
    const closed = await tx.assignmentPlan.count({ where: { workOrderId, styleId, isCompleted: true } });
    if (closed) throw createHttpError(409, 'EXISTING_COMPLETION_REQUIRES_REVIEW');
    await tx.workOrder.update({ where: { id: workOrderId }, data: { updatedAt: new Date(Math.max(Date.now(), new Date(order.updatedAt).getTime() + 1)), updatedByEmployeeId: employeeId } });
    return tx.priorProductionCompletion.create({ data: { orgId, workOrderId, styleId, quantity, reasonId, completedPeriod, clientKey, createdByEmployeeId: employeeId }, include: priorCompletionInclude });
  });
}

export async function cancelPriorCompletion(db: any, orgId: number, employeeId: number, id: string, note: unknown) {
  if (typeof note !== 'string' || !note.trim() || note.length > 1000) throw createHttpError(400, 'CANCELLATION_NOTE_REQUIRED');
  return db.$transaction(async (tx: any) => {
    const row = await tx.priorProductionCompletion.findFirst({ where: { id, orgId } });
    if (!row) throw createHttpError(404, 'PRIOR_COMPLETION_NOT_FOUND');
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "WorkOrder" WHERE id=${row.workOrderId} FOR UPDATE`);
    const actor = await tx.employee.findFirst({ where: { id: employeeId, orgId, status: 'ACTIVE', orgRole: { in: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'] } } });
    if (!actor) throw createHttpError(403, 'ACTIVE_EMPLOYEE_REQUIRED');
    const order = await tx.workOrder.findUnique({ where: { id: row.workOrderId } });
    if (order?.invoiceFinalLockedAt) throw createHttpError(409, 'ORDER_FINALLY_LOCKED');
    const current = await tx.priorProductionCompletion.findUnique({ where: { id } });
    if (current.canceledAt) return current;
    await tx.workOrder.update({ where: { id: row.workOrderId }, data: { updatedAt: new Date(Math.max(Date.now(), new Date(order.updatedAt).getTime() + 1)), updatedByEmployeeId: employeeId } });
    return tx.priorProductionCompletion.update({ where: { id }, data: { canceledAt: new Date(), canceledByEmployeeId: employeeId, cancellationNote: note.trim() }, include: priorCompletionInclude });
  }, { isolationLevel: 'Serializable' });
}
