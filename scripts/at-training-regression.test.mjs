import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import atTraining from '../backend/dist/services/atTraining.js';
import atTrainingOverlap from '../backend/dist/services/atTrainingOverlap.js';
import { runRefreshTasks } from '../frontend/src/utils/refreshTasks.mjs';

const { fitAtParamsWithProportionalAllocation } = atTraining;
const {
  createAtTrainingOverlapState,
  parseAtTrainingWorkerDateKey,
  registerAtTrainingWorkerDayClaim,
  toAtTrainingWorkerDateKey,
} = atTrainingOverlap;

const backendSource = fs.readFileSync('backend/src/index.ts', 'utf8');

test('AT mutations do not rebuild ST-based assignment cards', () => {
  const applyStart = backendSource.indexOf(
    'const applyAtTrainingResultsToStyleProcesses'
  );
  const resetStart = backendSource.indexOf('const resetAtTrainingStateForOrg');
  const resetEnd = backendSource.indexOf('const normalizeStylePayload', resetStart);
  const atMutationSource = backendSource.slice(applyStart, resetEnd);
  const resetSource = backendSource.slice(resetStart, resetEnd);
  assert.ok(applyStart >= 0);
  assert.match(resetSource, /await prisma\.\$transaction/);
  assert.doesNotMatch(atMutationSource, /rebuildAssignmentCardsForOrgIds/);
  assert.doesNotMatch(atMutationSource, /refreshAssignmentCardsAfterAtChange/);
  assert.match(resetSource, /return result/);
});

test('AT sync fail-closed paths clear stale v2 observations', () => {
  const syncStart = backendSource.indexOf(
    'export const syncStyleProcessActualTimesFromWorkRecords'
  );
  const syncEnd = backendSource.indexOf(
    'const resetAtTrainingStateForOrg',
    syncStart
  );
  const syncSource = backendSource.slice(syncStart, syncEnd);
  assert.match(
    syncSource,
    /finishWithoutFittedMetrics[\s\S]*clearStyleProcessAtObservations/
  );
  assert.match(syncSource, /"no_metric_observations"/);
  assert.match(syncSource, /"no_initial_st_seeds"/);
});

test('assignment card AT uses hydrated v2 mirrors and fails closed on a missing process', () => {
  const rebuildStart = backendSource.indexOf(
    'const rebuildAssignmentCardsForOrg ='
  );
  const rebuildEnd = backendSource.indexOf(
    'const resolveAssignmentPlanPayrollLockMonth',
    rebuildStart
  );
  const rebuildSource = backendSource.slice(rebuildStart, rebuildEnd);
  const totalStart = backendSource.indexOf(
    'const calculateAssignmentCardTotalForOrderQuantity'
  );
  const totalEnd = backendSource.indexOf(
    'const calculateAssignmentCardStTotalForOrderQuantity',
    totalStart
  );
  const totalSource = backendSource.slice(totalStart, totalEnd);

  assert.match(rebuildSource, /initialProcessMirrorMap/);
  assert.match(rebuildSource, /processMirrorMap/);
  assert.match(rebuildSource, /styles:\s*hydratedStyles/);
  assert.match(totalSource, /if \(atTotal == null\) return null/);
});

test('backend AT mirrors constrained fitting, safe interpolation, and nearest-point extrapolation', () => {
  const resolveStart = backendSource.indexOf(
    'const resolveStyleProcessAtTotalSecondsForOrderQuantity'
  );
  const resolveEnd = backendSource.indexOf(
    'const resolveStyleProcessAtPerPieceSecondsForOrderQuantity',
    resolveStart
  );
  const resolveSource = backendSource.slice(resolveStart, resolveEnd);

  assert.ok(resolveStart >= 0);
  assert.match(resolveSource, /constrainedAtCandidates/);
  assert.match(resolveSource, /constrainedAtFit\.a \+ constrainedAtFit\.b \/ point\.quantity/);
  assert.match(resolveSource, /singleProcessLaborShare/);
  assert.match(resolveSource, /attendanceWeight/);
  assert.match(resolveSource, /threshold \/ Math\.abs\(residual\)/);
  assert.doesNotMatch(resolveSource, /intercept < 0/);
  assert.match(resolveSource, /if \(!Number\.isFinite\(slope\) \|\| slope <= 0\)/);
  assert.match(resolveSource, /const nearestPoint =/);
  assert.match(resolveSource, /resolvedOrderQuantity > maxQuantity \* 4/);
  assert.match(
    resolveSource,
    /nearestPoint\.totalSeconds \/ nearestPoint\.quantity/
  );
});

test('production start applies AT observation quality columns before launching the API', () => {
  const packageJson = JSON.parse(
    fs.readFileSync('backend/package.json', 'utf8')
  );
  assert.match(
    packageJson.scripts['prisma:apply:at-observation-quality'],
    /20260805153000_add_at_observation_quality\/migration\.sql/
  );
  assert.match(
    packageJson.scripts.start,
    /prisma:apply:at-observation-quality[\s\S]*node dist\/index\.js/
  );
});

test('AT reset clears legacy JSON for manufacturer-owned and related brand styles', () => {
  const resetStart = backendSource.indexOf('const resetAtTrainingStateForOrg');
  const resetEnd = backendSource.indexOf('const normalizeStylePayload', resetStart);
  const resetSource = backendSource.slice(resetStart, resetEnd);

  assert.match(resetSource, /FROM "OrgRelationship" AS relationship/);
  assert.match(resetSource, /relationship\."manufacturerOrgId" = \$\{orgId\}/);
  assert.match(resetSource, /relationship\."brandOrgId" = s\."orgId"/);
  assert.match(resetSource, /proc\.value - 'atParams' - 'at'/);
});

test('AT reset success is returned even when the follow-up status refresh fails', () => {
  const routeStart = backendSource.indexOf('app.post("/at-sync/reset"');
  const routeEnd = backendSource.indexOf('app.use(payrollRouter)', routeStart);
  const routeSource = backendSource.slice(routeStart, routeEnd);

  assert.ok(routeStart >= 0);
  assert.match(routeSource, /const result = await resetAtTrainingStateForOrg/);
  assert.match(routeSource, /try \{[\s\S]*buildAtSyncStatusForOrg/);
  assert.match(routeSource, /catch \(error\) \{[\s\S]*statusRefreshFailed = true/);
  assert.match(routeSource, /statusRefreshFailed,/);
});

test('AT reset follow-up reports a swallowed helper failure when rethrow mode rejects', async () => {
  const calls = [];
  const result = await runRefreshTasks([
    async () => {
      calls.push('styles');
      throw new Error('style refresh failed');
    },
    async () => {
      calls.push('status');
      return { needsUpdate: true };
    },
  ]);

  assert.deepEqual(calls, ['styles', 'status']);
  assert.equal(result.failed, true);
  assert.equal(result.results[0].status, 'rejected');
  assert.equal(result.results[1].status, 'fulfilled');
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

test('implausibly low fitted curve falls back to safe observed provisional AT', () => {
  const result = fitAtParamsWithProportionalAllocation([
    createDay({
      dayKey: '2026-05-31#286',
      order: 0,
      quantity: 300,
      eventCount: 28,
      laborInputSeconds: 8589.03306109015,
      sourceGroupKey: 'assignmentPlan:328',
    }),
    createDay({
      dayKey: '2026-06-30#297',
      order: 1,
      quantity: 200,
      eventCount: 29,
      laborInputSeconds: 7111.376615904082,
      sourceGroupKey: 'assignmentPlan:334',
    }),
  ], {
    initialPerPieceByMetricKey: new Map([[metricKey, 105]]),
  });

  const fitted = result.paramsByMetric.get(metricKey);
  assert.ok(fitted);
  assert.equal(fitted.fitStatus, 'USED_PROVISIONAL');
  assert.equal(fitted.fallbackReason, 'IMPLAUSIBLY_LOW_AT_PARAMS');
  assert.equal(fitted.b, 0);
  assert.ok(fitted.a >= 31 && fitted.a <= 32, `unexpected provisional a=${fitted.a}`);
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
      workerId: 11,
      laborInputSeconds: 10_000,
      processRows: [{
        metricKey,
        quantity: 100,
        eventCount: 1,
        sourceGroupKey: 'assignmentPlan:501',
        assignmentPlanId: 501,
      }],
    },
    {
      dayKey: '2026-06-30#worker:2',
      order: 1,
      workerId: 12,
      laborInputSeconds: 20_000,
      processRows: [{
        metricKey: siblingMetricKey,
        quantity: 100,
        eventCount: 1,
        sourceGroupKey: 'assignmentPlan:502',
        assignmentPlanId: 502,
      }],
    },
  ]);

  assert.equal(result.paramsByMetric.get(metricKey)?.a, 100);
  assert.equal(result.paramsByMetric.get(siblingMetricKey)?.a, 200);
  assert.deepEqual(
    result.allocatedObservations.map((row) => ({
      workerId: row.workerId,
      assignmentPlanId: row.assignmentPlanId,
      laborInputSeconds: row.laborInputSeconds,
    })),
    [
      { workerId: 11, assignmentPlanId: 501, laborInputSeconds: 10_000 },
      { workerId: 12, assignmentPlanId: 502, laborInputSeconds: 20_000 },
    ]
  );
});
