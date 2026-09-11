import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const loadProcessTimeModule = () => {
  const filePath = path.resolve('frontend/src/utils/processTime.js');
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/import[^\n]+\n/g, '');
  code = code.replace(/export const /g, 'const ');
  code = code.replace(/export \{[^}]+\};?/g, '');
  code +=
    '\nmodule.exports = { AT_RELIABILITY_STATUS, calculateProcessDisplayAtTotalForOrderQuantity, resolveProcessAtCellState, resolveProcessAtDisplayPerPieceSeconds, resolveProcessAtPerPieceSeconds, resolveProcessAtReliability, resolveStBucketQuantity, resolveStyleAtReliability };';
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    Intl,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    formatNumberWithCommas: (value) => String(value),
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.module.exports;
};

const {
  AT_RELIABILITY_STATUS,
  calculateProcessDisplayAtTotalForOrderQuantity,
  resolveProcessAtCellState,
  resolveProcessAtDisplayPerPieceSeconds,
  resolveProcessAtPerPieceSeconds,
  resolveProcessAtReliability,
  resolveStBucketQuantity,
  resolveStyleAtReliability,
} = loadProcessTimeModule();

test('shared prior supplies new-style AT with explicit provenance and nonincreasing per-piece values', () => {
  const process = { pt: 50, atV2Observations: [], atSharedPrediction: {
    version: 'shared-at-v1', a: 50, b: 10000, source: 'CATEGORY_PRIOR', isProvisional: true,
  } };
  assert.equal(resolveProcessAtPerPieceSeconds(process, 100), 150);
  assert.equal(resolveProcessAtPerPieceSeconds(process, 1000), 60);
  assert.equal(resolveProcessAtCellState(process, 1000).predictionSource, 'CATEGORY_PRIOR');
  assert.equal(resolveProcessAtCellState(process, 1000).isProvisional, true);
  assert.equal(calculateProcessDisplayAtTotalForOrderQuantity([process], 1000), 60000);
  assert.equal(resolveProcessAtPerPieceSeconds({ ...process, atSharedPrediction: { ...process.atSharedPrediction, b: -1 } }, 1000), null);
  assert.equal(process.atV2Observations.length, 0);
});

test('same-quantity repetitions update AT(1000), without fabricating a setup curve', () => {
  const process = { atModelVersion: 'v2', atV2Observations: [
    { assignmentPlanId: 1, quantity: 100, allocatedLaborInputSeconds: 6000 },
  ] };
  const before = JSON.stringify(process);
  assert.equal(resolveProcessAtPerPieceSeconds(process, 1000), 60);
  assert.equal(JSON.stringify(process), before);
  const updated = { ...process, atV2Observations: [...process.atV2Observations,
    { assignmentPlanId: 2, quantity: 100, allocatedLaborInputSeconds: 4000 },
  ] };
  assert.equal(resolveProcessAtPerPieceSeconds(updated, 1000), 50);
  assert.equal(resolveProcessAtPerPieceSeconds(updated, 3000), 50);
  assert.equal(resolveProcessAtCellState(updated, 1000).tone, 'provisional-extrapolated');
  assert.equal(resolveProcessAtPerPieceSeconds({ atV2Observations: [] }, 1000), null);
});

test('invalid or implausibly low large-quantity regression retains an empirical provisional estimate', () => {
  const base = { atModelVersion: 'v2', atV2Observations: [
    { assignmentPlanId: 1, quantity: 100, allocatedLaborInputSeconds: 6000 },
    { assignmentPlanId: 2, quantity: 200, allocatedLaborInputSeconds: 12000 },
  ], stBuckets: [{ bucketQuantity: 1000, bucketStSeconds: 100 }] };
  for (const atParams of [{ a: 1, b: 0 }, { a: 60, b: -5000 }, null]) {
    const process = { ...base, atParams };
    assert.equal(resolveProcessAtPerPieceSeconds(process, 1000), atParams?.a === 1 ? null : 60);
    assert.equal(resolveProcessAtCellState(process, 1000).tone, 'provisional-extrapolated');
  }
  assert.equal(calculateProcessDisplayAtTotalForOrderQuantity([base, { atV2Observations: [] }], 1000), null);
});
const DEFAULT_BUCKETS = [1, 3, 5, 10, 30, 50, 100, 300, 500, 1000, 3000, 5000, 10000];

const createProcess = ({
  at,
  a,
  b,
  version,
  trainedPeriod = '2026-03',
  attendanceFallbackShare = 1,
  observationCount,
  quantity = 1,
  timeRefQuantity = 1000,
  fitStatus = 'FITTED',
  isProvisional = false,
  distinctQuantityCount = 2,
  minQuantity = 500,
  maxQuantity = 1000,
}) => {
  const resolvedObservationCount = Math.max(1, Number(observationCount) || 1);
  const quantities = distinctQuantityCount > 1
    ? Array.from({ length: distinctQuantityCount }, (_, index) =>
        Math.round(
          minQuantity +
            ((maxQuantity - minQuantity) * index) /
              (distinctQuantityCount - 1)
        )
      )
    : [minQuantity];
  return {
    quantity,
    timeRefQuantity,
    at,
    atModelVersion: 'v2',
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
    atV2Observations: Array.from(
      { length: resolvedObservationCount },
      (_, index) => {
        const observedQuantity = quantities[index % quantities.length];
        return {
          assignmentPlanId: index + 1,
          quantity: observedQuantity,
          allocatedLaborInputSeconds:
            Number(a) * observedQuantity + Number(b),
          workerCount: 1,
          trainedPeriod,
        };
      }
    ),
    atParams: {
    a,
    b,
    version,
    trainedPeriod,
    attendanceCoverage: Math.max(0, 1 - attendanceFallbackShare),
    attendanceFallbackShare,
    observationCount,
    fitStatus,
    isProvisional,
    fallbackReason: isProvisional ? 'INSUFFICIENT_POINTS' : null,
    weightedPointCount: observationCount,
    distinctQuantityCount,
    distinctEventCount: 1,
    minQuantity,
    maxQuantity,
    minEventCount: 1,
    maxEventCount: 1,
    quantitySamples: [minQuantity, maxQuantity],
      eventCountSamples: [1],
    },
  };
};

test('more observations increase reliability even when attendance fallback remains high', () => {
  const februaryLike = createProcess({
    at: 67.4847,
    a: 3.4847,
    b: 64000,
    version: 35,
    observationCount: 2,
    attendanceFallbackShare: 1,
  });
  const marchLike = createProcess({
    at: 4.0237,
    a: 4.0074,
    b: 16.2857,
    version: 36,
    observationCount: 16,
    distinctQuantityCount: 3,
    attendanceFallbackShare: 1,
  });

  const februaryReliability = resolveProcessAtReliability(februaryLike, 500);
  const marchReliability = resolveProcessAtReliability(marchLike, 500);

  assert.ok(
    marchReliability.percent > februaryReliability.percent,
    `expected March reliability to exceed February (${marchReliability.percent} <= ${februaryReliability.percent})`
  );
  assert.notEqual(februaryReliability.status, AT_RELIABILITY_STATUS.COLLECTING);
  assert.notEqual(marchReliability.status, AT_RELIABILITY_STATUS.VERIFIED);
});

test('small samples stay low-confidence', () => {
  const samplePoor = createProcess({
    at: 42,
    a: 41,
    b: 1000,
    version: 1,
    observationCount: 1,
    attendanceFallbackShare: 0.5,
  });
  const reliability = resolveProcessAtReliability(samplePoor, 500);
  assert.ok(reliability.percent < 30, `expected low sample confidence, got ${reliability.percent}`);
});

test('mature observations across five quantities can become trusted', () => {
  const stableCandidate = createProcess({
    at: 88,
    a: 80,
    b: 8000,
    version: 4,
    observationCount: 24,
    attendanceFallbackShare: 0,
    distinctQuantityCount: 5,
  });
  const reliability = resolveProcessAtReliability(stableCandidate, 500);
  assert.equal(reliability.status, AT_RELIABILITY_STATUS.TRUSTED);
  assert.ok(reliability.percent >= 85, `expected trusted score, got ${reliability.percent}`);
});

test('attendance fallback lowers v2 reliability without discarding observations', () => {
  const actualAttendance = createProcess({
    a: 80,
    b: 8000,
    version: 4,
    observationCount: 24,
    attendanceFallbackShare: 0,
    distinctQuantityCount: 5,
  });
  const halfFallback = createProcess({
    a: 80,
    b: 8000,
    version: 4,
    observationCount: 24,
    attendanceFallbackShare: 0.5,
    distinctQuantityCount: 5,
  });
  const allFallback = createProcess({
    a: 80,
    b: 8000,
    version: 4,
    observationCount: 24,
    attendanceFallbackShare: 1,
    distinctQuantityCount: 5,
  });

  const actualReliability = resolveProcessAtReliability(actualAttendance, 500);
  const halfFallbackReliability = resolveProcessAtReliability(halfFallback, 500);
  const allFallbackReliability = resolveProcessAtReliability(allFallback, 500);

  assert.ok(actualReliability.percent > halfFallbackReliability.percent);
  assert.ok(halfFallbackReliability.percent > allFallbackReliability.percent);
  assert.equal(actualReliability.attendanceFallbackShare, 0);
  assert.equal(halfFallbackReliability.attendanceFallbackShare, 0.5);
  assert.equal(allFallbackReliability.attendanceFallbackShare, 1);
  assert.ok(allFallbackReliability.percent < 65);
});

test('style score retains mature weights but unsupported extrapolation cannot be trusted', () => {
  const styleReliability = resolveStyleAtReliability([
    createProcess({
      at: 90,
      a: 84,
      b: 6000,
      version: 4,
      observationCount: 24,
      attendanceFallbackShare: 0,
      distinctQuantityCount: 5,
      quantity: 2,
    }),
    createProcess({
      at: 35,
      a: 34,
      b: 1000,
      version: 1,
      observationCount: 1,
      attendanceFallbackShare: 1,
      quantity: 1,
    }),
  ]);

  assert.ok(styleReliability.percent >= 60, `expected mature process weight to dominate, got ${styleReliability.percent}`);
  assert.equal(styleReliability.status, AT_RELIABILITY_STATUS.INSUFFICIENT);
});

test('quantity diversity increases confidence without letting two quantities verify', () => {
  const twoQuantities = createProcess({
    a: 40,
    b: 4000,
    observationCount: 24,
    distinctQuantityCount: 2,
    attendanceFallbackShare: 0,
  });
  const fiveQuantities = createProcess({
    a: 40,
    b: 4000,
    observationCount: 24,
    distinctQuantityCount: 5,
    attendanceFallbackShare: 0,
  });

  const twoQuantityReliability = resolveProcessAtReliability(twoQuantities, 500);
  const fiveQuantityReliability = resolveProcessAtReliability(fiveQuantities, 500);
  assert.ok(fiveQuantityReliability.percent > twoQuantityReliability.percent);
  assert.ok(twoQuantityReliability.percent <= 55);
  assert.equal(fiveQuantityReliability.status, AT_RELIABILITY_STATUS.TRUSTED);
});

test('single-quantity AT estimates larger quantities provisionally without ST buckets', () => {
  const provisional = createProcess({
    a: 65,
    b: 0,
    observationCount: 1,
    fitStatus: 'USED_PROVISIONAL',
    isProvisional: true,
    distinctQuantityCount: 1,
    minQuantity: 675,
    maxQuantity: 675,
  });

  const observedCell = resolveProcessAtCellState(provisional, 500, DEFAULT_BUCKETS);
  const outsideCell = resolveProcessAtCellState(provisional, 1000, DEFAULT_BUCKETS);

  assert.equal(resolveStBucketQuantity(675, DEFAULT_BUCKETS), 500);
  assert.equal(observedCell.tone, 'provisional-extrapolated');
  assert.equal(observedCell.shouldDisplayValue, true);
  assert.equal(resolveProcessAtDisplayPerPieceSeconds(provisional, 500, DEFAULT_BUCKETS), 65);
  assert.equal(outsideCell.tone, 'provisional-extrapolated');
  assert.equal(outsideCell.shouldDisplayValue, true);
  assert.equal(resolveProcessAtDisplayPerPieceSeconds(provisional, 1000, DEFAULT_BUCKETS), 65);
  assert.equal(resolveProcessAtPerPieceSeconds(provisional, 1000), 65);
  assert.equal(
    resolveProcessAtDisplayPerPieceSeconds(provisional, 1000),
    65,
    'empirical large-quantity estimates do not require ST buckets'
  );
});

test('AT v2 preserves exact observations and no longer refuses distant large extrapolation', () => {
  const process = {
    atModelVersion: 'v2',
    atV2Observations: [
      {
        assignmentPlanId: 328,
        quantity: 300,
        allocatedLaborInputSeconds: 8589.03306109015,
      },
      {
        assignmentPlanId: 334,
        quantity: 200,
        allocatedLaborInputSeconds: 7111.376615904082,
      },
    ],
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 105,
    })),
  };

  assert.ok(
    Math.abs(resolveProcessAtPerPieceSeconds(process, 200) - 35.5568830795) <
      0.0001
  );
  assert.ok(
    Math.abs(resolveProcessAtPerPieceSeconds(process, 300) - 28.6301102036) <
      0.0001
  );
  assert.equal(
    resolveProcessAtCellState(process, 200, DEFAULT_BUCKETS).tone,
    'provisional'
  );
  // A quantity far past the largest observed batch (300) used to be refused
  // outright past 4x that (1,200). A customer's larger repeat order should
  // still get an estimate - low-confidence, but not nothing - so this no
  // longer returns null. This process has no fitted atParams.a/b (only raw
  // observations), so it falls back to the largest observed point's flat
  // per-piece rate rather than a true regression extrapolation; see the
  // dedicated 'evaluates the fitted regression' test below for that path.
  const distantCell = resolveProcessAtCellState(process, 10000, DEFAULT_BUCKETS);
  assert.equal(distantCell.shouldDisplayValue, true);
  assert.equal(distantCell.tone, 'provisional-extrapolated');
});

test('v2 rejects a decreasing total-time interpolation segment', () => {
  const process = {
    atV2Observations: [
      {
        assignmentPlanId: 1,
        quantity: 200,
        allocatedLaborInputSeconds: 9000,
      },
      {
        assignmentPlanId: 2,
        quantity: 300,
        allocatedLaborInputSeconds: 8000,
      },
    ],
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
  };

  assert.equal(resolveProcessAtPerPieceSeconds(process, 250), null);
  assert.equal(
    resolveProcessAtCellState(process, 250, DEFAULT_BUCKETS).shouldDisplayValue,
    false
  );
});

test('AJ2102-like increasing observations fall back to the constrained flat boundary', () => {
  const process = {
    atV2Observations: [
      {
        assignmentPlanId: 334,
        quantity: 200,
        allocatedLaborInputSeconds: 6930.2,
      },
      {
        assignmentPlanId: 328,
        quantity: 300,
        allocatedLaborInputSeconds: 11517.54,
      },
    ],
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
  };

  const pooledAt =
    (Math.sqrt(200 / 250) * (6930.2 / 200) +
      Math.sqrt(300 / 250) * (11517.54 / 300)) /
    (Math.sqrt(200 / 250) + Math.sqrt(300 / 250));
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 200) - pooledAt) < 0.0001);
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 250) - pooledAt) < 0.0001);
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 300) - pooledAt) < 0.0001);
  assert.equal(
    resolveProcessAtCellState(process, 250, DEFAULT_BUCKETS).tone,
    'provisional'
  );
});

test('constrained AT curve decreases smoothly when observations support quantity efficiency', () => {
  const process = {
    atV2Observations: [
      { assignmentPlanId: 1, quantity: 100, allocatedLaborInputSeconds: 5000 },
      { assignmentPlanId: 2, quantity: 200, allocatedLaborInputSeconds: 7000 },
      { assignmentPlanId: 3, quantity: 500, allocatedLaborInputSeconds: 15000 },
    ],
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
  };

  const at100 = resolveProcessAtPerPieceSeconds(process, 100);
  const at200 = resolveProcessAtPerPieceSeconds(process, 200);
  const at300 = resolveProcessAtPerPieceSeconds(process, 300);
  const at500 = resolveProcessAtPerPieceSeconds(process, 500);
  assert.ok(at100 > at200);
  assert.ok(at200 > at300);
  assert.ok(at300 > at500);
});

test('Plan-level attendance and allocation quality reduce a noisy observation influence', () => {
  const baseObservations = [
    { assignmentPlanId: 1, quantity: 100, allocatedLaborInputSeconds: 5000 },
    { assignmentPlanId: 2, quantity: 200, allocatedLaborInputSeconds: 8000 },
    { assignmentPlanId: 3, quantity: 500, allocatedLaborInputSeconds: 15000 },
  ];
  const noisyObservation = {
    assignmentPlanId: 4,
    quantity: 200,
    allocatedLaborInputSeconds: 16000,
  };
  const buildProcess = (quality) => ({
    atV2Observations: [
      ...baseObservations,
      { ...noisyObservation, ...quality },
    ],
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
  });

  const unqualifiedAt = resolveProcessAtPerPieceSeconds(buildProcess({}), 200);
  const qualityWeightedAt = resolveProcessAtPerPieceSeconds(
    buildProcess({ attendanceCoverage: 0, singleProcessLaborShare: 1 }),
    200
  );
  assert.ok(qualityWeightedAt < unqualifiedAt);
});

test('v2 model status distinguishes supported curves from provisional curves', () => {
  const process = {
    atV2Observations: [100, 100, 200, 500, 500].map((quantity, index) => ({
      assignmentPlanId: index + 1,
      quantity,
      allocatedLaborInputSeconds: quantity * (30 + 2000 / quantity),
      attendanceCoverage: 1,
      singleProcessLaborShare: 0,
    })),
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
  };
  const state = resolveProcessAtCellState(process, 200, DEFAULT_BUCKETS);
  assert.equal(state.tone, 'fitted');
  assert.equal(state.modelStatus, 'SUPPORTED_CURVE');
});

test('near extrapolation uses the nearest constrained fitted AT', () => {
  const process = {
    atV2Observations: [
      {
        assignmentPlanId: 334,
        quantity: 200,
        allocatedLaborInputSeconds: 6930.2,
      },
      {
        assignmentPlanId: 328,
        quantity: 300,
        allocatedLaborInputSeconds: 11517.54,
      },
    ],
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
  };

  const pooledAt =
    (Math.sqrt(200 / 250) * (6930.2 / 200) +
      Math.sqrt(300 / 250) * (11517.54 / 300)) /
    (Math.sqrt(200 / 250) + Math.sqrt(300 / 250));
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 100) - pooledAt) < 0.0001);
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 500) - pooledAt) < 0.0001);
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 1000) - pooledAt) < 0.0001);
  // No fitted atParams.a/b on this process, and the upper side no longer has
  // a hard cutoff - a quantity far past the largest observed batch (300)
  // falls back to the same pooled flat rate as 1,000 above, instead of null.
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 1201) - pooledAt) < 0.0001);
  assert.equal(
    resolveProcessAtCellState(process, 500, DEFAULT_BUCKETS).tone,
    'provisional-extrapolated'
  );
});

test('v2 extrapolates in both directions without quantity cutoffs', () => {
  const process = createProcess({
    a: 30,
    b: 3000,
    observationCount: 4,
    distinctQuantityCount: 2,
    minQuantity: 200,
    maxQuantity: 300,
  });

  // Downward extrapolation is unchanged: still frozen at the smallest
  // observed point below the range, still refused past half that quantity.
  assert.ok(resolveProcessAtPerPieceSeconds(process, 100) > 0);
  assert.ok(Math.abs(resolveProcessAtPerPieceSeconds(process, 99) - (30 + 3000 / 99)) < 1e-6);

  // Upward: a quantity far past the largest observed batch (300) must not
  // be refused any more (a customer's larger repeat order should still get
  // an estimate), and the value must come from the fitted regression
  // (atParams a=30/b=3000), not a flat copy of the largest observed point's
  // per-piece rate (which this style's own points would put at
  // (30*300+3000)/300 = 40 for every quantity past 300 under the old
  // behaviour).
  const flatCopyValueIfUnfixed = 40;
  const at1200 = resolveProcessAtPerPieceSeconds(process, 1200);
  const at1201 = resolveProcessAtPerPieceSeconds(process, 1201);
  const atFarBeyondFourfold = resolveProcessAtPerPieceSeconds(process, 100000);
  assert.ok(Math.abs(at1200 - (30 * 1200 + 3000) / 1200) < 0.0001);
  assert.ok(Math.abs(at1201 - (30 * 1201 + 3000) / 1201) < 0.0001);
  assert.notEqual(at1200, flatCopyValueIfUnfixed);
  // No longer refused at 4x the largest observed batch (1,200) or far beyond it.
  assert.ok(Number.isFinite(at1201) && at1201 > 0);
  assert.ok(Number.isFinite(atFarBeyondFourfold) && atFarBeyondFourfold > 0);
  // As quantity grows, the per-piece estimate keeps sliding toward the
  // fitted marginal rate (a) instead of staying flat - proof this is a real
  // regression evaluation, not a frozen copy.
  assert.ok(atFarBeyondFourfold < at1201);
  assert.ok(Math.abs(atFarBeyondFourfold - 30) < 0.1);
});

test('a never-produced large quantity keeps reflecting newly-refined data instead of freezing', () => {
  // The exact complaint this fixes: batches for a style never got close to
  // 1,000, so every added work record kept landing on the same handful of
  // small assignments - the q=1000 estimate used to be a flat copy of the
  // largest observed point and never moved no matter how much more data
  // came in for those same batches. Once a/b is refined by more
  // observations (even ones that never touch 1,000 directly), q=1000 must
  // change too, because it is now evaluated live against the current fit.
  const beforeMoreData = createProcess({
    a: 34,
    b: 4200,
    observationCount: 4,
    distinctQuantityCount: 2,
    minQuantity: 200,
    maxQuantity: 300,
  });
  const afterMoreData = createProcess({
    a: 28,
    b: 3600,
    observationCount: 10,
    distinctQuantityCount: 3,
    minQuantity: 200,
    maxQuantity: 300,
  });

  const before = resolveProcessAtPerPieceSeconds(beforeMoreData, 1000);
  const after = resolveProcessAtPerPieceSeconds(afterMoreData, 1000);
  assert.ok(Number.isFinite(before) && before > 0);
  assert.ok(Number.isFinite(after) && after > 0);
  assert.notEqual(before, after);
  assert.ok(Math.abs(before - (34 * 1000 + 4200) / 1000) < 0.0001);
  assert.ok(Math.abs(after - (28 * 1000 + 3600) / 1000) < 0.0001);
});

test('repeat variation lowers data maturity without discarding observations', () => {
  const buildProcess = (repeatedValues) => ({
    atV2Observations: [
      ...repeatedValues.map((perPieceSeconds, index) => ({
        assignmentPlanId: index + 1,
        quantity: 100,
        allocatedLaborInputSeconds: perPieceSeconds * 100,
      })),
      ...[200, 300, 400, 500].map((quantity, index) => ({
        assignmentPlanId: repeatedValues.length + index + 1,
        quantity,
        allocatedLaborInputSeconds: 40 * quantity,
      })),
    ],
    stBuckets: DEFAULT_BUCKETS.map((bucketQuantity) => ({
      bucketQuantity,
      bucketStSeconds: 100,
    })),
  });
  const stable = resolveProcessAtReliability(buildProcess([39, 40, 41]), 300);
  const variable = resolveProcessAtReliability(buildProcess([20, 40, 60]), 300);

  assert.ok(variable.percent < stable.percent);
  assert.ok(variable.repeatVariationPenalty > stable.repeatVariationPenalty);
  assert.ok(variable.repeatVariationCoefficient > stable.repeatVariationCoefficient);
});

test('legacy v1 atParams are never used as an operational AT fallback', () => {
  const legacyOnly = createProcess({
    a: 21,
    b: 6700,
    observationCount: 4,
  });
  delete legacyOnly.atV2Observations;

  assert.equal(resolveProcessAtPerPieceSeconds(legacyOnly, 500), null);
  assert.equal(
    resolveProcessAtCellState(legacyOnly, 500, DEFAULT_BUCKETS).tone,
    'empty'
  );
  assert.equal(
    resolveProcessAtReliability(legacyOnly, 500).status,
    AT_RELIABILITY_STATUS.COLLECTING
  );
});

test('v2 extrapolates beyond the former lower boundary', () => {
  const fitted = createProcess({
    a: 21,
    b: 67,
    observationCount: 2,
    fitStatus: 'FITTED',
    isProvisional: false,
    distinctQuantityCount: 2,
    minQuantity: 510,
    maxQuantity: 675,
  });

  const onePieceAt = resolveProcessAtDisplayPerPieceSeconds(fitted, 1, DEFAULT_BUCKETS);
  const thousandPieceAt = resolveProcessAtDisplayPerPieceSeconds(fitted, 1000, DEFAULT_BUCKETS);

  assert.equal(resolveProcessAtCellState(fitted, 1, DEFAULT_BUCKETS).shouldDisplayValue, true);
  assert.equal(resolveProcessAtCellState(fitted, 1000, DEFAULT_BUCKETS).shouldDisplayValue, true);
  assert.ok(onePieceAt >= thousandPieceAt);
  assert.ok(thousandPieceAt > 0);
});

test('actual q stays unbucketed for AT math even inside the same display bucket', () => {
  const fitted = createProcess({
    a: 21,
    b: 6700,
    observationCount: 4,
    minQuantity: 510,
    maxQuantity: 675,
  });

  assert.equal(resolveStBucketQuantity(510, DEFAULT_BUCKETS), 500);
  assert.equal(resolveStBucketQuantity(675, DEFAULT_BUCKETS), 500);
  assert.notEqual(
    resolveProcessAtPerPieceSeconds(fitted, 510),
    resolveProcessAtPerPieceSeconds(fitted, 675)
  );
});

test('style total includes the provisional large-quantity estimate', () => {
  const provisional = createProcess({
    a: 65,
    b: 0,
    observationCount: 1,
    fitStatus: 'USED_PROVISIONAL',
    isProvisional: true,
    distinctQuantityCount: 1,
    minQuantity: 675,
    maxQuantity: 675,
  });
  const fitted = createProcess({
    a: 21,
    b: 6700,
    observationCount: 4,
    minQuantity: 510,
    maxQuantity: 675,
  });

  assert.equal(
    calculateProcessDisplayAtTotalForOrderQuantity(
      [provisional, fitted],
      1000,
      DEFAULT_BUCKETS
    ),
     92700
  );
  assert.equal(
    calculateProcessDisplayAtTotalForOrderQuantity(
      [provisional, fitted],
      500,
      DEFAULT_BUCKETS
    ),
    resolveProcessAtPerPieceSeconds(provisional, 500) * 500 +
      resolveProcessAtPerPieceSeconds(fitted, 500) * 500
  );
});


test('all positive quantities preserve nonincreasing per-piece AT across observed boundaries', () => {
  for (const distinctQuantityCount of [1, 3]) {
    const process = createProcess({ a: 30, b: 3000, observationCount: 12, distinctQuantityCount, minQuantity: 200, maxQuantity: 600 });
    const original = JSON.stringify(process);
    let previous = Infinity;
    for (const quantity of [1, 10, 99, 100, 199, 200, 201, 300, 400, 599, 600, 601, 1000, 3000]) {
      const value = resolveProcessAtPerPieceSeconds(process, quantity);
      assert.ok(value > 0 && value <= previous + 1e-6);
      previous = value;
    }
    assert.equal(JSON.stringify(process), original);
  }
});

test('shared small-batch regularization reaches displayed AT and quotation totals', () => {
  const process = { atV2Observations: [], atSharedPrediction: {
    version: 'shared-at-v1', a: 50, b: 10000, smallQuantityBoundary: 100,
    source: 'CATEGORY_PRIOR', isProvisional: false,
  }};
  assert.equal(resolveProcessAtPerPieceSeconds(process, 1), 249);
  assert.equal(resolveProcessAtPerPieceSeconds(process, 10), 240);
  assert.equal(resolveProcessAtPerPieceSeconds(process, 100), 150);
  assert.equal(resolveProcessAtPerPieceSeconds(process, 1000), 60);
  assert.equal(resolveProcessAtCellState(process, 10).isProvisional, true);
  assert.equal(calculateProcessDisplayAtTotalForOrderQuantity([process], 10), 2400);
});
