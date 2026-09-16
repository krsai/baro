// Compact, read-only projection of the existing assignment progress calculation.
export function invoiceOrderProgress(order: any, plans: any[], progress: any[]) {
  const byId = new Map(progress.map(row => [row.id, row]));
  const assignments = plans.filter(plan => plan.workOrderId === order.id).map(plan => {
    const row = byId.get(plan.externalId);
    const known = row && !row.isProgressUnknown && !row.hasInvalidProcessReferences;
    return { id: plan.externalId, style: row?.label || plan.style?.name || '',
      factory: row?.factoryName || '', plannedQuantity: row?.plannedQuantity ?? null,
      producedQuantity: known ? row.producedQuantity : null,
      progressPercent: known ? row.displayProgressPercent ?? row.progressPercent ?? null : null };
  });
  const known = assignments.length > 0 && assignments.every(row => row.producedQuantity != null);
  const producedQuantity = known ? assignments.reduce((sum, row) => sum + row.producedQuantity, 0) : null;
  return { orderId: order.orderId, orderNumber: order.orderNumber, dueDate: order.dueDate,
    totalQuantity: order.totalQuantity, assignments, producedQuantity,
    // Order progress includes unassigned quantity in its denominator. It is not
    // an average of assignment percentages or a declaration of completion.
    progressPercent: producedQuantity != null && order.totalQuantity > 0
      ? Math.min(100, producedQuantity / order.totalQuantity * 100) : null };
}
