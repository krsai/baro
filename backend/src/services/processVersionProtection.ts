// Reuse the scheduler's production state. Numeric percentages are not a lock.
export const processVersionLockReason = (plan: any, progress: any, payrollLocked = false, settlementLocked = false) => {
  if (plan.isCompleted === true || progress?.scheduleStatus === 'PRODUCTION_COMPLETED') return 'PRODUCTION_COMPLETED';
  if (payrollLocked || plan.isPayrollLocked) return 'PAYROLL_LOCKED';
  if (settlementLocked) return 'SETTLEMENT_LOCKED';
  return null;
};

export const annotateProcessVersionProtection = async (db: any, orgId: number, plans: any[], loadProgress: (db: any, plans: any[]) => Promise<any[]>) => {
  if (!plans.length) return [];
  const ids = plans.map(plan => plan.id);
  const [progress, payroll, orders, work, outsourced] = await Promise.all([
    loadProgress(db, plans),
    db.payrollSnapshot.findMany({ where: { orgId, isProvisional: false }, select: { month: true, factoryId: true } }),
    db.workOrder.findMany({ where: { id: { in: plans.flatMap(plan => plan.workOrderId ? [plan.workOrderId] : []) } }, select: { id: true, invoiceFinalLockedAt: true } }),
    db.workRecord.findMany({ where: { orgId, assignmentPlanId: { in: ids } }, select: { assignmentPlanId: true, workLog: { select: { displayDate: true } } } }),
    db.outsourcedWorkRecord.findMany({ where: { orgId, assignmentPlanId: { in: ids } }, select: { assignmentPlanId: true, workLog: { select: { displayDate: true } } } }),
  ]);
  const progressById = new Map(progress.map(row => [row.id, row]));
  const settled = new Set(orders.filter((order: any) => order.invoiceFinalLockedAt).map((order: any) => order.id));
  const lockedMonths = new Set(payroll.map((row: any) => `${row.factoryId}:${row.month}`));
  const factoryByPlan = new Map(plans.map(plan => [plan.id, plan.factoryId]));
  const payrollLockedPlans = new Set([...work, ...outsourced].filter((row: any) =>
    lockedMonths.has(`${factoryByPlan.get(row.assignmentPlanId)}:${String(row.workLog?.displayDate || '').slice(0,7)}`)).map((row: any) => row.assignmentPlanId));
  return plans.map(plan => {
    const versionLockReason = processVersionLockReason(plan, progressById.get(plan.externalId), payrollLockedPlans.has(plan.id), settled.has(plan.workOrderId));
    return { ...plan, isVersionLocked: Boolean(versionLockReason), versionLockReason };
  });
};
