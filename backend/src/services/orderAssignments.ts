// Prefer the direct order FK; the card FK only fills an absent link.
export const orderAssignmentPlans = (orderId: number, plans: any[]) => plans.filter(plan =>
  (plan.workOrderId ?? plan.assignmentCard?.workOrderId) === orderId);
