import test from 'node:test';
import assert from 'node:assert/strict';
import atTraining from '../backend/dist/services/atTraining.js';

const { fitAtParamsWithProportionalAllocation } = atTraining;

const metricKey = 'STYLE_PROCESS:1';
const siblingMetricKey = 'STYLE_PROCESS:2';
const thirdMetricKey = 'STYLE_PROCESS:3';

const createDay = ({
  dayKey,
  order,
  quantity,
  laborInputSeconds,
  sourceGroupKey,
  eventCount = 1,
}) => ({
  dayKey,
  order,
  laborInputSeconds,
  processRows: [
    {
      metricKey,
      quantity,
      eventCount,
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

test('implausibly low fitted params are rejected instead of saved as curves', () => {
  const result = fitAtParamsWithProportionalAllocation([
    createDay({
      dayKey: '2026-04-30#1',
      order: 0,
      quantity: 120,
      eventCount: 26,
      laborInputSeconds: 9,
      sourceGroupKey: 'assignmentPlan:309',
    }),
    createDay({
      dayKey: '2026-06-30#2',
      order: 1,
      quantity: 100,
      eventCount: 27,
      laborInputSeconds: 8,
      sourceGroupKey: 'assignmentPlan:336',
    }),
  ], {
    initialPerPieceByMetricKey: new Map([[metricKey, 70]]),
  });

  assert.equal(result.paramsByMetric.has(metricKey), false);
  assert.equal(result.diagnostics.statusCounts.IMPLAUSIBLY_LOW_AT_PARAMS, 1);
});

test('rejected process fits reset their allocation seed instead of leaking time to siblings', () => {
  const initialSeeds = new Map([
    [metricKey, 135.08326770064136],
    [siblingMetricKey, 58.245791054996545],
    [thirdMetricKey, 131.86414378465648],
  ]);

  const result = fitAtParamsWithProportionalAllocation([
    {
      dayKey: '2026-04-30#1',
      order: 0,
      laborInputSeconds: 82269,
      processRows: [
        {
          metricKey,
          quantity: 301,
          eventCount: 12,
          sourceGroupKey: 'assignmentPlan:100',
        },
        {
          metricKey: siblingMetricKey,
          quantity: 242,
          eventCount: 21,
          sourceGroupKey: 'assignmentPlan:101',
        },
        {
          metricKey: thirdMetricKey,
          quantity: 434,
          eventCount: 11,
          sourceGroupKey: 'assignmentPlan:102',
        },
      ],
    },
    {
      dayKey: '2026-05-31#2',
      order: 1,
      laborInputSeconds: 137209,
      processRows: [
        {
          metricKey,
          quantity: 453,
          eventCount: 27,
          sourceGroupKey: 'assignmentPlan:110',
        },
        {
          metricKey: siblingMetricKey,
          quantity: 151,
          eventCount: 33,
          sourceGroupKey: 'assignmentPlan:111',
        },
        {
          metricKey: thirdMetricKey,
          quantity: 396,
          eventCount: 34,
          sourceGroupKey: 'assignmentPlan:112',
        },
      ],
    },
    {
      dayKey: '2026-06-30#3',
      order: 2,
      laborInputSeconds: 105549,
      processRows: [
        {
          metricKey,
          quantity: 100,
          eventCount: 25,
          sourceGroupKey: 'assignmentPlan:120',
        },
        {
          metricKey: siblingMetricKey,
          quantity: 469,
          eventCount: 18,
          sourceGroupKey: 'assignmentPlan:121',
        },
        {
          metricKey: thirdMetricKey,
          quantity: 316,
          eventCount: 26,
          sourceGroupKey: 'assignmentPlan:122',
        },
      ],
    },
  ], {
    initialPerPieceByMetricKey: initialSeeds,
  });

  assert.equal(result.diagnostics.resetMetricCount, 1);
  assert.ok(result.diagnostics.rejectedMetricCount >= 1);

  const rejected = result.paramsByMetric.get(siblingMetricKey);
  assert.ok(rejected);
  assert.equal(rejected.fitStatus, 'USED_PROVISIONAL');
  assert.equal(rejected.fallbackReason, 'NEGATIVE_OR_INVALID_PARAMS');

  const stableSibling = result.paramsByMetric.get(metricKey);
  assert.ok(stableSibling);
  assert.equal(stableSibling.fitStatus, 'FITTED');
  assert.ok(
    stableSibling.a < initialSeeds.get(metricKey) * 2,
    `expected sibling fit to stay bounded, got a=${stableSibling.a}`
  );
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
