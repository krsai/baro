import { assignmentProgressRatio, displayProductionProgress, productionProducedQuantity, summarizeStyleProduction } from './productionProgress';
import { orderAssignmentPlans } from './orderWorkflow';
export { productionProducedQuantity as invoiceProducedQuantity } from './productionProgress';

// Shared by orders, invoice selection, and the customer production report.
export function invoiceOrderProgress(order: any, plans: any[], progress: any[]) {
  const byId = new Map(progress.map(row => [row.id, row]));
  const related = orderAssignmentPlans(order.id, plans);
  const assignments = related.map(plan => {
    const row = byId.get(plan.externalId);
    const completed = row?.isCompleted === true;
    const producedQuantity = productionProducedQuantity(row);
    const ratio = assignmentProgressRatio(row);
    return { id: plan.externalId, style: row?.label || plan.style?.name || '',
      factory: row?.factoryName || '', plannedQuantity: row?.plannedQuantity ?? null,
      producedQuantity, recordedQuantity: producedQuantity == null ? null : Math.max(0, Number(row?.producedQuantity) || 0), completed,
      progressPercent: displayProductionProgress(ratio == null ? null : ratio * 100, completed),
      progressQuantity: ratio == null ? null : Math.max(0, Number(row?.plannedQuantity) || 0) * ratio };
  });
  const required = new Map<number, number>();
  for (const item of order.workOrderItems || []) required.set(item.styleId, (required.get(item.styleId) || 0) + item.totalQuantity);
  // Compatibility for source projections that carry only the order total.
  if (!required.size) required.set(-1, Number(order.totalQuantity) || 0);
  const styles = [...required].map(([styleId, orderedQuantity]) => {
    const stylePlans = styleId === -1 ? related : related.filter(plan => plan.styleId === styleId);
    const rows = stylePlans.map(plan => byId.get(plan.externalId)).filter(Boolean);
    const prior = (order.priorCompletions || []).filter((entry: any) => entry.styleId === styleId);
    const summary = summarizeStyleProduction(orderedQuantity, rows, prior, stylePlans.length);
    return { styleId, orderedQuantity, ...summary };
  });
  const positiveStyles = styles.filter(style => style.orderedQuantity > 0);
  const hasSource = related.length > 0 || styles.some(style => style.priorQuantity > 0);
  const known = hasSource && positiveStyles.length > 0 && positiveStyles.every(style => !style.isProgressUnknown);
  const isCompleted = positiveStyles.length > 0 && positiveStyles.every(style => style.isCompleted);
  const totalQuantity = positiveStyles.reduce((sum, style) => sum + style.orderedQuantity, 0);
  const raw = known && totalQuantity > 0
    ? positiveStyles.reduce((sum, style) => sum + style.orderedQuantity * (style.rawProgressPercent ?? 0), 0) / totalQuantity : null;
  return { orderId: order.orderId, orderNumber: order.orderNumber, dueDate: order.dueDate,
    totalQuantity: order.totalQuantity, assignments, styles, isCompleted, isProgressUnknown: !known,
    producedQuantity: known ? styles.reduce((sum, style) => sum + (style.producedQuantity ?? 0), 0) : null,
    priorQuantity: styles.reduce((sum, style) => sum + style.priorQuantity, 0),
    progressPercent: displayProductionProgress(raw, isCompleted) };
}
