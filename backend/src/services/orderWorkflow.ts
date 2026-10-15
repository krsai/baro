export type OrderWorkflowStatus = 'RECEIVED' | 'PRODUCTION' | 'BILLING' | 'COMPLETED';

// A production percentage is never evidence of an approved completion.
export function orderWorkflowStatus(order: any, plans: any[]): OrderWorkflowStatus {
  const related = plans.filter(plan => plan.workOrderId === order.id || plan.assignmentCard?.workOrderId === order.id);
  const prior = (order.priorCompletions || []).filter((entry: any) => !entry.canceledAt);
  const history = prior.length > 0 || related.some(plan => plan._count?.workRecords > 0 || plan._count?.outsourcedWorkRecords > 0 || plan.isCompleted);
  const required = new Map<number, number>();
  for (const item of order.workOrderItems || []) required.set(item.styleId, (required.get(item.styleId) || 0) + item.totalQuantity);
  const allocated = new Map<number, number>();
  for (const plan of related) allocated.set(plan.styleId, (allocated.get(plan.styleId) || 0) + Math.max(0, Number(plan.assignmentQuantity) || 0));
  const covered = required.size > 0 && [...required].every(([styleId, quantity]) => (allocated.get(styleId) || 0) >= quantity);
  const hasCompletionEvidence = related.length > 0;
  if (covered && hasCompletionEvidence && related.every(plan => plan.isCompleted === true)) return 'BILLING';
  return history ? 'PRODUCTION' : 'RECEIVED';
}

export async function loadOrderWorkflowStatuses(db: any, orders: any[]): Promise<Map<number, OrderWorkflowStatus>> {
  if (!orders.length) return new Map();
  const ids = orders.map(order => order.id);
  const plans = await db.assignmentPlan.findMany({ where: { OR: [
    { workOrderId: { in: ids } }, { assignmentCard: { is: { workOrderId: { in: ids } } } },
  ] }, select: { workOrderId: true, styleId: true, assignmentQuantity: true, isCompleted: true,
    assignmentCard: { select: { workOrderId: true } },
    _count: { select: { workRecords: true, outsourcedWorkRecords: true } },
  } });
  return new Map(orders.map(order => [order.id, orderWorkflowStatus(order, plans)]));
}
