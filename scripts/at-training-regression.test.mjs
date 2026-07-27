import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import atTraining from '../backend/dist/services/atTraining.js';
import atTrainingOverlap from '../backend/dist/services/atTrainingOverlap.js';

const { fitAtParamsWithProportionalAllocation } = atTraining;
const {
  createAtTrainingOverlapState,
  parseAtTrainingWorkerDateKey,
  registerAtTrainingWorkerDayClaim,
  toAtTrainingWorkerDateKey,
} = atTrainingOverlap;

const backendSource = fs.readFileSync('backend/src/index.ts', 'utf8');

test('AT mutations are not reported as failed when derived assignment-card refresh fails', () => {
  const helperStart = backendSource.indexOf(
    'const refreshAssignmentCardsAfterAtChange = async'
  );
  const helperEnd = backendSource.indexOf('type AtSyncRunOptions', helperStart);
  const helperSource = backendSource.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0);
  assert.match(helperSource, /try \{/);
  assert.match(helperSource, /rebuildAssignmentCardsForOrgIds/);
  assert.match(helperSource, /catch \(error\)/);
  assert.match(helperSource, /assignmentCardsRefreshed: false/);

  const resetStart = backendSource.indexOf('const resetAtTrainingStateForOrg');
  const resetEnd = backendSource.indexOf('const normalizeStylePayload', resetStart);
  const resetSource = backendSource.slice(resetStart, resetEnd);
  assert.match(resetSource, /await prisma\.\$transaction/);
  assert.match(resetSource, /refreshAssignmentCardsAfterAtChange/);
  assert.match(resetSource, /return \{ \.\.\.result, \.\.\.assignmentCardRefresh \}/);
});

test('overlapping worker-day excludes every claiming WorkLog worker bucket', () => {
  const state = createAtTrainingOverlapState();
  registerAtTrainingWorkerDayClaim({
    state,
    workerDateKey: toAtTrainingWorkerDateKey('2026-06-05', 7),
    bucketKey: '101:7',
  });
  registerAtTrainingWorkerDayClaim({
    state,
    workerDateKey: toAtTrainingWorkerDateKey('2026-06-05', 7),
    bucketKey: '202:7',
  });

  assert.deepEqual([...state.ambiguousWorkerDateKeys], ['2026-06-05::7']);
  assert.deepEqual([...state.ambiguousBucketKeys].sort(), ['101:7', '202:7']);
  assert.deepEqual(parseAtTrainingWorkerDateKey([...state.ambiguousWorkerDateKeys][0]), {
    workDate: '2026-06-05',
    workerId: 7,
  });
});

test('different workers on the same date remain independent', () => {
  const state = createAtTrainingOverlapState();
  registerAtTrainingWorkerDayClaim({
    state,
    workerDateKey: toAtTrainingWorkerDateKey('2026-06-05', 7),
    bucketKey: '101:7',
  });
  registerAtTrainingWorkerDayClaim({
    state,
    workerDateKey: toAtTrainingWorkerDateKey('2026-06-05', 8),
    bucketKey: '202:8',
  });

  assert.equal(state.ambiguousWorkerDateKeys.size, 0);
  assert.equal(state.ambiguousBucketKeys.size, 0);
});

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

test('worker-scoped buckets do not allocate one worker labor to another worker process', () => {
  const result = fitAtParamsWithProportionalAllocation([
    {
      dayKey: '2026-06-30#worker:1',
      order: 0,
      laborInputSeconds: 10_000,
      processRows: [{
        metricKey,
        quantity: 100,
        eventCount: 1,
        sourceGroupKey: 'assignmentPlan:501',
      }],
    },
    {
      dayKey: '2026-06-30#worker:2',
      order: 1,
      laborInputSeconds: 20_000,
      processRows: [{
        metricKey: siblingMetricKey,
        quantity: 100,
        eventCount: 1,
        sourceGroupKey: 'assignmentPlan:502',
      }],
    },
  ]);

  assert.equal(result.paramsByMetric.get(metricKey)?.a, 100);
  assert.equal(result.paramsByMetric.get(siblingMetricKey)?.a, 200);
});
