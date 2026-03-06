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
    '\nmodule.exports = { AT_RELIABILITY_STATUS, resolveProcessAtReliability, resolveStyleAtReliability };';
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
  resolveProcessAtReliability,
  resolveStyleAtReliability,
} = loadProcessTimeModule();

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
  assert.equal(februaryReliability.status, AT_RELIABILITY_STATUS.FALLBACK);
  assert.equal(marchReliability.status, AT_RELIABILITY_STATUS.LEARNING);
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
  assert.equal(reliability.status, AT_RELIABILITY_STATUS.STABLE);
  assert.ok(reliability.percent >= 78, `expected stable score, got ${reliability.percent}`);
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
  assert.equal(styleReliability.status, AT_RELIABILITY_STATUS.LEARNING);
});
