import { Prisma } from "@prisma/client";
import { analyzeOrderAssignmentImpact, OrderImpactItem } from "../utils/orderAssignmentImpact";
import { createHttpError } from "../utils/http";

// Validate every organization independently. No assignment quantities, CT/ST,
// work records or completion fields are written by the order save path.
export async function guardOrderSaveAssignments(
  db: Prisma.TransactionClient, before: any, after: any, afterItems: Array<Omit<OrderImpactItem, "styleId"> & { styleId: number | null }>,
  annotatePayroll: (orgId: number, plans: any[], db: Prisma.TransactionClient) => Promise<any[]>
) {
  const stored = await db.workOrderItem.findMany({ where: { workOrderId: before.id },
    select: { styleId: true, totalQuantity: true, gender: true } });
  const plans = await db.assignmentPlan.findMany({
    where: { OR: [{ workOrderId: before.id }, { assignmentCard: { is: { workOrderId: before.id } } }] },
    select: { id: true, orgId: true, externalId: true, workOrderId: true, styleId: true,
      assignmentCard: { select: { workOrderId: true } }, assignmentQuantity: true, isCompleted: true,
      completedAt: true, closedAt: true, productionCompletedAt: true,
      _count: { select: { workRecords: true, outsourcedWorkRecords: true } } },
  });
  if (!plans.length) return [];
  if (before.buyerOrgId !== after.buyerOrgId || before.sellerOrgId !== after.sellerOrgId) {
    throw createHttpError(409, "ORDER_ASSIGNMENT_REVIEW: assigned orders cannot change buyer or seller");
  }
  if (plans.some(plan => plan.workOrderId !== before.id || !plan.styleId || plan.assignmentQuantity == null ||
      (plan.assignmentCard?.workOrderId != null && plan.assignmentCard.workOrderId !== before.id))) {
    throw createHttpError(409, "ORDER_ASSIGNMENT_REVIEW: repair assignment order/style/quantity links before saving");
  }
  // Nullable styles are legitimate in unassigned drafts. Once assignments exist,
  // ambiguous source items cannot be used to infer a safe allocation change.
  if ([...stored, ...afterItems].some(item => !item.styleId)) {
    throw createHttpError(409, "ORDER_ASSIGNMENT_REVIEW: assigned order items require a style");
  }
  const results = [];
  for (const orgId of [...new Set(plans.map(plan => plan.orgId))].sort((a, b) => a - b)) {
    const scoped = await annotatePayroll(orgId, plans.filter(plan => plan.orgId === orgId), db);
    const impacts = analyzeOrderAssignmentImpact({ beforeItems: stored as OrderImpactItem[], afterItems: afterItems as OrderImpactItem[],
      assignments: scoped.map(plan => ({ id: plan.id, styleId: plan.styleId,
        assignmentQuantity: plan.assignmentQuantity, hasWorkRecords: plan._count.workRecords > 0 || plan._count.outsourcedWorkRecords > 0,
        isCompleted: Boolean(plan.isCompleted || plan.completedAt || plan.closedAt || plan.productionCompletedAt),
        isPayrollLocked: Boolean(plan.isPayrollLocked) })) });
    for (const impact of impacts) {
      if (!impact.requiresAssignmentReview) continue;
      // Order demand can change independently of historical production targets.
      // Final settlement locking is enforced by the caller and database triggers.
      // Retain linked styles; quantity/gender totals must not rewrite placed plans.
      if (impact.styleRemoved) {
        throw createHttpError(409, `ORDER_ASSIGNMENT_REVIEW: review assignments before removing style (style ${impact.styleId})`);
      }
    }
    results.push({ orgId, impacts });
  }
  return results;
}
