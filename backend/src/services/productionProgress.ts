// Public progress is separate from scheduler/load ratios.
export function displayProductionProgress(percent: unknown, completed: boolean): number | null {
  if (percent == null || !Number.isFinite(Number(percent))) return completed ? 100 : null;
  const raw = Math.max(completed ? 100 : 0, Number(percent));
  if (raw > 100) return Math.max(100.1, Math.round(raw * 10) / 10);
  const rounded = Math.round(raw);
  return !completed && rounded === 100 ? 99 : rounded;
}

export function productionProducedQuantity(row: any): number | null {
  const completed = row?.isCompleted === true;
  if (!row || (!completed && (
    (row.isProductionProgressUnknown ?? row.isProgressUnknown) ||
    (row.hasInvalidProductionProcessReferences ?? row.hasInvalidProcessReferences)
  ))) return null;
  const recorded = Math.max(0, Number(row.producedQuantity) || 0);
  const approved = Number(row.completionTargetQuantity);
  return completed && Number.isFinite(approved) && approved >= 0 ? Math.max(recorded, approved) : recorded;
}

export function assignmentProgressRatio(row: any): number | null {
  if (productionProducedQuantity(row) == null) return null;
  const quantity = Math.max(0, Number(row.plannedQuantity) || 0);
  const raw = row.operationalProgressRatio
    ?? (row.operationalProgressPercent != null ? Number(row.operationalProgressPercent) / 100 : null)
    ?? (row.displayProgressPercent != null ? Number(row.displayProgressPercent) / 100 : null)
    ?? (row.progressPercent != null ? Number(row.progressPercent) / 100 : null)
    ?? (quantity > 0 ? Number(row.producedQuantity || 0) / quantity : null);
  if (row.isCompleted === true) return Math.max(1, Number(raw) || 0);
  return raw != null && Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : null;
}

export function summarizeStyleProduction(ordered: number, progress: any[], prior: any[] = [], expectedPlanCount = progress.length) {
  const priorQuantity = prior.filter(row => !row.canceledAt).reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
  let unallocated = priorQuantity;
  let produced = priorQuantity, work = 0, planned = 0;
  let known = progress.length === expectedPlanCount;
  let allComplete = progress.length > 0 && known;
  for (const row of progress) {
    const quantity = Math.max(0, Number(row.plannedQuantity) || 0);
    const credit = Math.min(unallocated, quantity);
    unallocated -= credit;
    const recorded = Math.max(0, Number(row.producedQuantity) || 0);
    const recognized = row.isCompleted === true && priorQuantity > 0
      ? Math.max(recorded, Math.max(0, Number(row.completionTargetQuantity ?? quantity) - credit))
      : productionProducedQuantity(row) ?? recorded;
    produced += recognized;
    const ratio = assignmentProgressRatio(row);
    if ((row.plannedQuantity == null || !Number.isFinite(Number(row.plannedQuantity)) || Number(row.plannedQuantity) < 0) && priorQuantity < ordered) known = false;
    if (ratio == null && credit < quantity) known = false;
    // Historical credit overlaps an approved baseline, never actual excess.
    work += row.isCompleted === true ? Math.max(quantity, (ratio ?? 1) * quantity)
      : Math.max(0, (ratio ?? 0) * quantity) + credit;
    planned += quantity;
    allComplete &&= row.isCompleted === true;
  }
  work += unallocated;
  if (priorQuantity >= ordered && ordered > 0) known = true;
  const isCompleted = ordered > 0 && (priorQuantity >= ordered || (allComplete && planned + unallocated >= ordered));
  const denominator = Math.max(ordered, planned);
  const rawProgressPercent = known && denominator > 0 ? work / denominator * 100 : null;
  return { priorQuantity, producedQuantity: known ? produced : null,
    progressPercent: displayProductionProgress(rawProgressPercent, isCompleted),
    rawProgressPercent, isCompleted, isProgressUnknown: !known };
}
