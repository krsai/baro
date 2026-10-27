// Display evidence from the original order/style scope, never merge same style
// names from separate orders or infer per-color/per-size production quantities.
export function invoiceProductionReview(source, line) {
  const style = source?.styles?.find(row => row.styleId === line.styleId && row.orderId === line.orderId);
  if (!style) return null;
  const assignments = style.assignments || [];
  const problems = assignments.flatMap(assignment => {
    const reasons = [];
    if (assignment.productionReviewRequired || assignment.producedQuantity == null) reasons.push('unknown');
    else if (!assignment.completed) reasons.push('incomplete');
    if (assignment.timeReviewRequired) reasons.push('time');
    if (assignment.hasCompletionDifference) reasons.push('difference');
    return reasons.length ? [{ ...assignment, reasons }] : [];
  });
  if (style.ready && !problems.length) return null;
  return { style, problems, reason: problems.length ? null : assignments.length ? 'review' : style.producedQuantity == null ? 'unassigned' : 'incomplete' };
}
