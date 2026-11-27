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
  const statements = await db.invoiceOrder.findMany({ where: { workOrderId: { in: orders.map(order => order.id) }, billingPercentage: 100, invoice: { status: 'ISSUED' } },
    include: { invoice: { select: { sellerOrgId: true, buyerOrgId: true, status: true } },
      lines: { select: { workOrderItemId: true, sourceItemId: true, styleId: true, size: true, quantity: true } } } });
  const statementsByOrder = new Map<number, any[]>();
  for (const statement of statements) {
    const rows = statementsByOrder.get(statement.workOrderId) || [];
    rows.push(statement);
    statementsByOrder.set(statement.workOrderId, rows);
  }
  return new Map<number, ReturnType<typeof invoiceBillingCoverage>>(orders.map(order => [order.id, invoiceBillingCoverage(order, statementsByOrder.get(order.id) || [])]));
}

// Annotate display rows only. Never remove assignments from persisted board state.
export async function loadInvoiceExcludedOrderIds(db:any,orgId:number,ids:number[]){
 const unique=[...new Set(ids.filter(id=>Number.isSafeInteger(id)&&id>0))];
 if(!unique.length)return new Set<number>();
 const policies=await db.orderInvoicePolicy.findMany({where:{orgId,excluded:true,workOrderId:{in:unique},order:{sellerOrgId:orgId}},select:{workOrderId:true}});
 return new Set<number>(policies.map((row:any)=>row.workOrderId));
}
export async function annotateAssignmentInvoiceWorkflow(db: any, orgId: number, rows: any[], loadProgress: (orgId: number, ids: string[]) => Promise<any[]>) {
  const excluded=await loadInvoiceExcludedOrderIds(db,orgId,rows.map(row=>row.workOrderId));
  const visible = rows.map(row => ({ ...row, isManagementClosed: excluded.has(row.workOrderId) }));
  const candidates = rows.filter(row => row.isCompleted === true && row.workOrderId&&!excluded.has(row.workOrderId));
  const ids = [...new Set(candidates.map(row => row.workOrderId))];
  if (!ids.length) return visible;
  const orders = await db.workOrder.findMany({ where: { id: { in: ids }, sellerOrgId: orgId }, include: { workOrderItems: true, priorCompletions: { where: { canceledAt: null } } } });
  const coverage = await loadInvoiceBillingCoverage(db, orders);
  const billedOrders = orders.filter((order: any) => candidates.some(row => row.workOrderId === order.id && coverage.get(order.id)?.styles.has(row.styleId)));
  if (!billedOrders.length) return visible;
  const styleIds = [...new Set(candidates.filter(row => coverage.get(row.workOrderId)?.styles.has(row.styleId)).map(row => row.styleId))];
  const plans = await db.assignmentPlan.findMany({ where: { orgId, styleId: { in: styleIds }, OR: [
    { workOrderId: { in: billedOrders.map((order: any) => order.id) } },
    { workOrderId: null, assignmentCard: { is: { workOrderId: { in: billedOrders.map((order: any) => order.id) } } } },
  ] }, select: { externalId: true, styleId: true, workOrderId: true, assignmentCard: { select: { workOrderId: true } } } });
  const rowIds = new Set(rows.map(row => row.id));
  const missing = plans.filter((plan: any) => !rowIds.has(plan.externalId));
  const progress = [...rows, ...(missing.length ? await loadProgress(orgId, missing.map((plan: any) => plan.externalId)) : [])];
  const progressById = new Map(progress.map(row => [row.id, row]));
  const closed = new Set<string>();
  for (const order of billedOrders) {
    const related = orderAssignmentPlans(order.id, plans);
    const production = invoiceOrderProgress(order, related, progress);
    for (const style of production.styles) {
      const stylePlans = related.filter(plan => plan.styleId === style.styleId);
      if (style.isCompleted && coverage.get(order.id)?.styles.has(style.styleId)
        && stylePlans.length && stylePlans.every(plan => progressById.get(plan.externalId)?.isCompleted === true)) {
        // Do not close excess production that has not been invoiced.
        const actual = style.producedQuantity;
        if (actual == null || actual > (coverage.get(order.id)?.quantities.get(style.styleId) || 0)) continue;
        for (const plan of stylePlans) closed.add(plan.externalId);
      }
    }
  }
  return visible.map(row => ({ ...row, isManagementClosed: row.isManagementClosed || row.isCompleted === true && closed.has(row.id) }));
}
