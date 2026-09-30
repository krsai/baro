import { createHttpError } from '../utils/http';

// Keep a factual before/after audit, not a redistribution of completed production.
export async function recordOrderQuantityReduction(tx: any, order: any, items: any[], rawReason: unknown,
  actor: string, production: (plans: any[]) => Array<any>) {
  const before = await tx.workOrderItem.findMany({ where: { workOrderId: order.id },
    select: { itemId: true, styleId: true, totalQuantity: true } });
  const next = new Map(items.map(item => [String(item.id), item]));
  const reductions = before.filter((item: any) => Number(next.get(item.itemId)?.totalQuantity || 0) < item.totalQuantity);
  if (!reductions.length) return null;
  const reason = String(rawReason || '').trim();
  if (!reason || reason.length > 1000) throw createHttpError(409, 'ORDER_REDUCTION_REASON_REQUIRED');
  const plans = await tx.assignmentPlan.findMany({ where: { workOrderId: order.id },
    include: { workRecords: { select: { styleProcessId: true, quantity: true } },
      outsourcedWorkRecords: { select: { styleProcessId: true, quantity: true } } } });
  const facts = production(plans);
  const groups = new Map<string, any>();
  for (const fact of facts) {
    const key = `${fact.orgId}:${fact.styleId}`;
    const row = groups.get(key) || { orgId: fact.orgId, styleId: fact.styleId, producedQuantity: 0,
      assignedQuantity: 0, orderedQuantity: items.filter(item => Number(item.styleId) === fact.styleId)
        .reduce((sum, item) => sum + Number(item.totalQuantity), 0) };
    row.assignedQuantity += fact.assignedQuantity || 0;
    row.producedQuantity = row.producedQuantity === null || fact.producedQuantity === null ? null : row.producedQuantity + fact.producedQuantity;
    row.excessQuantity = row.producedQuantity === null ? null : Math.max(0, row.producedQuantity - row.orderedQuantity);
    groups.set(key, row);
  }
  const snapshot = { version: 1, sourceOrderId: order.orderId, sourceOrderNumber: order.orderNumber, before, after: items.map(item => ({ itemId: String(item.id),
    styleId: item.styleId, totalQuantity: item.totalQuantity })), production: [...groups.values()], assignments: facts,
    disposition: 'PRESERVE_AND_REVIEW', sourceUpdatedAt: order.updatedAt.toISOString() };
  return tx.orderQuantityChange.create({ data: { workOrderId: order.id, reason, actor, snapshot } });
}
