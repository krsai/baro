import { orderAssignmentPlans } from './orderAssignments';
import { invoiceOrderProgress } from './invoiceOrderProgress';
import { loadInvoiceBillingCoverage, billingCoversProduction } from './invoiceWorkflow';
export { orderAssignmentPlans } from './orderAssignments';

export type OrderWorkflowStatus = 'RECEIVED' | 'PRODUCTION' | 'BILLING' | 'COLLECTION' | 'COMPLETED';

// A production percentage is never evidence of an approved completion.
export function orderWorkflowStatus(order: any, plans: any[], production?: { isCompleted: boolean; assignments?: Array<{ completed: boolean }> }): OrderWorkflowStatus {
  const related = orderAssignmentPlans(order.id, plans);
  const prior = (order.priorCompletions || []).filter((entry: any) => !entry.canceledAt);
  const history = prior.length > 0 || related.some(plan => plan._count?.workRecords > 0 || plan._count?.outsourcedWorkRecords > 0 || plan.isCompleted);
  const required = new Map<number, number>();
  for (const item of order.workOrderItems || []) {
    const quantity = Math.max(0, Number(item.totalQuantity) || 0);
    if (quantity > 0) required.set(item.styleId, (required.get(item.styleId) || 0) + quantity);
  }
  const allocated = new Map<number, number>();
  for (const plan of related) allocated.set(plan.styleId, (allocated.get(plan.styleId) || 0) + Math.max(0, Number(plan.assignmentQuantity) || 0));
  const covered = required.size > 0 && [...required].every(([styleId, quantity]) => (allocated.get(styleId) || 0) >= quantity);
  const hasCompletionEvidence = related.length > 0;
  // Use the same completion evidence as the assignment board/report, never a
  // rounded percentage or just the legacy manual-completion flag. Retain the
  // allocation-coverage and reopened-plan guards even with historical credit.
  if (production !== undefined) {
    if (covered && hasCompletionEvidence && production.isCompleted &&
      production.assignments?.length === related.length && production.assignments.every(row => row.completed)) return order.isFullyInvoiced === true ? 'COLLECTION' : 'BILLING';
    return history ? 'PRODUCTION' : 'RECEIVED';
  }
  if (covered && hasCompletionEvidence && related.every(plan => plan.isCompleted === true)) return order.isFullyInvoiced === true ? 'COLLECTION' : 'BILLING';
  return history ? 'PRODUCTION' : 'RECEIVED';
}

export async function loadOrderWorkflowStatuses(db: any, orders: any[], loadProgress?: (orgId: number, ids: string[]) => Promise<any[]>): Promise<Map<number, OrderWorkflowStatus>> {
  if (!orders.length) return new Map();
  const billing = await loadInvoiceBillingCoverage(db, orders);
  orders = orders.map(order => ({ ...order, isFullyInvoiced: billing.get(order.id)?.complete === true }));
  const ids = orders.map(order => order.id);
  const plans = await db.assignmentPlan.findMany({ where: { OR: [
    { workOrderId: { in: ids } }, { assignmentCard: { is: { workOrderId: { in: ids } } } },
  ] }, select: { orgId: true, externalId: true, workOrderId: true, styleId: true, assignmentQuantity: true, isCompleted: true,
    assignmentCard: { select: { workOrderId: true } },
    _count: { select: { workRecords: true, outsourcedWorkRecords: true } },
  } });
  if (!loadProgress) return new Map(orders.map(order => [order.id, orderWorkflowStatus(order, plans)]));
  const orgIds = [...new Set<number>(plans.map((plan: any) => plan.orgId))];
  const progressByOrg = new Map(await Promise.all(orgIds.map(async orgId => [orgId,
    await loadProgress(orgId, plans.filter((plan: any) => plan.orgId === orgId).map((plan: any) => plan.externalId)),
  ] as const)));
  return new Map(orders.map(order => {
    const related = orderAssignmentPlans(order.id, plans);
    // IDs are organization-scoped. Do not mix equal external IDs from other orgs.
    const progress = related.flatMap(plan => (progressByOrg.get(plan.orgId) ?? [])
      .filter(row => row.id === plan.externalId)
      .map(row => ({ ...row, id: `${plan.orgId}:${row.id}` })));
    const scopedPlans = related.map(plan => ({ ...plan, externalId: `${plan.orgId}:${plan.externalId}` }));
    const production = invoiceOrderProgress(order, scopedPlans, progress);
    return [order.id, orderWorkflowStatus({ ...order, isFullyInvoiced: billingCoversProduction(billing.get(order.id), production) }, plans, production)];
  }));
}
