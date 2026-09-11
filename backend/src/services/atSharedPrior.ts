// Read-only hierarchical prediction. Estimates are never training observations.
// Equal style weighting prevents styles with many processes dominating the prior.
type Row = any;
const median = (xs: number[]) => {
  const sorted = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return n ? (sorted[Math.floor(n / 2)]! + sorted[Math.floor((n - 1) / 2)]!) / 2 : 0;
};
const observations = (row: Row) => (row.atObservations || []).filter((o: Row) =>
  Number(o.quantity) > 0 && Number.isFinite(Number(o.quantity)) && Number(o.assignmentPlanId) > 0 && Number(o.allocatedLaborInputSeconds) > 0 &&
  Number.isFinite(Number(o.allocatedLaborInputSeconds)));
const fitCache = new WeakMap<object, { a: number; b: number } | null>();
const fitUncached = (row: Row) => {
  const obs = observations(row);
  if (new Set(obs.map((o: Row) => o.assignmentPlanId)).size < 2 || new Set(obs.map((o: Row) => Number(o.quantity))).size < 2) return null;
  // Median pairwise slopes reduce the influence of an isolated unusual batch.
  const slopes: number[] = [];
  for (let i = 0; i < obs.length; i++) for (let j = i + 1; j < obs.length; j++) {
    const dq = Number(obs[j].quantity) - Number(obs[i].quantity);
    if (dq) slopes.push((Number(obs[j].allocatedLaborInputSeconds) - Number(obs[i].allocatedLaborInputSeconds)) / dq);
  }
  const a = median(slopes);
  const b = median(obs.map((o: Row) => Number(o.allocatedLaborInputSeconds) - a * Number(o.quantity)));
  const error = median(obs.map((o: Row) => Math.abs(a * Number(o.quantity) + b - Number(o.allocatedLaborInputSeconds)) / Number(o.allocatedLaborInputSeconds)));
  return a > 0 && b >= 0 && Number.isFinite(a + b) && error <= 0.5 ? { a, b } : null;
};
const fit = (row: Row) => {
  if (!fitCache.has(row)) fitCache.set(row, fitUncached(row));
  return fitCache.get(row) ?? null;
};
export const buildSharedAtPrediction = (target: Row, candidates: Row[]) => {
  const pt = Number(target.ptSeconds);
  const seed = pt > 0 ? pt : Number(target.standards?.[0]?.bucketStSeconds);
  if (!(seed > 0) || !Number.isFinite(seed)) return null;
  const category = String(target.style?.collection || '').trim();
  const donors = candidates.filter(row => row.orgId === target.orgId && row.styleId !== target.styleId &&
    row.productionStage === target.productionStage && row.genderScope === target.genderScope && Number(row.ptSeconds) > 0)
    .map(row => ({ row, params: fit(row) })).filter(item => item.params && item.params.a / item.row.ptSeconds >= 0.2 && item.params.a / item.row.ptSeconds <= 5);
  const summarize = (items: typeof donors) => {
    const styles = new Map<number, { a: number[]; b: number[] }>();
    for (const { row, params } of items) {
      const values = styles.get(row.styleId) || { a: [], b: [] };
      values.a.push(params!.a / row.ptSeconds);
      values.b.push(params!.b / row.ptSeconds);
      styles.set(row.styleId, values);
    }
    return { count: styles.size, a: median([...styles.values()].map(v => median(v.a))), b: median([...styles.values()].map(v => median(v.b))) };
  };
  const common = summarize(donors);
  const sameCategory = summarize(donors.filter(({ row }) => category && String(row.style?.collection || '').trim() === category));
  const categoryWeight = sameCategory.count / (sameCategory.count + 3);
  // Three styles and five own assignments are explicit regularization strengths,
  // not confidence percentages. Calibrate using leave-one-style-out validation.
  const priorA = common.count ? seed * (common.a * (1 - categoryWeight) + sameCategory.a * categoryWeight) : seed;
  const priorB = common.count ? seed * (common.b * (1 - categoryWeight) + sameCategory.b * categoryWeight) : 0;
  const obs = observations(target);
  const own = fit(target);
  const ownCount = new Set(obs.map((o: Row) => o.assignmentPlanId)).size;
  const ownWeight = own ? common.count ? ownCount / (ownCount + 5) : 1 : 0;
  let a = own ? priorA * (1 - ownWeight) + own.a * ownWeight : priorA;
  let b = own ? priorB * (1 - ownWeight) + own.b * ownWeight : priorB;
  if (obs.length && !own) {
    // Anchor a borrowed curve to the observed batch without inventing observations.
    const total = obs.reduce((sum: number, o: Row) => sum + Number(o.allocatedLaborInputSeconds), 0);
    const quantity = obs.reduce((sum: number, o: Row) => sum + Number(o.quantity), 0);
    a = (total - b * obs.length) / quantity;
    if (!(a > 0)) { b = 0; a = total / quantity; }
  }
  if (!(a > 0) || b < 0 || !Number.isFinite(a + b)) return null;
  return { version: 'shared-at-v1', a, b, source: own ? 'OWN_BLEND' : obs.length ? 'OBSERVATION_ANCHORED' : sameCategory.count ? 'CATEGORY_PRIOR' : common.count ? 'COMMON_PRIOR' : 'PT_ST_PRIOR',
    category: category || null, donorStyleCount: common.count, categoryStyleCount: sameCategory.count,
    ownAssignmentCount: ownCount, ownWeight, categoryWeight, isProvisional: !own || ownWeight < 0.8,
    scope: 'ORGANIZATION_PRODUCTION_STAGE', seedSource: pt > 0 ? 'PT' : 'ST' };
};
