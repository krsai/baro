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
  code += '\nmodule.exports = { applyMonotonicStBucketEdit, resolveStBucketQuantity };';
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

const { applyMonotonicStBucketEdit, resolveStBucketQuantity } = loadProcessTimeModule();

const buckets = (values) =>
  values.map(([bucketQuantity, bucketStSeconds]) => ({
    bucketQuantity,
    bucketStSeconds,
  }));

const compact = (values) =>
  values.map(({ bucketQuantity, bucketStSeconds }) => [
    bucketQuantity,
    bucketStSeconds,
  ]);

test('lowering a middle ST bucket also lowers larger buckets that would violate the rule', () => {
  const result = applyMonotonicStBucketEdit(
    buckets([[1, 120], [3, 100], [5, 90], [10, 80], [30, 70]]),
    5,
    60
  );

  assert.deepEqual(compact(result.stBuckets), [
    [1, 120],
    [3, 100],
    [5, 60],
    [10, 60],
    [30, 60],
  ]);
  assert.deepEqual(result.changedQuantities, [5, 10, 30]);
});

test('raising a middle ST bucket also raises smaller buckets that would violate the rule', () => {
  const result = applyMonotonicStBucketEdit(
    buckets([[1, 120], [3, 100], [5, 90], [10, 80], [30, 70]]),
    10,
    110
  );

  assert.deepEqual(compact(result.stBuckets), [
    [1, 120],
    [3, 110],
    [5, 110],
    [10, 110],
    [30, 70],
  ]);
  assert.deepEqual(result.changedQuantities, [3, 5, 10]);
});

test('editing a process repairs existing ST inversions on both sides of the edited bucket', () => {
  const result = applyMonotonicStBucketEdit(
    buckets([[1, 100], [3, 80], [5, 90], [10, 70], [30, 75]]),
    5,
    85
  );

  assert.deepEqual(compact(result.stBuckets), [
    [1, 100],
    [3, 85],
    [5, 85],
    [10, 70],
    [30, 70],
  ]);
  assert.deepEqual(result.changedQuantities, [3, 5, 30]);
});

test('customer-specific bucket boundaries are resolved from the supplied set', () => {
  assert.equal(resolveStBucketQuantity(2, [1, 3, 5, 10]), 1);
  assert.equal(resolveStBucketQuantity(2, [1, 2, 5, 7, 10]), 2);
  assert.equal(resolveStBucketQuantity(2500, [1000, 2000, 3000]), 2000);
});

test('invalid or empty operational bucket sets stay unresolved instead of using global defaults', () => {
  assert.equal(resolveStBucketQuantity(100, []), null);
  assert.equal(resolveStBucketQuantity(100, [0, -1]), null);
  assert.equal(resolveStBucketQuantity(100), null);
});
