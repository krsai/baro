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
}) => ({
  quantity,
  timeRefQuantity,
  at,
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
});

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
    attendanceFallbackShare: 1,
  });

  const februaryReliability = resolveProcessAtReliability(februaryLike);
  const marchReliability = resolveProcessAtReliability(marchLike);

  assert.ok(
    marchReliability.percent > februaryReliability.percent,
    `expected March reliability to exceed February (${marchReliability.percent} <= ${februaryReliability.percent})`
  );
  assert.equal(februaryReliability.status, AT_RELIABILITY_STATUS.UNRELIABLE);
  assert.equal(marchReliability.status, AT_RELIABILITY_STATUS.UNRELIABLE);
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
  const reliability = resolveProcessAtReliability(samplePoor);
  assert.ok(reliability.percent < 30, `expected low sample confidence, got ${reliability.percent}`);
});

test('mature fully-covered samples can become stable', () => {
  const stableCandidate = createProcess({
    at: 88,
    a: 80,
    b: 8000,
    version: 4,
    observationCount: 24,
    attendanceFallbackShare: 0,
  });
  const reliability = resolveProcessAtReliability(stableCandidate);
  assert.equal(reliability.status, AT_RELIABILITY_STATUS.VERIFIED);
  assert.ok(reliability.percent >= 95, `expected verified score, got ${reliability.percent}`);
});

test('style reliability is weighted upward when mature processes dominate', () => {
  const styleReliability = resolveStyleAtReliability([
    createProcess({
      at: 90,
      a: 84,
      b: 6000,
      version: 4,
      observationCount: 24,
      attendanceFallbackShare: 0,
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

test('provisional AT only displays in the observed quantity bucket', () => {
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
  assert.equal(observedCell.tone, 'provisional');
  assert.equal(observedCell.shouldDisplayValue, true);
  assert.equal(resolveProcessAtDisplayPerPieceSeconds(provisional, 500, DEFAULT_BUCKETS), 65);
  assert.equal(outsideCell.tone, 'provisional-extrapolated');
  assert.equal(outsideCell.shouldDisplayValue, false);
  assert.equal(resolveProcessAtDisplayPerPieceSeconds(provisional, 1000, DEFAULT_BUCKETS), null);
  assert.equal(resolveProcessAtPerPieceSeconds(provisional, 1000), 65);
  assert.equal(
    resolveProcessAtDisplayPerPieceSeconds(provisional, 1000),
    null,
    'provisional AT must not be extrapolated when the active bucket set is missing'
  );
});

test('fitted low-confidence AT remains displayable across buckets', () => {
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
  assert.ok(onePieceAt > thousandPieceAt);
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

test('display total is unavailable when any process is missing at the rendered bucket', () => {
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
    null
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
