// Read-only hierarchical prediction. Estimates are never training observations.
// Equal style weighting prevents styles with many processes dominating the prior.
type Row = any;
const median = (xs: number[]) => {
  const sorted = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return n ? (sorted[Math.floor(n / 2)]! + sorted[Math.floor((n - 1) / 2)]!) / 2 : 0;
};
const observations = (row: Row) => (row.atObservations || []).filter((o: Row) =>
  Number(o.quantity) > 0 && Number.isFinite(Number(o.quantity)) && Number(o.assignmentPlanId) > 0 && Number.isFinite(Number(o.assignmentPlanId)) && Number(o.allocatedLaborInputSeconds) > 0 &&
  Number.isFinite(Number(o.allocatedLaborInputSeconds)));
const fitCache = new WeakMap<object, { a: number; b: number } | null>();
const fitUncached = (row: Row) => {
  const obs = observations(row);
  if (new Set(obs.map((o: Row) => o.assignmentPlanId)).size < 2 || new Set(obs.map((o: Row) => Number(o.quantity))).size < 2) return null;
  const quantities = obs.map((o: Row) => Number(o.quantity));
  if (Math.max(...quantities) / Math.min(...quantities) < 2) return null;
  // Median pairwise slopes reduce the influence of an isolated unusual batch.
  const slopes: number[] = [];
  for (let i = 0; i < obs.length; i++) for (let j = i + 1; j < obs.length; j++) {
    const dq = Number(obs[j].quantity) - Number(obs[i].quantity);
    if (Math.max(Number(obs[j].quantity), Number(obs[i].quantity)) / Math.min(Number(obs[j].quantity), Number(obs[i].quantity)) >= 2) slopes.push((Number(obs[j].allocatedLaborInputSeconds) - Number(obs[i].allocatedLaborInputSeconds)) / dq);
  }
  const a = median(slopes);
  const b = median(obs.map((o: Row) => Number(o.allocatedLaborInputSeconds) - a * Number(o.quantity)));
  const error = median(obs.map((o: Row) => Math.abs(a * Number(o.quantity) + b - Number(o.allocatedLaborInputSeconds)) / Number(o.allocatedLaborInputSeconds)));
  return a > 0 && b >= 0 && Number.isFinite(a + b) && error <= 0.5 ? { a, b } : null;
};

// Validate the actual predictor, never its fitted training residuals. Shared trials
// exclude the entire held-out style; own trials exclude the assignment globally.
// Caches are request-scoped (the candidate array), not cross-request data caches.
type Trial = { quantity: number; error: number; predictionRelativeError: number; predictedSeconds: number; styleId: number; assignmentId: number };
const validationContexts = new WeakMap<Row[], {
  shared: Map<Row, Trial[]>;
  pools: Map<number, Row[]>;
}>();
const predictSeconds = (p: Row, q: number) => p.a + p.b *
  (q < p.smallQuantityBoundary ? (2 - q / p.smallQuantityBoundary) / p.smallQuantityBoundary : 1 / q);
export const buildValidatedSharedAtPrediction = (target: Row, candidates: Row[]) => {
  const prediction = buildSharedAtPrediction(target, candidates);
  if (!prediction) return null;
  let context = validationContexts.get(candidates);
  if (!context) {
    context = { shared: new Map(), pools: new Map() };
    validationContexts.set(candidates, context);
  }
  const trial = (p: Row, o: Row, styleId: number): Trial => ({
    quantity: Number(o.quantity), styleId, assignmentId: Number(o.assignmentPlanId),
    predictedSeconds: predictSeconds(p, Number(o.quantity)),
    error: Math.abs(predictSeconds(p, Number(o.quantity)) - Number(o.allocatedLaborInputSeconds) / Number(o.quantity)) /
      (Number(o.allocatedLaborInputSeconds) / Number(o.quantity)),
    predictionRelativeError: Math.abs(predictSeconds(p, Number(o.quantity)) - Number(o.allocatedLaborInputSeconds) / Number(o.quantity)) /
      predictSeconds(p, Number(o.quantity)),
  });
  const ownTrials: Trial[] = [];
  for (const assignmentId of new Set<number>(observations(target).map((o: Row) => Number(o.assignmentPlanId)))) {
    let pool = context.pools.get(assignmentId);
    if (!pool) {
      pool = candidates.map(row => ({ ...row, atObservations: observations(row).filter((o: Row) => Number(o.assignmentPlanId) !== assignmentId) }));
      context.pools.set(assignmentId, pool);
    }
    const heldOut = { ...target, atObservations: observations(target).filter((o: Row) => Number(o.assignmentPlanId) !== assignmentId) };
    const p = buildSharedAtPrediction(heldOut, pool);
    if (p) {
      for (const o of observations(target).filter((o: Row) => Number(o.assignmentPlanId) === assignmentId)) ownTrials.push(trial(p, o, target.styleId));
    }
  }
  const sharedTrials: Trial[] = [];
  const eligible = candidates.filter(row => row.orgId === target.orgId && row.styleId !== target.styleId &&
    row.productionStage === target.productionStage && row.genderScope === target.genderScope && observations(row).length > 0 && Number(row.ptSeconds) > 0);
  const sameCategory = eligible.filter(row => Number(target.style?.categoryId) > 0 && Number(row.style?.categoryId) === Number(target.style.categoryId));
  const categoryValidation = new Set(sameCategory.map(row => row.styleId)).size >= 3;
  // When enough category peers exist, validate transfer on those peers. Their
  // predictions still use the complete common/category mixture, as in the app.
  for (const row of categoryValidation ? sameCategory : eligible) {
    let trials = context.shared.get(row);
    if (!trials) {
      const p = buildSharedAtPrediction({ ...row, atObservations: [] }, candidates);
      // PT/ST-prior predictions are also real predictions and can be checked
      // against held-out records. Quantity diversity is needed to fit a setup
      // curve, not to measure whether a prediction matches actual work time.
      const computed: Trial[] = p ? observations(row).map((o: Row) => trial(p, o, row.styleId)) : [];
      trials = computed;
      context.shared.set(row, computed);
    }
    sharedTrials.push(...(trials || []));
  }
  const summarize = (quantity: number | null) => {
    // One unit per own assignment or donor style. More process rows do not
    // manufacture independent evidence. Quantity proximity is continuous.
    const units = new Map<string, { errors: number[]; predictionErrors: number[]; weights: number[]; seconds: number[] }>();
    const localUnits = new Map<string, number[]>();
    for (const [source, trials] of [['own', ownTrials], ['shared', sharedTrials]] as const) {
      for (const t of trials) {
        const key = source === 'own' ? `a:${t.assignmentId}` : `s:${t.styleId}`;
        const values = units.get(key) || { errors: [], predictionErrors: [], weights: [], seconds: [] };
        const proximity = quantity ? Math.min(quantity, t.quantity) / Math.max(quantity, t.quantity) : 1;
        values.errors.push(t.error); values.weights.push(proximity);
        values.predictionErrors.push(t.predictionRelativeError);
        // Own holdout uses actual predicted seconds. Transfer trials are scaled
        // to this target's complexity rather than summing another style's time.
        values.seconds.push(source === 'own' ? t.predictedSeconds : predictSeconds(prediction, t.quantity));
        units.set(key, values);
        if (quantity && proximity >= 0.5) localUnits.set(key, [...(localUnits.get(key) || []), t.error]);
      }
    }
    const groups = [...units.entries()].map(([key, v]) => ({ own: key.startsWith('a:'), error: median(v.errors), weight: median(v.weights) }));
    const support = groups.reduce((s, g) => s + g.weight, 0);
    const meanError = (items: { weight: number; error: number }[]) => {
      const weight = items.reduce((s, g) => s + g.weight, 0);
      return weight ? items.reduce((s, g) => s + g.error * g.weight, 0) / weight : null;
    };
    const ownGroups = groups.filter(g => g.own);
    const ownError = meanError(ownGroups), sharedError = meanError(groups.filter(g => !g.own));
    const ownWeight = sharedError === null ? 1 : ownGroups.length / (ownGroups.length + 3);
    const relativeError = ownError === null ? sharedError : sharedError === null ? ownError : ownError * ownWeight + sharedError * (1 - ownWeight);
    // Error in predicted-time units: |actual - predicted| / predicted.
    // Average within independent units first; repeated rows are not new units.
    const errorGroups = [...units.entries()].map(([key, v]) => ({ own: key.startsWith('a:'),
      weight: median(v.weights), error: v.predictionErrors.reduce((s, e, i) => s + e * v.weights[i]!, 0) / v.weights.reduce((s, w) => s + w, 0) }));
    const ownPredictionError = meanError(errorGroups.filter(g => g.own));
    const sharedPredictionError = meanError(errorGroups.filter(g => !g.own));
    // Prefer the target's measured errors when available; transfer errors are
    // used only when the target has no held-out predictions. No sample bonuses,
    // success threshold, pseudo-counts, or multiplication by evidence scores.
    // Far extrapolation cannot be validated using a good error at tiny batches.
    // A nearby quantity means within a factor of two, as with existing ranges.
    const nearbyOwn = [...localUnits.keys()].some(key => key.startsWith('a:'));
    const nearbyShared = [...localUnits.keys()].some(key => key.startsWith('s:'));
    let predictionRelativeError = quantity === null ? ownPredictionError ?? sharedPredictionError
      : nearbyOwn ? ownPredictionError : nearbyShared ? sharedPredictionError : null;
    const overallUnits = [...units.entries()].map(([key, v]) => ({ own: key.startsWith('a:'),
      seconds: v.seconds.reduce((s, t) => s + t, 0) / v.seconds.length,
      errorSeconds: v.seconds.reduce((s, t, i) => s + t * v.predictionErrors[i]!, 0) / v.seconds.length }));
    const measuredUnits = overallUnits.some(v => v.own) ? overallUnits.filter(v => v.own) : overallUnits;
    const meanPredictionSeconds = measuredUnits.length ? measuredUnits.reduce((s, v) => s + v.seconds, 0) / measuredUnits.length : null;
    const meanAbsoluteErrorSeconds = measuredUnits.length ? measuredUnits.reduce((s, v) => s + v.errorSeconds, 0) / measuredUnits.length : null;
    if (quantity === null && meanPredictionSeconds !== null && meanPredictionSeconds > 0 && meanAbsoluteErrorSeconds !== null) {
      predictionRelativeError = meanAbsoluteErrorSeconds / meanPredictionSeconds;
    }
    // Smooth, uncapped support growth; quality depends on held-out error.
    // This is a diagnostic score, not a coverage probability.
    const proximityLimit = quantity ? Math.min(1, 2 * Math.max(0, ...groups.map(g => g.weight))) : 1;
    const score = relativeError === null ? 0 : Math.round(100 * (1 - Math.exp(-support / 5)) * Math.exp(-2 * relativeError) * proximityLimit);
    const reliabilityPercent = predictionRelativeError === null ? null : Math.round(100 * Math.max(0, 1 - predictionRelativeError));
    // Keep the worst nearby error within an independent unit; averaging rows
    // must not hide a failed reference-quantity prediction.
    const sorted = [...localUnits.values()].map(values => Math.max(...values)).sort((a, b) => a - b);
    const percentile = (xs: number[]) => xs.sort((a, b) => a - b)[Math.ceil(xs.length * 0.8) - 1] ?? 0;
    const ownLocal = [...localUnits.entries()].filter(([key]) => key.startsWith('a:')).map(([, values]) => Math.max(...values));
    const sharedLocal = [...localUnits.entries()].filter(([key]) => key.startsWith('s:')).map(([, values]) => Math.max(...values));
    return { score, reliabilityPercent, predictionRelativeError, reliabilityMethod: 'predicted-time-absolute-error-v1',
      ...(quantity === null ? { meanPredictionSeconds, meanAbsoluteErrorSeconds } : {}),
      independentCount: groups.length, effectiveSupport: support, relativeError,
      // Empirical 80th percentile of nearby held-out relative errors, NOT a
      // calibrated confidence interval. No nearby trials => no error band.
      errorP80: sorted.length >= 3 ? Math.max(percentile(ownLocal), percentile(sharedLocal)) : null,
      nearbyTrialCount: sorted.length };
  };
  return { ...prediction, validation: { version: 'held-out-shared-v1', overall: summarize(null),
    referenceQuantity: 1000, reference: summarize(1000), ownAssignmentCount: new Set(ownTrials.map(t => t.assignmentId)).size,
    donorStyleCount: new Set(sharedTrials.map(t => t.styleId)).size, sharedValidationScope: categoryValidation ? 'CATEGORY' : 'COMMON' } };
};
const fit = (row: Row) => {
  if (!fitCache.has(row)) fitCache.set(row, fitUncached(row));
  return fitCache.get(row) ?? null;
};
export const buildSharedAtPrediction = (target: Row, candidates: Row[]) => {
  const pt = Number(target.ptSeconds);
  const seed = pt > 0 ? pt : Number(target.standards?.[0]?.bucketStSeconds);
  if (!(seed > 0) || !Number.isFinite(seed)) return null;
  const category = Number(target.style?.categoryId) > 0 ? Number(target.style.categoryId) : null;
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
  const sameCategory = summarize(donors.filter(({ row }) => category !== null && Number(row.style?.categoryId) === category));
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
  // Below the evidence boundary use its tangent, not an unbounded 1/q tail.
  // The smallest own observation always remains on the original curve.
  const boundariesByStyle = new Map<number, number[]>();
  for (const { row } of donors) {
    const values = boundariesByStyle.get(row.styleId) || [];
    values.push(Math.min(...observations(row).map((o: Row) => Number(o.quantity))));
    boundariesByStyle.set(row.styleId, values);
  }
  const donorBoundary = median([...boundariesByStyle.values()].map(values => median(values)));
  const ownBoundary = obs.length ? Math.min(...obs.map((o: Row) => Number(o.quantity))) : 0;
  const smallQuantityBoundary = ownBoundary ? Math.min(ownBoundary, Math.max(100, donorBoundary)) : Math.max(100, donorBoundary);
  return { version: 'shared-at-v1', a, b, smallQuantityBoundary, source: own ? 'OWN_BLEND' : obs.length ? 'OBSERVATION_ANCHORED' : sameCategory.count ? 'CATEGORY_PRIOR' : common.count ? 'COMMON_PRIOR' : 'PT_ST_PRIOR',
    categoryId: category, category: String(target.style?.collection || '').trim() || null, donorStyleCount: common.count, categoryStyleCount: sameCategory.count,
    ownAssignmentCount: ownCount, ownWeight, categoryWeight, isProvisional: !own || ownWeight < 0.8,
    scope: 'ORGANIZATION_PRODUCTION_STAGE', seedSource: pt > 0 ? 'PT' : 'ST' };
};
