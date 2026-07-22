import test from 'node:test';
import assert from 'node:assert/strict';
import atTraining from '../backend/dist/services/atTraining.js';

const { fitAtParamsWithProportionalAllocation } = atTraining;

const metricKey = 'STYLE_PROCESS:1';

const createDay = ({ dayKey, order, quantity, laborInputSeconds, sourceGroupKey }) => ({
  dayKey,
  order,
  laborInputSeconds,
  processRows: [
    {
      metricKey,
      quantity,
      eventCount: 1,
      sourceGroupKey,
    },
  ],
});

test('split production from one assignment does not create an AT curve', () => {
  const result = fitAtParamsWithProportionalAllocation([
    createDay({
      dayKey: '2026-06-30#1',
      order: 0,
      quantity: 60,
      laborInputSeconds: 7000,
      sourceGroupKey: 'assignmentPlan:42',
    }),
    createDay({
      dayKey: '2026-07-31#2',
      order: 1,
      quantity: 40,
      laborInputSeconds: 5000,
      sourceGroupKey: 'assignmentPlan:42',
    }),
  ]);

  const fitted = result.paramsByMetric.get(metricKey);
  assert.ok(fitted);
  assert.equal(fitted.fitStatus, 'USED_PROVISIONAL');
  assert.equal(fitted.fallbackReason, 'INSUFFICIENT_INDEPENDENT_SOURCES');
  assert.equal(fitted.isProvisional, true);
  assert.equal(fitted.b, 0);
  assert.equal(fitted.distinctQuantityCount, 2);
  assert.equal(fitted.distinctSourceGroupCount, 1);
});

test('matching quantity variation from independent assignments can create an AT curve', () => {
  const result = fitAtParamsWithProportionalAllocation([
    createDay({
      dayKey: '2026-06-30#1',
      order: 0,
      quantity: 60,
      laborInputSeconds: 7000,
      sourceGroupKey: 'assignmentPlan:42',
    }),
    createDay({
      dayKey: '2026-07-31#2',
      order: 1,
      quantity: 40,
      laborInputSeconds: 5000,
      sourceGroupKey: 'assignmentPlan:43',
    }),
  ]);

  const fitted = result.paramsByMetric.get(metricKey);
  assert.ok(fitted);
  assert.equal(fitted.fitStatus, 'FITTED');
  assert.equal(fitted.isProvisional, false);
  assert.equal(fitted.distinctQuantityCount, 2);
  assert.equal(fitted.distinctSourceGroupCount, 2);
  assert.equal(fitted.a, 100);
  assert.equal(fitted.b, 1000);
});

test('missing source keys are not treated as independent observations', () => {
  const result = fitAtParamsWithProportionalAllocation([
    createDay({
      dayKey: '2026-06-30#1',
      order: 0,
      quantity: 60,
      laborInputSeconds: 7000,
      sourceGroupKey: null,
    }),
    createDay({
      dayKey: '2026-07-31#2',
      order: 1,
      quantity: 40,
      laborInputSeconds: 5000,
      sourceGroupKey: null,
    }),
  ]);

  const fitted = result.paramsByMetric.get(metricKey);
  assert.ok(fitted);
  assert.equal(fitted.fitStatus, 'USED_PROVISIONAL');
  assert.equal(fitted.fallbackReason, 'INSUFFICIENT_INDEPENDENT_SOURCES');
  assert.equal(fitted.distinctQuantityCount, 2);
  assert.equal(fitted.distinctSourceGroupCount, 1);
  assert.equal(fitted.b, 0);
});

test('records without assignment plans stay grouped by process for fitting', () => {
  const result = fitAtParamsWithProportionalAllocation([
    createDay({
      dayKey: '2026-06-30#1',
      order: 0,
      quantity: 60,
      laborInputSeconds: 7000,
      sourceGroupKey: 'missingAssignmentPlan:process:1',
    }),
    createDay({
      dayKey: '2026-07-31#2',
      order: 1,
      quantity: 40,
      laborInputSeconds: 5000,
      sourceGroupKey: 'missingAssignmentPlan:process:1',
    }),
  ]);

  const fitted = result.paramsByMetric.get(metricKey);
  assert.ok(fitted);
  assert.equal(fitted.fitStatus, 'USED_PROVISIONAL');
  assert.equal(fitted.fallbackReason, 'INSUFFICIENT_INDEPENDENT_SOURCES');
  assert.equal(fitted.distinctSourceGroupCount, 1);
});
