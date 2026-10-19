export const STYLE_DELETION_COUNTS = { workRecords: true, outsourcedWorkRecords: true,
  priorCompletions: true, workOrderItems: true, assignmentPlans: true, trainingBuckets: true, transactionCosts: true } as const;

export function styleDeletionState(counts?: Record<string, number>) {
  if (!counts) return { workRecordCount: 0, hasWorkRecords: false, canDelete: false, deleteBlockedReason: 'UNVERIFIED' };
  const workRecordCount = Number(counts.workRecords || 0) + Number(counts.outsourcedWorkRecords || 0);
  const deleteBlockedReason = workRecordCount > 0 ? 'WORK_RECORDS' :
    counts.priorCompletions ? 'PRIOR_COMPLETION' : counts.trainingBuckets ? 'TRAINING_SOURCE' :
    counts.workOrderItems ? 'ORDER' : counts.assignmentPlans ? 'ASSIGNMENT' : counts.transactionCosts ? 'COST' : null;
  return { workRecordCount, hasWorkRecords: workRecordCount > 0, canDelete: !deleteBlockedReason, deleteBlockedReason };
}
