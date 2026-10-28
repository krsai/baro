import { invoiceOrderProgress } from './invoiceOrderProgress';
import { orderAssignmentPlans } from './orderAssignments';

// Statements are cumulative: a 30% statement followed by 70% is not 100%.
// A current 100% statement must cover the actual item/size FKs for the style.
export function invoiceBillingCoverage(order: any, statements: any[]) {
  const items = (order.workOrderItems || []).filter((item: any) => Number(item.totalQuantity) > 0);
  const styles = new Set<number>();
  const quantities = new Map<number, number>();
  const styleIds = [...new Set<number>(items.map((item: any) => item.styleId))];
  for (const styleId of styleIds) {
    const styleItems = items.filter((item: any) => item.styleId === styleId);
    const fullStatements = statements.filter(statement => statement.workOrderId === order.id && statement.sourceOrderId === order.orderId
      && statement.invoice?.sellerOrgId === order.sellerOrgId && statement.invoice?.buyerOrgId === order.buyerOrgId
      && statement.invoice?.status === 'ISSUED' && Number(statement.billingPercentage) === 100
      && styleItems.every((item: any) => {
        const lines = (statement.lines || []).filter((line: any) => line.workOrderItemId === item.id && line.sourceItemId === item.id && line.styleId === styleId);
        const sizes = Object.entries(item.sizeQuantities || {}).filter(([, quantity]) => Number(quantity) > 0);
        if (sizes.length && sizes.reduce((sum, [, quantity]) => sum + Number(quantity), 0) === Number(item.totalQuantity)) {
          return sizes.every(([size, quantity]) => lines.filter((line: any) => line.size === size).reduce((sum: number, line: any) => sum + Number(line.quantity), 0) >= Number(quantity));
        }
        return lines.reduce((sum: number, line: any) => sum + Number(line.quantity), 0) >= Number(item.totalQuantity);
      }));
    if (fullStatements.length) {
      styles.add(styleId);
      quantities.set(styleId, Math.max(...fullStatements.map(statement => (statement.lines || []).filter((line: any) => line.styleId === styleId && styleItems.some((item: any) => item.id === line.workOrderItemId && item.id === line.sourceItemId)).reduce((sum: number, line: any) => sum + Number(line.quantity), 0))));
    }
  }
  return { complete: items.length > 0 && styles.size === styleIds.length, styles, quantities };
}

export function billingCoversProduction(coverage: ReturnType<typeof invoiceBillingCoverage> | undefined, production: any) {
  return coverage?.complete === true && (production?.styles || []).every((style: any) => style.producedQuantity != null && (coverage.quantities.get(style.styleId) || 0) >= style.producedQuantity);
}

export async function loadInvoiceBillingCoverage(db: any, orders: any[]) {
  if (!orders.length) return new Map<number, ReturnType<typeof invoiceBillingCoverage>>();
  const statements = await db.invoiceOrder.findMany({ where: { workOrderId: { in: orders.map(order => order.id) }, invoice: { status: 'ISSUED' } },
    include: { invoice: { select: { sellerOrgId: true, buyerOrgId: true, status: true } }, lines: true } });
  return new Map<number, ReturnType<typeof invoiceBillingCoverage>>(orders.map(order => [order.id, invoiceBillingCoverage(order, statements)]));
}

// Annotate display rows only. Never remove assignments from persisted board state.
export async function annotateAssignmentInvoiceWorkflow(db: any, orgId: number, rows: any[], loadProgress: (orgId: number, ids: string[]) => Promise<any[]>) {
  const ids = [...new Set(rows.map(row => row.workOrderId).filter(Boolean))];
  if (!ids.length) return rows;
  const orders = await db.workOrder.findMany({ where: { id: { in: ids }, sellerOrgId: orgId }, include: { workOrderItems: true, priorCompletions: { where: { canceledAt: null } } } });
  const plans = orders.length ? await db.assignmentPlan.findMany({ where: { orgId, OR: [
    { workOrderId: { in: orders.map((order: any) => order.id) } },
    { workOrderId: null, assignmentCard: { is: { workOrderId: { in: orders.map((order: any) => order.id) } } } },
  ] }, select: { externalId: true, styleId: true, workOrderId: true, assignmentCard: { select: { workOrderId: true } } } }) : [];
  const coverage = await loadInvoiceBillingCoverage(db, orders);
  const missing = plans.filter((plan: any) => !rows.some(row => row.id === plan.externalId));
  const progress = [...rows, ...(missing.length ? await loadProgress(orgId, missing.map((plan: any) => plan.externalId)) : [])];
  const closed = new Set<string>();
  for (const order of orders) {
    const related = orderAssignmentPlans(order.id, plans);
    const production = invoiceOrderProgress(order, related, progress);
    for (const style of production.styles) {
      const stylePlans = related.filter(plan => plan.styleId === style.styleId);
      if (style.isCompleted && coverage.get(order.id)?.styles.has(style.styleId)
        && stylePlans.length && stylePlans.every(plan => progress.some(row => row.id === plan.externalId && row.isCompleted === true))) {
        // Do not close excess production that has not been invoiced.
        const actual = style.producedQuantity;
        if (actual == null || actual > (coverage.get(order.id)?.quantities.get(style.styleId) || 0)) continue;
        for (const plan of stylePlans) closed.add(plan.externalId);
      }
    }
  }
  return rows.map(row => ({ ...row, isManagementClosed: row.isCompleted === true && closed.has(row.id) }));
}
