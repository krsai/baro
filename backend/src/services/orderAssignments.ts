// Prefer the direct order FK; the card FK only fills an absent link.
export const orderAssignmentWhere = (orderId: number, orgId?: number) => ({ OR: [
  { workOrderId: orderId },
  { workOrderId: null, assignmentCard: { is: { workOrderId: orderId, ...(orgId == null ? {} : { orgId }) } } },
] });

export const orderAssignmentPlans = (orderId: number, plans: any[]) => plans.filter(plan =>
  (plan.workOrderId ?? plan.assignmentCard?.workOrderId) === orderId);
