// Compact, read-only projection of the existing assignment progress calculation.
export function invoiceProducedQuantity(row: any): number | null {
  const completed = Boolean(row?.isCompleted);
  const known = row && (completed || (!row.isProgressUnknown && !row.hasInvalidProcessReferences));
  if (!known) return null;
  const recordedQuantity = Math.max(0, Number(row?.producedQuantity) || 0);
  const completionQuantity = Number(row?.completionTargetQuantity);
  return completed && Number.isFinite(completionQuantity) && completionQuantity >= 0
    ? Math.max(recordedQuantity, completionQuantity)
    : recordedQuantity;
}

export function invoiceOrderProgress(order: any, plans: any[], progress: any[]) {
  const byId = new Map(progress.map(row => [row.id, row]));
  const assignments = plans.filter(plan => plan.workOrderId === order.id).map(plan => {
    const row = byId.get(plan.externalId);
    const completed = Boolean(row?.isCompleted);
    const producedQuantity = invoiceProducedQuantity(row);
    const known = producedQuantity != null;
    const rawRecordedQuantity = Math.max(0, Number(row?.producedQuantity) || 0);
    const recordedQuantity = known ? rawRecordedQuantity : null;
    // A confirmed completion/short-close quantity is the public production
    // quantity even when an old CT snapshot cannot reconstruct process totals.
    // Keep the raw recorded value alongside it for internal diagnosis.
    const plannedQuantity = row?.plannedQuantity ?? null;
    return { id: plan.externalId, style: row?.label || plan.style?.name || '',
      factory: row?.factoryName || '', plannedQuantity,
      producedQuantity, recordedQuantity, completed,
      progressPercent: known ? (completed ? 100 : row.displayProgressPercent ?? row.progressPercent ?? null) : null,
      progressQuantity: known
        ? completed && Number(plannedQuantity) > 0 ? Number(plannedQuantity) : producedQuantity
        : null };
  });
  const known = assignments.length > 0 && assignments.every(row => row.producedQuantity != null);
  const producedQuantity = known ? assignments.reduce((sum, row) => sum + (row.producedQuantity ?? 0), 0) : null;
  const progressQuantity = known ? assignments.reduce((sum, row) => sum + (row.progressQuantity ?? 0), 0) : null;
  return { orderId: order.orderId, orderNumber: order.orderNumber, dueDate: order.dueDate,
    totalQuantity: order.totalQuantity, assignments, producedQuantity,
    // Order progress includes unassigned quantity in its denominator. It is not
    // an average of assignment percentages or a declaration of completion.
    progressPercent: progressQuantity != null && order.totalQuantity > 0
      ? Math.min(100, progressQuantity / order.totalQuantity * 100) : null };
}
